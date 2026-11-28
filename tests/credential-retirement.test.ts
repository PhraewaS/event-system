import {expect, test} from 'vitest';
// @ts-expect-error operator library uses native JS
import {retireCredentials,cloudSqlUserManagement} from '../deploy/cloudsql-credential-retirement.mjs';
// @ts-expect-error operator library uses native JS
import {cloudSqlConnectorInspection,postgresFenceInspection} from '../deploy/credential-fence-postgres.mjs';

const now=Date.parse('2026-11-27T12:00:00Z');
function scenario() {
  const calls:string[]=[];
  const authorization={windowStart:new Date(now-1000).toISOString(),windowEnd:new Date(now+60000).toISOString(),
    contractAccepted:true,changeApproved:true,freezeConfirmed:true,backupVerified:true,lifecycleWritesDisabled:true,inventoryComplete:true,
    noUncontrolledPaths:true,oldRoutesDisabled:true,replacementSecretIsolationVerified:true,migrationProfileVerified:true};
  const expected={project:'cp-fixture-project',instance:'cp-test',oldRole:'cp_old',runtimeRole:'cp_runtime',migratorRole:'cp_migrator',operatorRole:'cp_operator',database:'cp_test',finalMemberships:[]};
  let revoked=false;
  const inspect=()=>({database:'cp_test',operatorRole:'cp_operator',oldRole:'cp_old',runtimeRole:'cp_runtime',migratorRole:'cp_migrator',
    profileVerified:true,oldMemberships:revoked?[]:['cloudsqlsuperuser'],oldRoleAttributes:{login:true,createrole:true,createdb:true}});
  const database={verifyInstance:async()=>true,sessionTerminationAuthority:async()=>true,
    inspect:async()=>{calls.push('inspect');return inspect();},oldCredentialWorks:async()=>true,
    snapshot:async()=>({owners:[1],ledger:['003'],registrations:['saved']}),
    terminateOldSessions:async()=>{calls.push('terminate');},oldSessionCount:async()=>0,
    oldCredentialSqlstate:async()=>'28P01',replacementReady:async()=>true};
  const management={resource:{project:'cp-fixture-project',instance:'cp-test'},
    readInstance:async()=>({name:'cp-test',project:'cp-fixture-project',connectionName:'cp-fixture-project:asia-southeast1:cp-test',databaseVersion:'POSTGRES_17'}),
    rotatePassword:async()=>{calls.push('rotate');return {name:'op-reset',status:'DONE'};},
    replaceMemberships:async()=>{calls.push('revoke');revoked=true;return {name:'op-revoke',status:'DONE'};}};
  return {calls,authorization,expected,database,management,clock:()=>now,sleep:async()=>{}};
}

test('CP-05/11 / ordered fence reports actual remaining attributes, never enables lifecycle',async()=>{
  const s=scenario();const result=await retireCredentials(s);
  expect(s.calls).toEqual(['inspect','rotate','revoke','inspect','terminate']);
  expect(result).toMatchObject({oldCredentialSqlstate:'28P01',retiredSessionCount:0,retiredLoginDisabled:false,lifecycleEnabled:false});
  expect(result.status).toBe('FACTS_ONLY_REQUIRES_PROOF_REVIEW');
});

for(const key of ['contractAccepted','changeApproved','freezeConfirmed','backupVerified','lifecycleWritesDisabled','inventoryComplete','noUncontrolledPaths','oldRoutesDisabled','replacementSecretIsolationVerified','migrationProfileVerified'] as const)
 test(`CP-01..04 / missing ${key} prevents every mutation`,async()=>{
   const s=scenario();s.authorization[key]=false;
   await expect(retireCredentials(s)).rejects.toThrow('authorization');expect(s.calls).toEqual([]);
 });

