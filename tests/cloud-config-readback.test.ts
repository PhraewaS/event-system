import {expect,test} from 'vitest';
// @ts-expect-error operator-only native JS
import {collectCloudConfiguration,cloudConfigurationClient} from '../deploy/read-cloud-configuration.mjs';
import {cloudFixture} from './fixtures/cloud-config-readback.js';

test('RB-01 / matching observations verify cloud fields without authorizing activation',async()=>{
  const f=cloudFixture();const r=await collectCloudConfiguration(f);
  expect(r.cloudFieldsMatch).toBe(true);expect(r.releaseActivationAllowed).toBe(false);
  expect(r.notVerified).toContain('sql_role_names_and_oids');expect(r.notVerified).toContain('source_commit_sha');
  expect(f.calls).toContain('revision');expect(f.calls.filter(x=>x==='service')).toHaveLength(2);
  expect(JSON.stringify(r)).not.toContain('NEVER_RETURN_THIS_SENTINEL');
});
const changes:[string,(f:ReturnType<typeof cloudFixture>)=>void][]=[
 ['RB-02 serving digest',f=>{f.data.revision.containers[0].image+='bad';}],
 ['RB-02 desired template digest',f=>{f.data.service.template.containers[0].image+='bad';}],
 ['RB-02 migration identity',f=>{f.data.job.template.template.serviceAccount=f.expected.runtime_service_account;}],
 ['RB-02 attachment',f=>{f.data.revision.volumes[0].cloudSqlInstance.instances=['other:region:instance'];}],
 ['RB-02 actual secret version',f=>{f.data.revision.containers[0].env[0].valueSource!.secretKeyRef.version='99';}],
 ['RB-03 split traffic',f=>{f.data.service.trafficStatuses.push({...f.data.service.trafficStatuses[0],percent:1});}],
 ['RB-03 tagged route',f=>{(f.data.service.trafficStatuses[0] as any).tag='old';}],
 ['RB-03 revision drift',f=>{f.data.service.latestCreatedRevision+='new';}],
 ['RB-03 reconciling',f=>{f.data.service.reconciling=true;}],
 ['RB-03 generation lag',f=>{f.data.job.observedGeneration='1';}],
 ['RB-03 failed readiness',f=>{f.data.revision.conditions[0].state='CONDITION_FAILED';}],
 ['RB-03 duplicate readiness',f=>{f.data.revision.conditions.push({type:'Ready',state:'CONDITION_FAILED'});}],
 ['RB-04 latest alias',f=>{f.expected.runtime_secret_version=f.expected.runtime_secret_version.replace(/\/2$/,'/latest');}],
 ['RB-04 disabled secret',f=>{f.data.secretVersions[f.expected.runtime_secret_version].state='DISABLED';}],
 ['RB-04 literal DATABASE_URL',f=>{(f.data.revision.containers[0].env[0] as any).value='NEVER_RETURN_THIS_SENTINEL';}],
 ['RB-04 duplicate DATABASE_URL',f=>{f.data.revision.containers[0].env.push(f.data.revision.containers[0].env[0]);}],
 ['RB-04 lifecycle enabled',f=>{f.data.revision.containers[0].env[1].value='true';}],
 ['RB-05 missing service',f=>{(f.data as any).service=null;}],
 ['RB-08 unknown project number',f=>{f.data.service.name=f.data.service.name.replace(f.expected.project,'999');}],
 ['RB-09 sidecar',f=>{f.data.revision.containers.push(f.data.revision.containers[0]);}],
 ['RB-09 command override',f=>{f.data.revision.containers[0].command=['sh'];}],
 ['RB-09 migration owner',f=>{f.data.job.template.template.containers[0].env[1].value='other';}],
 ['RB-09 malformed service account path',f=>{f.data.revision.serviceAccount=`projects/${f.expected.project}/unexpected/${f.expected.runtime_service_account}`;}],
];
test.each(changes)('%s fails closed and redacts private input',async(_name,mutate)=>{
 const f=cloudFixture();mutate(f);const r=await collectCloudConfiguration(f);
 expect(r.cloudFieldsMatch).toBe(false);expect(r.releaseActivationAllowed).toBe(false);expect(r.reasons).toHaveLength(1);
 expect(JSON.stringify(r)).not.toContain('NEVER_RETURN_THIS_SENTINEL');expect(r.observed).toBeUndefined();
});
test('RB-05 permission failure does not leak raw error',async()=>{
 const f=cloudFixture();f.client.readJob=async()=>{throw new Error('NEVER_RETURN_THIS_SENTINEL');};
 const r=await collectCloudConfiguration(f);expect(r.reasons).toEqual(['READBACK_UNAVAILABLE']);
 expect(JSON.stringify(r)).not.toContain('NEVER_RETURN_THIS_SENTINEL');
});
test.each(['service','job','secret'])('RB-06 detects %s changing between reads',async(kind)=>{
 const f=cloudFixture();let n=0;
 if(kind==='service'){const read=f.client.readService;f.client.readService=async()=>{const x=await read();if(++n===2)x.etag+='changed';return x;};}
 if(kind==='job'){const read=f.client.readJob;f.client.readJob=async()=>{const x=await read();if(++n===2)x.uid+='changed';return x;};}
 if(kind==='secret'){const read=f.client.readSecretVersion;f.client.readSecretVersion=async name=>{const x=await read(name);if(++n>2)x.state='DISABLED';return x;};}
 const r=await collectCloudConfiguration(f);expect(r.cloudFieldsMatch).toBe(false);expect(r.releaseActivationAllowed).toBe(false);
});
test('RB-07 exhausts pages and finds active execution on second page',async()=>{
 const f=cloudFixture();const tokens:string[]=[];
 (f.client as any).listExecutions=async(token:string)=>{tokens.push(token);return token?{executions:[{name:'running'}]}:{executions:[{completionTime:'2026-11-28T00:00:00Z'}],nextPageToken:'page2'};};
 const r=await collectCloudConfiguration(f);expect(tokens).toEqual(['','page2']);expect(r.reasons).toEqual(['JOB_EXECUTION_ACTIVE_OR_UNKNOWN']);
});
test('RB-07 repeated pagination token blocks observation',async()=>{
 const f=cloudFixture();(f.client as any).listExecutions=async()=>({nextPageToken:'repeat'});
 expect((await collectCloudConfiguration(f)).reasons).toEqual(['EXECUTION_PAGINATION_UNKNOWN']);
});
test('RB-08 accepts authoritative project-number resource names',async()=>{
 const f=cloudFixture();const convert=(value:string)=>value.replace(`projects/${f.expected.project}/`,'projects/12345678901/');
 f.data.service.name=convert(f.data.service.name);f.data.job.name=convert(f.data.job.name);
 f.data.revision.name=convert(f.data.revision.name);f.data.revision.service=convert(f.data.revision.service);
 expect((await collectCloudConfiguration(f)).cloudFieldsMatch).toBe(true);
});
test('RB-05 elapsed read budget fails closed',async()=>{
 const f=cloudFixture();let n=0;f.clock=()=>Date.parse('2026-11-28T08:00:00Z')+(n++>3?60001:0);
 expect((await collectCloudConfiguration(f)).reasons).toEqual(['READBACK_TIME_BUDGET']);
});
test('RB-10 HTTP adapter exposes only GET metadata requests and rejects payload access',async()=>{
 const f=cloudFixture();const requests:any[]=[];
 const client=cloudConfigurationClient({expected:f.expected,tokenProvider:async()=>'PRIVATE_TOKEN',fetchImpl:async(url:string,options:any)=>{requests.push({url,options});return {ok:true,json:async()=>({})};}});
 await client.readProject();await client.readService();await client.readJob();await client.readInstance();
 await client.readRevision(f.data.revision.name);await client.readSecretVersion(f.expected.runtime_secret_version);await client.listExecutions('next&foo=bar');
 expect(requests).toHaveLength(7);
 for(const {url,options} of requests){expect(options.method).toBe('GET');expect(options.body).toBeUndefined();expect(options.redirect).toBe('error');expect(new URL(url).protocol).toBe('https:');expect(url).not.toContain('PRIVATE_TOKEN');expect(url).not.toContain(':access');}
 expect(new URL(requests[6].url).searchParams.get('pageToken')).toBe('next&foo=bar');
 expect(()=>client.readSecretVersion(f.expected.runtime_secret_version+':access')).toThrow();
 expect(()=>client.readRevision('https://example.com/')).toThrow();expect(requests).toHaveLength(7);
 expect(Object.keys(client).sort()).toEqual(['listExecutions','readInstance','readJob','readProject','readRevision','readSecretVersion','readService']);
});
test('RB-10 HTTP failure returns no raw response or bearer value',async()=>{
 const f=cloudFixture();const client=cloudConfigurationClient({expected:f.expected,tokenProvider:async()=>'NEVER_RETURN_THIS_SENTINEL',fetchImpl:async()=>{throw new Error('NEVER_RETURN_THIS_SENTINEL');}});
 const r=await collectCloudConfiguration({...f,client});expect(r.reasons).toEqual(['CLOUD_READ_FAILED']);expect(JSON.stringify(r)).not.toContain('NEVER_RETURN_THIS_SENTINEL');
});
