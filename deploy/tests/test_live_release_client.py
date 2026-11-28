"""LG-08/10: fixed transport/mutation boundaries. No auth/network/SQL."""
import copy
import json
import sys
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from live_release_client import GoogleLiveReleaseClient
from test_credential_proof import fixture

def target():return fixture()[0]['request']

class TransportBoundary(unittest.TestCase):
    def test_private_profile_cannot_override_instance_host_database_or_role(self):
        import base64,urllib.parse
        t=target();role=t['roles']['runtime']['name'];socket='/cloudsql/'+t['instance_connection_name']
        valid='postgresql://'+role+':SYNTHETIC-ONLY@localhost/'+t['database']+'?'+urllib.parse.urlencode({'host':socket})
        c=GoogleLiveReleaseClient();c.bind_target(t)
        for value in [valid.replace('@localhost','@attacker.example.test'),valid.replace('@localhost','@localhost:9999'),valid+'&options=unsafe',valid+'&options=',valid+'#override',
                      valid.replace(role,t['roles']['old']['name']),valid.replace('/'+t['database']+'?','/wrong?')]:
            c.request=Mock(return_value={'payload':{'data':base64.b64encode(value.encode()).decode()}})
            with self.assertRaises(ValueError):c._password(t,'runtime')

    def test_unbound_or_non_target_resources_and_mutation_methods_reject_before_token(self):
        c=GoogleLiveReleaseClient();c.token=Mock(side_effect=AssertionError('Must not authenticate'))
        with self.assertRaises(ValueError):c.request('https://run.googleapis.com/v2/'+target()['service'])
        c.bind_target(target())
        for method,url in [('GET','https://attacker.example.test/'),('PUT','https://sqladmin.googleapis.com/v1/projects/other/instances/db/users'),
                           ('POST','https://run.googleapis.com/v2/'+target()['job']+':run'),('DELETE','https://run.googleapis.com/v2/'+target()['service']),
                           ('GET','https://run.googleapis.com/v2/projects/other/locations/asia-southeast1/services/gather')]:
            with self.subTest(method=method,url=url):
                with self.assertRaises(ValueError):c.request(url,method=method)
        c.token.assert_not_called()

    def test_non_target_secret_payload_and_old_shared_secret_reject_before_token(self):
        c=GoogleLiveReleaseClient();c.bind_target(target());c.token=Mock(side_effect=AssertionError('Must not authenticate'))
        for r in ['projects/cp-fixture-project/secrets/other/versions/1','projects/cp-fixture-project/secrets/gather-database-url/versions/1']:
            with self.assertRaises(ValueError):c.request('https://secretmanager.googleapis.com/v1/'+r+':access',secret_resource=r)

    def test_client_cannot_switch_instance_or_project(self):
        c=GoogleLiveReleaseClient();c.bind_target(target());other=copy.deepcopy(target());other['database']='other'
        with self.assertRaises(ValueError):c.bind_target(other)

    def test_activation_uses_one_etag_patch_preserves_configuration_and_verifies_revision(self):
        t=target();c=GoogleLiveReleaseClient();calls=[]
        template={'revision':'old','serviceAccount':t['runtime_service_account'],'volumes':[{'name':'unchanged'}],
            'containers':[{'image':'immutable-image','env':[{'name':'DATABASE_URL','valueSource':{'secretKeyRef':{'secret':'runtime','version':'7'}}},
                {'name':'REGISTRATION_LIFECYCLE_WRITES_ENABLED','value':'false'},{'name':'OTHER','value':'private-sentinel'}]}]}
        old={'etag':'etag','uid':'uid','template':copy.deepcopy(template),'latestReadyRevision':t['service']+'/revisions/old'}
        new_template=copy.deepcopy(template);new_template['revision']='new';new_template['containers'][0]['env'][1]['value']='true'
        new={'template':new_template,'latestReadyRevision':t['service']+'/revisions/new','latestCreatedRevision':t['service']+'/revisions/new',
             'generation':'2','observedGeneration':'2','terminalCondition':{'state':'CONDITION_SUCCEEDED'},
             'trafficStatuses':[{'revision':'new','percent':100}]}
        revision={**new_template,'conditions':[{'type':'Ready','state':'CONDITION_SUCCEEDED'}]}
        gets=[old,new]
        def request(url,**kwargs):
            calls.append((url,copy.deepcopy(kwargs)))
            if kwargs.get('method')=='PATCH':return {'done':True}
            if '/revisions/' in url:return revision
            return gets.pop(0)
        c.request=request
        result=c.activate(t,{'observed':{'serviceEtag':'etag','serviceUid':'uid'}})
        self.assertTrue(result['verified']);self.assertEqual(len(calls),4)
        patches=[(u,k) for u,k in calls if k.get('method')=='PATCH'];self.assertEqual(len(patches),1)
        url,kwargs=patches[0];body=kwargs['body']
        self.assertEqual(body['etag'],'etag');self.assertEqual(set(body['template']),{'containers','revision'})
        self.assertEqual(body['template']['containers'],new_template['containers'])
        self.assertIn('template.revision',url);self.assertNotIn('jobs',url)

    def test_service_etag_drift_cannot_patch(self):
        c=GoogleLiveReleaseClient();c.request=Mock(return_value={'etag':'changed','uid':'uid'})
        with self.assertRaises(ValueError):c.activate(target(),{'observed':{'serviceEtag':'expected','serviceUid':'uid'}})
        self.assertEqual(c.request.call_count,1)

    def test_api_error_returns_no_sensitive_response_text(self):
        import urllib.error
        c=GoogleLiveReleaseClient();c.bind_target(target());c.token=lambda:'synthetic-token'
        c.opener.open=Mock(side_effect=urllib.error.HTTPError('url',403,'private-sentinel',None,None))
        with self.assertRaisesRegex(ValueError,'HTTP 403') as error:c.request('https://run.googleapis.com/v2/'+target()['service'])
        self.assertNotIn('private-sentinel',str(error.exception))