test('CP-02 / same role conflicts stop before adapter calls',async()=>{
  const s=scenario();s.expected.runtimeRole='cp_old';
  await expect(retireCredentials(s)).rejects.toThrow('role inventory');expect(s.calls).toEqual([]);
});
test('CP-02 / management instance mismatch stops before adapter calls',async()=>{
  const s=scenario();s.expected.instance='wrong-instance';
  await expect(retireCredentials(s)).rejects.toThrow('management target binding');expect(s.calls).toEqual([]);
});
test('review94 / SQL profiles on another instance reject before reset even with matching database and role names',async()=>{
  const s=scenario();let connections=0;
  const profiles=Object.fromEntries(['admin','old','runtime','migrator'].map((key,i)=>[key,{user:['cp_operator','cp_old','cp_runtime','cp_migrator'][i],database:'cp_test',password:'synthetic-only'}]));
  const database=cloudSqlConnectorInspection({connector:{getOptions:async()=>{connections++;throw new Error('Should not connect');}},
    instanceConnectionName:'cp-fixture-project:asia-southeast1:cp-other',profiles,ownerRole:'cp_old'});
  await expect(retireCredentials({...s,database})).rejects.toThrow('instance binding');expect(connections).toBe(0);
  expect(s.calls).not.toContain('rotate');expect(s.calls).not.toContain('revoke');expect(s.calls).not.toContain('terminate');
});
test('review94 / plain TCP URLs cannot assert an instance, even with identical profile names',async()=>{
  const url='postgresql://cp_old:synthetic-only@127.0.0.1:5432/cp_test';
  const db=postgresFenceInspection({adminUrl:url,oldUrl:url,newUrl:url,migratorUrl:url,ownerRole:'cp_old'});
  expect(await db.verifyInstance('cp-fixture-project:asia-southeast1:cp-test')).toBe(false);
  await expect(db.terminateOldSessions()).rejects.toThrow('Instance-bound connector');
});
test('review94 / connector profiles cannot override the instance stream with host/connectionString',()=>{
  const profile={user:'cp_old',password:'synthetic-only',database:'cp_test',host:'other-server'};
  expect(()=>cloudSqlConnectorInspection({connector:{getOptions:async()=>({})},instanceConnectionName:'cp-fixture-project:asia-southeast1:cp-test',
    profiles:{admin:profile,old:profile,runtime:profile,migrator:profile},ownerRole:'cp_old'})).toThrow('overrides');
});
test('review94 / operator without session termination authority stops before reset or membership change',async()=>{
  const s=scenario();Object.assign(s.database,{sessionTerminationAuthority:async()=>false});
  await expect(retireCredentials(s)).rejects.toThrow('session termination authority');
  expect(s.calls).not.toContain('rotate');expect(s.calls).not.toContain('revoke');expect(s.calls).not.toContain('terminate');
});
test('CP-06 / failed reset never revokes/terminates or leaks API payload',async()=>{
  const s=scenario();s.management.rotatePassword=async()=>{throw new Error('PRIVATE_PASSWORD_AND_URL');};
  await expect(retireCredentials(s)).rejects.toThrow('password rotation');expect(s.calls).toEqual(['inspect']);
});
test('CP-06 / pending operation is not success',async()=>{
  const s=scenario();s.management.rotatePassword=async()=>({name:'op-reset',status:'PENDING'});
  await expect(retireCredentials(s)).rejects.toThrow('password rotation');expect(s.calls).not.toContain('terminate');
});
test('CP-06 / membership readback mismatch stops before terminating',async()=>{
  const s=scenario();s.management.replaceMemberships=async()=>({name:'op-revoke',status:'DONE'});
  await expect(retireCredentials(s)).rejects.toThrow('membership readback');expect(s.calls).not.toContain('terminate');
});
test('review94 / losing termination authority during cutover stops before the next mutation',async()=>{
  const s=scenario();let checks=0;s.database.sessionTerminationAuthority=async()=>++checks<3;
  await expect(retireCredentials(s)).rejects.toThrow('session termination authority');
  expect(s.calls).toContain('rotate');expect(s.calls).not.toContain('revoke');expect(s.calls).not.toContain('terminate');
});
test('CP-08 / sessions in any DB keep fence incomplete',async()=>{
  const s=scenario();s.database.oldSessionCount=async()=>1;
  await expect(retireCredentials({...s,timeoutMs:0})).rejects.toThrow('session termination');
});
test('CP-09 / network failure is not authentication rejection',async()=>{
  const s=scenario();s.database.oldCredentialSqlstate=async()=>'ECONNREFUSED';
  await expect(retireCredentials(s)).rejects.toThrow('old credential rejection');
});
test('CP-10/13 / changed data fails closed without restoring old privileges',async()=>{
  const s=scenario();let n=0;s.database.snapshot=async()=>({owners:[1],ledger:['003'],registrations:[String(n++)]});
  await expect(retireCredentials(s)).rejects.toThrow('data preservation');expect(s.calls.filter(x=>x==='rotate')).toHaveLength(1);
});
test('CP-03 / invalid before credential prevents management mutations',async()=>{
  const s=scenario();s.database.oldCredentialWorks=async()=>false;
  await expect(retireCredentials(s)).rejects.toThrow('positive control');expect(s.calls).toEqual(['inspect']);
});
test('Cloud SQL adapter uses query role replacement, waits operations, never puts password in URL',async()=>{
  const calls:{url:string;options:any}[]=[];
  const api=cloudSqlUserManagement({project:'cp-fixture-project',instance:'cp-test',tokenProvider:async()=>'synthetic-token',
    passwordProvider:async()=>'synthetic-controlled-password-not-production',sleep:async()=>{},
    fetchImpl:async(url:string,options:any)=>{calls.push({url,options});return {ok:true,json:async()=>url.endsWith('/instances/cp-test')?
      {name:'cp-test',project:'cp-fixture-project',connectionName:'cp-fixture-project:asia-southeast1:cp-test',databaseVersion:'POSTGRES_17'}:
      {name:'op-1',status:options.method==='GET'?'DONE':'PENDING'}};}});
  expect((await api.readInstance()).connectionName).toBe('cp-fixture-project:asia-southeast1:cp-test');
  await api.rotatePassword('cp_old');await api.replaceMemberships('cp_old',[]);
  expect(calls.map(x=>x.options.method)).toEqual(['GET','PUT','GET','PUT','GET']);
  expect(calls[3].url).toContain('revokeExistingRoles=true');
  expect(calls[3].options.body).not.toContain('password');
  expect(calls.every(x=>!x.url.includes('synthetic-controlled-password'))).toBe(true);
});
