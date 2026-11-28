import {readFileSync} from 'node:fs';
export function cloudFixture(){
  const plan=JSON.parse(readFileSync(new URL('../../docs/tests/cloudsql-credential-retirement-cases.json',import.meta.url),'utf8'));
  const expected=structuredClone(plan.future_activation_fixture.matching_proof_readback_request_target);
  const project={projectId:expected.project,name:'projects/12345678901',state:'ACTIVE'};
  const revisionName=`${expected.service}/revisions/${expected.pre_activation_revision}`;
  const secret=(full:string)=>{const parts=full.split('/');return {secret:parts.slice(0,-2).join('/'),version:parts.at(-1)};};
  const image=`asia-southeast1-docker.pkg.dev/${expected.project}/gather/gather@${expected.image_digest}`;
  const profile=(job=false)=>({serviceAccount:job?expected.migrator_service_account:expected.runtime_service_account,
    containers:[{image,command:job?['node']:[],args:job?['dist/server/migrate.js']:[],env:[
      {name:'DATABASE_URL',valueSource:{secretKeyRef:secret(job?expected.migrator_secret_version:expected.runtime_secret_version)}},
      {name:job?'MIGRATION_OWNER_ROLE':'REGISTRATION_LIFECYCLE_WRITES_ENABLED',value:job?expected.roles.old.name:'false'},
      {name:'OTHER_PRIVATE_LITERAL',value:'NEVER_RETURN_THIS_SENTINEL'},
    ]}],volumes:[{name:'cloudsql',cloudSqlInstance:{instances:[expected.instance_connection_name]}}]});
  const service={name:expected.service,uid:'service-uid',etag:'service-etag',generation:'3',observedGeneration:'3',
    terminalCondition:{state:'CONDITION_SUCCEEDED'},reconciling:false,
    template:profile(),latestReadyRevision:revisionName,latestCreatedRevision:revisionName,
    traffic:[{revision:revisionName,percent:100}],trafficStatuses:[{revision:revisionName,percent:100}]};
  const revision={name:revisionName,service:expected.service,uid:'revision-uid',reconciling:false,
    conditions:[{type:'Ready',state:'CONDITION_SUCCEEDED'}],...profile()};
  const job={name:expected.job,uid:'job-uid',etag:'job-etag',generation:'2',observedGeneration:'2',
    terminalCondition:{state:'CONDITION_SUCCEEDED'},reconciling:false,template:{template:profile(true)}};
  const instance={name:'cp-fixture-pg',project:expected.project,connectionName:expected.instance_connection_name,databaseVersion:'POSTGRES_17'};
  const secretVersions:any={};for(const name of [expected.runtime_secret_version,expected.migrator_secret_version])secretVersions[name]={name,state:'ENABLED'};
  const data={project,service,revision,job,instance,secretVersions,executions:[] as any[]};
  const calls:string[]=[];const copy=(x:any)=>structuredClone(x);
  const client={readProject:async()=>{calls.push('project');return copy(data.project);},
    readService:async()=>{calls.push('service');return copy(data.service);},
    readRevision:async()=>{calls.push('revision');return copy(data.revision);},
    readJob:async()=>{calls.push('job');return copy(data.job);},
    readInstance:async()=>{calls.push('instance');return copy(data.instance);},
    readSecretVersion:async(name:string)=>{calls.push('secret');return copy(data.secretVersions[name]);},
    listExecutions:async()=>{calls.push('executions');return {executions:copy(data.executions)};}};
  return {expected,data,client,calls,clock:()=>Date.parse('2026-11-28T08:00:00Z')};
}
