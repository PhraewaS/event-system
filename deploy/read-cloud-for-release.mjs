// Metadata-only bridge for the operator coordinator. No SQL/secret payloads or mutation.
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {collectCloudConfiguration,cloudConfigurationClient} from './read-cloud-configuration.mjs';

const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export async function readCloudForRelease({expected,client,clock}) {
  let service,job,revision;
  const wrapped={...client,
    readService:async()=>{const v=await client.readService();service??=v;return v;},
    readJob:async()=>{const v=await client.readJob();job??=v;return v;},
    readRevision:async name=>{const v=await client.readRevision(name);revision??=v;return v;}};
  const report=await collectCloudConfiguration({expected,client:wrapped,clock});
  if(!report.cloudFieldsMatch)return report;
  const full={service:service.template,traffic:service.traffic,job:job.template,
    serving:{containers:revision.containers,volumes:revision.volumes,serviceAccount:revision.serviceAccount}};
  // Complete environment/secret settings are hash-bound without printing their values.
  const configReviewHash='sha256:'+createHash('sha256').update(JSON.stringify(canonical(full))).digest('hex');
  return {...report,configReviewHash};
}

async function main(){
  let raw='';for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>262144)throw Error('Oversized target');}
  const input=JSON.parse(raw),{expected,accessToken}=input;
  if(Object.keys(input).sort().join(',')!=='accessToken,expected'||typeof accessToken!=='string'||!accessToken)throw Error('Private pipe context required');
  // The coordinator supplies a short-lived token over a private stdin pipe,
  // never argv, environment, credential files or output.
  const tokenProvider=()=>accessToken;
  const client=cloudConfigurationClient({expected,tokenProvider});
  process.stdout.write(JSON.stringify(await readCloudForRelease({expected,client}))+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(()=>{process.stderr.write('Live cloud metadata unavailable; no mutation performed.\n');process.exitCode=1;});
}