class SqlObservation(unittest.TestCase):
    """Catalog data doubles exercise actual role graph/profile parsing."""
    def prepare(self):
        import hashlib
        from live_release_client import ROOT,TABLES
        t=target();old=t['roles']['old']['name'];runtime=t['roles']['runtime']['name'];migrator=t['roles']['migrator']['name']
        state={'flags':[[old,t['roles']['old']['oid'],True,False,True,True,False,False],
                        [runtime,t['roles']['runtime']['oid'],True,False,False,False,False,False],
                        [migrator,t['roles']['migrator']['oid'],True,False,False,False,False,False]],
               'edges':[(old,migrator,False,True,True)],'runtimeCreate':False,'sessions':0,'ownerReady':True,'runtimeAcl':True,
               'owners':[(table,t['roles']['old']['oid']) for table in TABLES],
               'ledger':[(p.name,hashlib.sha256(p.read_bytes()).hexdigest()) for p in sorted((ROOT/'server/migrations').glob('*.sql'))]}
        class Cursor:
            def execute(self,sql,args=None):
                if sql.startswith('SELECT rolname'):self.result=state['flags']
                elif sql.startswith('SELECT p.rolname'):self.result=state['edges']
                elif sql.startswith('SELECT has_schema_privilege(current_user'):self.result=[(state['runtimeAcl'],)]
                elif sql.startswith('SELECT has_schema_privilege'):self.result=[(state['runtimeCreate'],)]
                elif sql.startswith('SELECT c.relname'):self.result=state['owners']
                elif sql.startswith('SELECT name,checksum'):self.result=state['ledger']
                elif sql.startswith('SELECT count(*)'):self.result=[(state['sessions'],)]
                elif sql.startswith('SELECT current_user'):self.result=[(old,True,state['ownerReady'])]
                else:self.result=[]
            def fetchall(self):return self.result
            def fetchone(self):return self.result[0]
        c=GoogleLiveReleaseClient()
        c.request=Mock(return_value={'connectionName':t['instance_connection_name'],'databaseVersion':'POSTGRES_17'})
        @contextmanager
        def connection(target,kind):yield Cursor()
        c.connection=connection
        return t,state,c

    def test_actual_catalog_bindings_and_reviewed_owner_profile_are_observed(self):
        t,state,c=self.prepare();r=c.sql_configuration(t)
        self.assertTrue(r['replacementProfilesVerified']);self.assertEqual(r['roles'],t['roles'])
        self.assertEqual(r['oldSessionCount'],0);self.assertEqual(r['migrationProfile']['inherit'],True)
        self.assertEqual(r['oldRoleAttributes'],{'login':True,'createrole':True,'createdb':True})

    def test_runtime_owner_or_indirect_privilege_and_migration_admin_paths_reject(self):
        for kind in ('runtime-owner','runtime-super','migration-super','migration-admin','schema','owner-schema','login','old-super','acl','table-owner','ledger'):
            with self.subTest(kind=kind):
                t,s,c=self.prepare();o=t['roles']['old']['name'];r=t['roles']['runtime']['name'];m=t['roles']['migrator']['name']
                if kind=='runtime-owner':s['edges'].append((o,r,False,False,True))
                elif kind=='runtime-super':s['edges'] += [('intermediate',r,False,True,True),('cloudsqlsuperuser','intermediate',False,True,True)]
                elif kind=='migration-super':s['edges'].append(('cloudsqlsuperuser',m,False,True,True))
                elif kind=='migration-admin':s['edges'] += [('intermediate',m,False,True,True),(o,'intermediate',True,False,True)]
                elif kind=='schema':s['runtimeCreate']=True
                elif kind=='owner-schema':s['ownerReady']=False
                elif kind=='old-super':s['flags'][0][3]=True
                elif kind=='acl':s['runtimeAcl']=False
                elif kind=='table-owner':s['owners'][0]=(s['owners'][0][0],9999)
                elif kind=='ledger':s['ledger'][0]=(s['ledger'][0][0],'different')
                else:s['flags'][1][2]=False
                self.assertFalse(c.sql_configuration(t)['replacementProfilesVerified'])

    def test_observation_reports_changed_oid_and_sessions_instead_of_copying_expected_values(self):
        t,s,c=self.prepare();s['flags'][1][1]+=10;s['sessions']=4
        r=c.sql_configuration(t)
        self.assertNotEqual(r['roles'],t['roles']);self.assertEqual(r['oldSessionCount'],4)

    def test_admin_api_instance_mismatch_prevents_any_sql_connection(self):
        t,s,c=self.prepare();c.request=Mock(return_value={'connectionName':'other','databaseVersion':'POSTGRES_17'})
        c.connection=Mock(side_effect=AssertionError('No connection allowed'))
        with self.assertRaises(ValueError):c.sql_configuration(t)
        c.connection.assert_not_called()

if __name__=='__main__':unittest.main(verbosity=2)
