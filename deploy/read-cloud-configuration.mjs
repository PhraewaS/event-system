// Explicit read-only operator library: no CLI, ambient credentials, SQL or mutation clients.
class ReadbackError extends Error { constructor(code){super(code);this.code=code;} }
const check=(ok,code)=>{if(!ok)throw new ReadbackError(code);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const nonempty=value=>typeof value==='string'&&value.length>0;
const unfinished=['sql_database_name','sql_role_names_and_oids','source_commit_sha',
  'all_writer_inventory_and_permissions','other_environment_and_secret_settings','atomic_mutation_binding'];

function expectedShape(t){
  check(t&&/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(t.project),'INVALID_EXPECTED_TARGET');
  const parts=t.instance_connection_name?.split(':');
  check(parts?.length===3&&parts[0]===t.project&&/^[a-z0-9-]+$/.test(parts[1])&&/^[a-z][a-z0-9-]*$/.test(parts[2]),'INVALID_EXPECTED_TARGET');
  const prefix=`projects/${t.project}/locations/${parts[1]}`;
  check(new RegExp(`^${prefix}/services/[a-z][a-z0-9-]*$`).test(t.service)&&
    new RegExp(`^${prefix}/jobs/[a-z][a-z0-9-]*$`).test(t.job),'INVALID_EXPECTED_TARGET');
  check(/^sha256:[0-9a-f]{64}$/.test(t.image_digest)&&/^[a-z_][a-z0-9_]{0,62}$/.test(t.roles?.old?.name),'INVALID_EXPECTED_TARGET');
  for(const key of ['runtime_service_account','migrator_service_account'])
    check(new RegExp(`^[a-z][a-z0-9-]*@${t.project}\\.iam\\.gserviceaccount\\.com$`).test(t[key]),'INVALID_EXPECTED_TARGET');
  check(t.runtime_service_account!==t.migrator_service_account,'SHARED_WORKLOAD_IDENTITY');
  return {project:t.project,region:parts[1],instance:parts[2],service:t.service,job:t.job};
}

export async function collectCloudConfiguration({expected,client,clock=Date.now}){
  const start=clock();
  const report={scope:'CLOUD_RUN_SQL_ATTACHMENT_SECRET_METADATA_ONLY',readOnly:true,cloudFieldsMatch:false,
    releaseActivationAllowed:false,notVerified:[...unfinished],reasons:[]};
  try{
    const settings=expectedShape(expected);
    const read=async(fn)=>{check(clock()>=start&&clock()-start<=60000,'READBACK_TIME_BUDGET');return fn();};
    const project=await read(()=>client.readProject());
    check(project?.projectId===expected.project&&/^projects\/[1-9][0-9]*$/.test(project.name)&&project.state==='ACTIVE','PROJECT_BINDING_UNKNOWN');
    const number=project.name.split('/')[1];
    const canonical=(name)=>{
      check(nonempty(name),'RESOURCE_IDENTITY_UNKNOWN');
      const parts=name.split('/');
      check(parts[0]==='projects'&&[expected.project,number].includes(parts[1]),'CROSS_PROJECT_RESOURCE');
      parts[1]=expected.project;return parts.join('/');
    };
    const revisionName=(name)=>{
      check(nonempty(name),'REVISION_UNKNOWN');
      const full=name.includes('/')?canonical(name):`${expected.service}/revisions/${name}`;
      check(new RegExp(`^${expected.service}/revisions/[a-z][a-z0-9-]*$`).test(full),'REVISION_IDENTITY_MISMATCH');
      return full;
    };
    const secretVersion=(name)=>{
      const full=canonical(name);
      check(new RegExp(`^projects/${expected.project}/secrets/[A-Za-z0-9_-]+/versions/[1-9][0-9]*$`).test(full),'SECRET_VERSION_NOT_PINNED');
      return full;
    };
    const wantedRuntime=secretVersion(expected.runtime_secret_version),wantedMigrator=secretVersion(expected.migrator_secret_version);
    check(wantedRuntime.split('/versions/')[0]!==wantedMigrator.split('/versions/')[0],'SHARED_DATABASE_SECRET');
    const stableResource=(value,wanted,kind)=>{
      check(value&&canonical(value.name)===wanted,`${kind}_IDENTITY_MISMATCH`);
      check(nonempty(value.etag)&&nonempty(value.uid)&&nonempty(value.generation)&&
        value.generation===value.observedGeneration&&value.reconciling!==true&&
        value.terminalCondition?.state==='CONDITION_SUCCEEDED',`${kind}_NOT_STABLE`);
    };
    const service=await read(()=>client.readService());stableResource(service,expected.service,'SERVICE');
    check(Array.isArray(service.trafficStatuses)&&service.trafficStatuses.length===1&&
      service.trafficStatuses[0].percent===100&&!service.trafficStatuses[0].tag&&
      Array.isArray(service.traffic)&&service.traffic.every(t=>!t.tag),'TRAFFIC_NOT_EXCLUSIVE');
    const serving=revisionName(service.trafficStatuses[0].revision);
    check(serving===revisionName(expected.pre_activation_revision)&&serving===revisionName(service.latestReadyRevision)&&
      serving===revisionName(service.latestCreatedRevision),'REVISION_DRIFT');
    const revision=await read(()=>client.readRevision(serving));
    check(revision&&canonical(revision.name)===serving&&canonical(revision.service)===expected.service&&nonempty(revision.uid)&&
      revision.reconciling!==true&&Array.isArray(revision.conditions)&&revision.conditions.filter(c=>c.type==='Ready').length===1&&
      revision.conditions.some(c=>c.type==='Ready'&&c.state==='CONDITION_SUCCEEDED'),'REVISION_NOT_READY');
    const job=await read(()=>client.readJob());stableResource(job,expected.job,'JOB');
    const instance=await read(()=>client.readInstance());
    check(instance?.project===expected.project&&instance.name===settings.instance&&
      instance.connectionName===expected.instance_connection_name&&instance.databaseVersion==='POSTGRES_17','SQL_INSTANCE_MISMATCH');
    const image=`${settings.region}-docker.pkg.dev/${expected.project}/gather/gather@${expected.image_digest}`;
    const parseProfile=(value,kind,isJob=false)=>{
      check(value&&Array.isArray(value.containers)&&value.containers.length===1,`${kind}_CONTAINER_TOPOLOGY`);
      const container=value.containers[0];
      check(container.image===image,`${kind}_IMAGE_MISMATCH`);
      let identity=value.serviceAccount;
      if(identity?.includes('/')){
        const full=canonical(identity);
        check(full.startsWith(`projects/${expected.project}/serviceAccounts/`)&&full.split('/').length===4,`${kind}_IDENTITY_MISMATCH`);
        identity=full.split('/').at(-1);
      }
      check(identity===(isJob?expected.migrator_service_account:expected.runtime_service_account),`${kind}_IDENTITY_MISMATCH`);
      check(same(container.command??[],isJob?['node']:[])&&same(container.args??[],isJob?['dist/server/migrate.js']:[]),`${kind}_COMMAND_OVERRIDE`);
      const mounted=(value.volumes??[]).flatMap(v=>v.cloudSqlInstance?.instances??[]);
      check(same(mounted,[expected.instance_connection_name]),`${kind}_SQL_ATTACHMENT_MISMATCH`);
      check(Array.isArray(container.env),'ENVIRONMENT_UNKNOWN');
      const find=(name)=>{const vars=container.env.filter(e=>e.name===name);check(vars.length===1,'ENVIRONMENT_UNKNOWN');return vars[0];};
      const database=find('DATABASE_URL');
      check(!Object.hasOwn(database,'value')&&database.valueSource?.secretKeyRef,'DATABASE_URL_NOT_SECRET_REFERENCE');
      const ref=database.valueSource.secretKeyRef;
      const name=ref.secret?.includes('/')?canonical(ref.secret):`projects/${expected.project}/secrets/${ref.secret}`;
      const version=secretVersion(`${name}/versions/${ref.version}`);
      check(version===(isJob?wantedMigrator:wantedRuntime),`${kind}_SECRET_VERSION_MISMATCH`);
      const flag=find(isJob?'MIGRATION_OWNER_ROLE':'REGISTRATION_LIFECYCLE_WRITES_ENABLED');
      check(!flag.valueSource&&flag.value===(isJob?expected.roles.old.name:'false'),isJob?'MIGRATION_OWNER_PROFILE_MISMATCH':'LIFECYCLE_NOT_DISABLED');
      return {serviceAccount:identity,image,instance:expected.instance_connection_name,databaseSecretVersion:version};
    };
    const live=parseProfile(revision,'SERVING');
    parseProfile(service.template,'TEMPLATE');
    const migration=parseProfile(job.template?.template,'JOB',true);
    let token='',pages=0;const seen=new Set();
    do{
      check(pages++<10&&!seen.has(token),'EXECUTION_PAGINATION_UNKNOWN');seen.add(token);
      const page=await read(()=>client.listExecutions(token));
      check(page&&Array.isArray(page.executions??[]),'EXECUTION_VISIBILITY_UNKNOWN');
      check(!(page.executions??[]).some(e=>!nonempty(e.completionTime)),'JOB_EXECUTION_ACTIVE_OR_UNKNOWN');
      token=page.nextPageToken??'';check(typeof token==='string'&&token.length<=4096,'EXECUTION_PAGINATION_UNKNOWN');
    }while(token);
    for(const version of [wantedRuntime,wantedMigrator]){
      const first=await read(()=>client.readSecretVersion(version));
      check(first&&secretVersion(first.name)===version&&first.state==='ENABLED','SECRET_DISABLED_OR_UNKNOWN');
    }
    // No retries: changing metadata invalidates this observation rather than mixing versions.
    const serviceAgain=await read(()=>client.readService()),jobAgain=await read(()=>client.readJob());
    stableResource(serviceAgain,expected.service,'SERVICE');stableResource(jobAgain,expected.job,'JOB');
    check(serviceAgain.uid===service.uid&&serviceAgain.etag===service.etag&&same(serviceAgain.trafficStatuses,service.trafficStatuses)&&
      same(serviceAgain.template,service.template)&&serviceAgain.latestCreatedRevision===service.latestCreatedRevision&&
      jobAgain.uid===job.uid&&jobAgain.etag===job.etag&&same(jobAgain.template,job.template),'CONFIG_CHANGED_DURING_READBACK');
    for(const version of [wantedRuntime,wantedMigrator]){
      const metadata=await read(()=>client.readSecretVersion(version));
      check(metadata&&secretVersion(metadata.name)===version&&metadata.state==='ENABLED','SECRET_CHANGED_DURING_READBACK');
    }
    check(clock()>=start&&clock()-start<=60000,'READBACK_TIME_BUDGET');
    return {...report,cloudFieldsMatch:true,observedAt:new Date(clock()).toISOString(),
      observed:{project:expected.project,projectNumber:number,service:expected.service,job:expected.job,
        servingRevision:serving,revisionUid:revision.uid,serviceUid:service.uid,serviceEtag:service.etag,
        jobUid:job.uid,jobEtag:job.etag,runtime:live,migrator:migration},durationMs:clock()-start};
  }catch(error){return {...report,reasons:[error instanceof ReadbackError?error.code:'READBACK_UNAVAILABLE']};}
}

/** GET-only endpoint capabilities; cannot fetch arbitrary URLs or SecretVersion :access. */
export function cloudConfigurationClient({expected,tokenProvider,fetchImpl=globalThis.fetch}){
  const s=expectedShape(expected);check(typeof tokenProvider==='function','TOKEN_PROVIDER_REQUIRED');
  const get=async(url)=>{
    try{
      const token=await tokenProvider();check(nonempty(token),'TOKEN_PROVIDER_REQUIRED');
      const response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
      check(response.ok,'CLOUD_READ_FAILED');return await response.json();
    }catch{throw new ReadbackError('CLOUD_READ_FAILED');}
  };
  const run='https://run.googleapis.com/v2/';
  return Object.freeze({
    readProject:()=>get(`https://cloudresourcemanager.googleapis.com/v3/projects/${s.project}`),
    readService:()=>get(run+s.service),readJob:()=>get(run+s.job),
    readRevision:(name)=>{check(new RegExp(`^${s.service}/revisions/[a-z][a-z0-9-]*$`).test(name),'REVISION_IDENTITY_MISMATCH');return get(run+name);},
    readInstance:()=>get(`https://sqladmin.googleapis.com/v1/projects/${s.project}/instances/${s.instance}`),
    readSecretVersion:(name)=>{check(new RegExp(`^projects/${s.project}/secrets/[A-Za-z0-9_-]+/versions/[1-9][0-9]*$`).test(name),'SECRET_VERSION_NOT_PINNED');return get('https://secretmanager.googleapis.com/v1/'+name);},
    listExecutions:(pageToken='')=>{check(typeof pageToken==='string'&&pageToken.length<=4096,'EXECUTION_PAGINATION_UNKNOWN');const query=new URLSearchParams({pageSize:'100',...(pageToken?{pageToken}:{})});return get(run+s.job+'/executions?'+query);},
  });
}
