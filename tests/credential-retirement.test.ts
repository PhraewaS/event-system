import {expect, test} from 'vitest';
// @ts-expect-error operator library uses native JS
import {retireCredentials,cloudSqlUserManagement} from '../deploy/cloudsql-credential-retirement.mjs';

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
  const database={inspect:async()=>{calls.push('inspect');return inspect();},oldCredentialWorks:async()=>true,
    snapshot:async()=>({owners:[1],ledger:['003'],registrations:['saved']}),
    terminateOldSessions:async()=>{calls.push('terminate');},oldSessionCount:async()=>0,
    oldCredentialSqlstate:async()=>'28P01',replacementReady:async()=>true};
  const management={resource:{project:'cp-fixture-project',instance:'cp-test'},rotatePassword:async()=>{calls.push('rotate');return {name:'op-reset',status:'DONE'};},
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
    fetchImpl:async(url:string,options:any)=>{calls.push({url,options});return {ok:true,json:async()=>({name:'op-1',status:options.method==='GET'?'DONE':'PENDING'})};}});
  await api.rotatePassword('cp_old');await api.replaceMemberships('cp_old',[]);
  expect(calls.map(x=>x.options.method)).toEqual(['PUT','GET','PUT','GET']);
  expect(calls[2].url).toContain('revokeExistingRoles=true');
  expect(calls[2].options.body).not.toContain('password');
  expect(calls.every(x=>!x.url.includes('synthetic-controlled-password'))).toBe(true);
});
