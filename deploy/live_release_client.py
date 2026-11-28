"""Fixed-endpoint operator adapter for live_release_gate; no actions at import.

Explicit execution capability: conditional lifecycle-only Cloud Run PATCH.
There is no SQL mutation beyond transaction-scoped SHARE locks/SET LOCAL ROLE,
and no password/user/session/IAM/job/traffic-fallback/build/seed capability.
"""
import base64
import copy
import json
import logging
import os
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from verify_credential_fence import validate_target

ROOT=Path(__file__).resolve().parents[1]
TABLES=('events','login_rate_limits','registrations','schema_migrations','session','users')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise ValueError('Redirect rejected.')


class GoogleLiveReleaseClient:
    def __init__(self):
        self.connector=None
        self.target=None
        self.opener=urllib.request.build_opener(NoRedirect())

    def bind_target(self,target):
        validate_target(target)
        if self.target is not None and self.target!=target:raise ValueError('Operator client cannot switch targets.')
        self.target=copy.deepcopy(target)

    def __enter__(self):return self
    def __exit__(self,*args):
        if self.connector:self.connector.close()

    def command(self,args,*,stdin=None,timeout=30):
        result=subprocess.run(args,cwd=ROOT,input=stdin,capture_output=True,text=True,
                              timeout=timeout,check=False,encoding='utf-8')
        if result.returncode:raise ValueError('Operator command unavailable.')
        return result.stdout.strip()

    def token(self):
        executable='gcloud.cmd' if os.name=='nt' else 'gcloud'
        token=self.command([executable,'auth','print-access-token','--quiet','--verbosity=error'])
        if not token:raise ValueError('Operator login required.')
        return token

    def execution_source(self):
        sha=self.command(['git','rev-parse','HEAD'])
        # Include staged, unstaged and untracked non-ignored files. Private proof
        # belongs outside the checkout; ignored installed dependencies are allowed.
        dirty=self.command(['git','status','--porcelain','--untracked-files=all'])
        return {'sha':sha,'clean':not dirty}

    def request(self,url,*,body=None,method='GET',secret_resource=None):
        if self.target is None:raise ValueError('Fixed target required before authentication.')
        t=self.target;region=t['instance_connection_name'].split(':')[1]
        run='https://run.googleapis.com/v2/'
        operation_prefix=f"projects/{t['project']}/locations/{region}"
        allowed=method=='GET' and (url==run+t['service'] or
            re.fullmatch(re.escape(run+t['service'])+r'/revisions/[a-z][a-z0-9-]*',url) or
            re.fullmatch(re.escape(run+operation_prefix)+r'/operations/[A-Za-z0-9_-]+',url) or
            url==f"https://sqladmin.googleapis.com/v1/projects/{t['project']}/instances/{t['instance_connection_name'].split(':')[2]}")
        if method=='PATCH':
            allowed=(url==run+t['service']+'?updateMask=template.containers%2Ctemplate.revision%2Ctraffic' and
                isinstance(body,dict) and set(body)=={'name','etag','template','traffic'} and body['name']==t['service'] and
                isinstance(body['etag'],str) and bool(body['etag']) and set(body['template'])=={'containers','revision'} and
                body['template']['revision']=='' and body['traffic']==[{'type':'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST','percent':100}])
        if secret_resource:
            allowed=(secret_resource in (t['runtime_secret_version'],t['migrator_secret_version']) and method=='GET' and
                     '/secrets/gather-database-url/' not in secret_resource and
                     url=='https://secretmanager.googleapis.com/v1/'+secret_resource+':access')
        if not allowed:raise ValueError('Endpoint not allowed.')
        req=urllib.request.Request(url,data=None if body is None else json.dumps(body).encode('utf-8'),
            method=method,headers={'Authorization':'Bearer '+self.token(),'Content-Type':'application/json'})
        try:
            with self.opener.open(req,timeout=25) as response:return json.load(response)
        except urllib.error.HTTPError as error:raise ValueError('Google operation rejected: HTTP '+str(error.code)) from None

    def cloud_configuration(self,target):
        self.bind_target(target)
        private=json.dumps({'expected':target,'accessToken':self.token()})
        result=self.command(['node',str(ROOT/'deploy/read-cloud-for-release.mjs')],stdin=private,timeout=80)
        if len(result)>262144:raise ValueError('Oversized metadata result.')
        return json.loads(result)

    def image_digest(self,target):
        region=target['instance_connection_name'].split(':')[1]
        image=f"{region}-docker.pkg.dev/{target['project']}/gather/gather:{target['image_sha']}"
        executable='gcloud.cmd' if os.name=='nt' else 'gcloud'
        full=self.command([executable,'artifacts','docker','images','describe',image,
            '--project='+target['project'],'--format=value(image_summary.fully_qualified_digest)'])
        expected=f"{region}-docker.pkg.dev/{target['project']}/gather/gather@{target['image_digest']}"
        if full!=expected:raise ValueError('Approved tag/digest mapping mismatch.')
        return target['image_digest']

    def _password(self,target,kind):
        resource=target[kind+'_secret_version']
        # validate_target has already required the same project, distinct secrets
        # and full numeric versions. Nothing can fetch the legacy shared secret.
        if not re.fullmatch(re.escape('projects/'+target['project']+'/secrets/')+r'[A-Za-z0-9_-]+/versions/[1-9][0-9]*',resource):
            raise ValueError('Pinned secret required.')
        value=self.request('https://secretmanager.googleapis.com/v1/'+resource+':access',secret_resource=resource)
        private=base64.b64decode(value['payload']['data'],validate=True).decode('utf-8')
        url=urllib.parse.urlsplit(private)
        if (url.scheme!='postgresql' or url.username!=target['roles'][kind]['name'] or url.hostname!='localhost' or url.port is not None or url.fragment or
            url.path!='/'+target['database'] or not url.password or
            urllib.parse.parse_qs(url.query,keep_blank_values=True)!={'host':['/cloudsql/'+target['instance_connection_name']]}):
            raise ValueError('Private SQL profile binding mismatch.')
        return urllib.parse.unquote(url.password)

    @contextmanager
    def connection(self,target,kind):
        # Optional operator dependency, never part of the application runtime.
        from google.cloud.sql.connector import Connector
        from google.oauth2.credentials import Credentials
        if self.connector is None:
            logging.getLogger('google.cloud.sql.connector').setLevel(logging.CRITICAL)
            self.connector=Connector(credentials=Credentials(token=self.token()),refresh_strategy='LAZY',timeout=30)
        password=self._password(target,kind)
        conn=self.connector.connect(target['instance_connection_name'],'pg8000',
            user=target['roles'][kind]['name'],password=password,db=target['database'],timeout=20)
        del password
        conn.autocommit=True
        try:
            cur=conn.cursor();cur.execute("SET statement_timeout='10s'");cur.execute("SET lock_timeout='3s'")
            cur.execute('SELECT current_database(),session_user,current_user')
            if tuple(cur.fetchone())!=(target['database'],target['roles'][kind]['name'],target['roles'][kind]['name']):
                raise ValueError('SQL connection identity mismatch.')
            yield cur
        finally:
            try:conn.rollback()
            finally:conn.close()

    def sql_configuration(self,target):
        self.bind_target(target)
        instance=self.request(f"https://sqladmin.googleapis.com/v1/projects/{target['project']}/instances/{target['instance_connection_name'].split(':')[2]}")
        if instance.get('connectionName')!=target['instance_connection_name'] or instance.get('databaseVersion')!='POSTGRES_17':
            raise ValueError('SQL Admin instance binding mismatch.')
        old=target['roles']['old']['name'];runtime=target['roles']['runtime']['name'];migrator=target['roles']['migrator']['name']
        with self.connection(target,'runtime') as cur:
            cur.execute('BEGIN READ ONLY')
            cur.execute('SELECT rolname,oid,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN (%s,%s,%s)',(old,runtime,migrator))
            flags={r[0]:r for r in cur.fetchall()}
            if set(flags)!={old,runtime,migrator}:raise ValueError('Missing SQL roles.')
            cur.execute('SELECT p.rolname,c.rolname,m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m JOIN pg_roles p ON p.oid=m.roleid JOIN pg_roles c ON c.oid=m.member')
            edges=cur.fetchall()
            def reachable(name,stop=None):
                found={name}
                while True:
                    before=len(found)
                    for parent,child,*_ in edges:
                        if child!=stop and child in found:found.add(parent)
                    if len(found)==before:return found
            parent=[e for e in edges if e[0]==old and e[1]==migrator]
            profile=parent[0] if len(parent)==1 else None
            indirect_admin=any(e[0]==old and e[2] and e[1] in reachable(migrator) for e in edges)
            cur.execute("SELECT has_schema_privilege(%s,'public','CREATE')",(runtime,));runtime_create=cur.fetchone()[0]
            cur.execute('SELECT count(*) FROM pg_stat_activity WHERE usesysid=%s',(target['roles']['old']['oid'],));sessions=cur.fetchone()[0]
            require_flags=all(flags[n][2] and not any(flags[n][3:]) for n in (runtime,migrator))
            verified=(require_flags and old not in reachable(runtime) and 'cloudsqlsuperuser' not in reachable(runtime)
                and 'cloudsqlsuperuser' not in reachable(migrator,old) and not runtime_create and profile is not None
                and profile[2] is False and profile[4] is True and not indirect_admin)
            old_flags={'login':flags[old][2],'createrole':flags[old][5],'createdb':flags[old][4]}
            roles={kind:{'name':v['name'],'oid':flags[v['name']][1]} for kind,v in target['roles'].items()}
            old_parents=sorted(e[0] for e in edges if e[1]==old)
            cur.execute('ROLLBACK')
        # Verify the pinned migrator secret authenticates and its owner profile is
        # usable, rather than inferring that from a role grant alone.
        with self.connection(target,'migrator') as cur:
            cur.execute('BEGIN READ ONLY');cur.execute('SET LOCAL ROLE "'+old+'"')
            cur.execute("SELECT current_user,has_schema_privilege(current_user,'public','USAGE'),has_schema_privilege(current_user,'public','CREATE')")
            owner=cur.fetchone();verified=verified and tuple(owner)==(old,True,True)
            cur.execute('ROLLBACK')
        return {'instance':target['instance_connection_name'],'database':target['database'],'roles':roles,
            'replacementProfilesVerified':bool(verified),'oldSessionCount':sessions,'oldRoleAttributes':old_flags,
            'oldMemberships':old_parents,'migrationProfile':{'ownerRole':old,'admin':profile[2] if profile else None,
                'inherit':profile[3] if profile else None,'set':profile[4] if profile else None}}

    @contextmanager
    def write_freeze(self,target):
        with self.connection(target,'migrator') as cur:
            cur.execute('BEGIN');cur.execute('SET LOCAL ROLE "'+target['roles']['old']['name']+'"')
            # Fixed existing objects only, no caller-controlled SQL identifiers.
            cur.execute('LOCK TABLE '+','.join('public.'+t for t in TABLES)+' IN SHARE MODE')
            try:yield True
            finally:cur.execute('ROLLBACK')

    def activate(self,target,observation):
        self.bind_target(target)
        url='https://run.googleapis.com/v2/'+target['service']
        service=self.request(url)
        if service.get('etag')!=observation['observed']['serviceEtag'] or service.get('uid')!=observation['observed']['serviceUid']:
            raise ValueError('Service changed before conditional update.')
        containers=copy.deepcopy(service['template']['containers'])
        flags=[e for e in containers[0]['env'] if e.get('name')=='REGISTRATION_LIFECYCLE_WRITES_ENABLED']
        if len(flags)!=1 or flags[0].get('value')!='false' or 'valueSource' in flags[0]:raise ValueError('Lifecycle baseline changed.')
        flags[0]['value']='true'
        body={'name':target['service'],'etag':service['etag'],'template':{'containers':containers,'revision':''},
              'traffic':[{'type':'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST','percent':100}]}
        op=self.request(url+'?updateMask=template.containers%2Ctemplate.revision%2Ctraffic',method='PATCH',body=body)
        deadline=time.monotonic()+180
        while not op.get('done'):
            name=op.get('name','')
            if not re.fullmatch(re.escape(target['service'].split('/services/')[0])+r'/operations/[A-Za-z0-9_-]+',name) or time.monotonic()>deadline:
                raise ValueError('Service operation outcome unknown; do not retry automatically.')
            time.sleep(1);op=self.request('https://run.googleapis.com/v2/'+name)
        if op.get('error'):raise ValueError('Conditional service operation failed.')
        current=self.request(url)
        def revision_name(value):
            if not isinstance(value,str) or not value:return ''
            return value if '/' in value else target['service']+'/revisions/'+value
        revision=revision_name(current.get('latestReadyRevision'))
        expected_template=copy.deepcopy(service['template']);expected_template['containers']=containers
        # Server-managed revision name is expected to change; no other template
        # setting may be silently replaced by the release operation.
        new_template=copy.deepcopy(current.get('template',{}));expected_template.pop('revision',None);new_template.pop('revision',None)
        traffic=current.get('trafficStatuses',[])
        verified=(new_template==expected_template and revision_name(current.get('latestCreatedRevision'))==revision
            and revision!=revision_name(service.get('latestReadyRevision')) and current.get('reconciling') is not True
            and current.get('generation')==current.get('observedGeneration')
            and current.get('terminalCondition',{}).get('state')=='CONDITION_SUCCEEDED'
            and len(traffic)==1 and traffic[0].get('percent')==100 and revision_name(traffic[0].get('revision'))==revision and not traffic[0].get('tag'))
        if verified:
            actual=self.request('https://run.googleapis.com/v2/'+revision)
            verified=(actual.get('containers')==containers and actual.get('serviceAccount')==expected_template.get('serviceAccount')
                and actual.get('volumes')==expected_template.get('volumes') and actual.get('reconciling') is not True
                and any(c.get('type')=='Ready' and c.get('state')=='CONDITION_SUCCEEDED' for c in actual.get('conditions',[])))
        return {'revision':revision,'verified':verified}
