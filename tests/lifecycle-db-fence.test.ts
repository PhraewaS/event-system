import {test,expect,afterAll} from 'vitest';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
// Operator script is JS so exactly the same implementation runs in local tests.
// @ts-expect-error operator-only .mjs module has no declaration file
import {fenceLegacyDatabase} from '../deploy/fence-legacy-db.mjs';
const url=new URL(process.env.TEST_DATABASE_URL!);
if(!['127.0.0.1','localhost'].includes(url.hostname)||!url.pathname.endsWith('_test'))throw new Error('Isolated local test database required');
const admin=new Client({connectionString:url.href});
const suffix=randomUUID().replaceAll('-','');const oldRole=`s2_old_${suffix}`,newRole=`s2_new_${suffix}`;
const password='synthetic-fence-test-only';
const login=(name:string)=>{const u=new URL(url);u.username=name;u.password=password;return u.href;};
let setup=false;
const table=`fence_proof_${suffix}`;
afterAll(async()=>{if(setup){await admin.query(`DROP TABLE IF EXISTS "${table}"; DROP ROLE IF EXISTS "${oldRole}","${newRole}"`);}await admin.end();});
test('S2-A-DEPLOY-02 / real PostgreSQL rejects reconnect and rolls back an old in-flight writer after role fencing',async()=>{
 await admin.connect();setup=true;
 await admin.query(`CREATE ROLE "${oldRole}" LOGIN PASSWORD '${password}'; CREATE ROLE "${newRole}" LOGIN PASSWORD '${password}'`);
 await admin.query(`CREATE TABLE "${table}" (id int); GRANT INSERT ON "${table}" TO "${oldRole}"`);
 // Synthetic table only: prove an uncommitted old writer cannot commit after fencing.
 const old=new Client({connectionString:login(oldRole)});old.on('error',()=>{});await old.connect();
 try{
  await old.query('BEGIN');await old.query(`INSERT INTO "${table}" VALUES (1)`);
  const proof=await fenceLegacyDatabase({adminUrl:url.href,oldUrl:login(oldRole),newUrl:login(newRole)});
  expect(proof).toMatchObject({retiredRole:oldRole,replacementRole:newRole,retiredLoginDisabled:true,retiredSessionCount:0,oldConnectionRejected:true,replacementConnectionReady:true});
  await expect(old.query('COMMIT')).rejects.toThrow();
  expect((await admin.query(`SELECT * FROM "${table}"`)).rows).toEqual([]);
  const retry=new Client({connectionString:login(oldRole)});
  try{await expect(retry.connect()).rejects.toMatchObject({code:'28000'});}finally{await retry.end();}
 }finally{await old.end();}
});
test('S2-A-DEPLOY-03 / shared old and replacement credentials fail before NOLOGIN mutation',async()=>{
 await admin.query(`ALTER ROLE "${oldRole}" LOGIN`);
 await expect(fenceLegacyDatabase({adminUrl:url.href,oldUrl:login(oldRole),newUrl:login(oldRole)})).rejects.toThrow('distinct login roles');
 expect((await admin.query('SELECT rolcanlogin FROM pg_roles WHERE rolname=$1',[oldRole])).rows[0].rolcanlogin).toBe(true);
});
