import 'dotenv/config';
import {beforeAll,afterAll,beforeEach,afterEach,expect,test} from 'vitest';
import {Pool,Client} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import request from 'supertest';
import {migrate} from '../server/src/migrate.js';
import {seed,demoIds} from '../server/src/seed.js';
import {createApp} from '../server/src/app.js';
// @ts-expect-error native operator modules
import {retireCredentials} from '../deploy/cloudsql-credential-retirement.mjs';
// @ts-expect-error native operator modules
import {postgresFenceInspection} from '../deploy/credential-fence-postgres.mjs';

const target=new URL(process.env.TEST_DATABASE_URL!);
if(!['127.0.0.1','localhost'].includes(target.hostname)||!target.pathname.endsWith('_test'))throw new Error('Disposable local *_test DB required');
const adminUrl=new URL(target);adminUrl.pathname='/postgres';
const admin=new Pool({connectionString:adminUrl.href});
const suffix=randomUUID().replaceAll('-','').slice(0,18);
const old=`cp_${suffix}_old`,fresh=`cp_${suffix}_runtime`,migrator=`cp_${suffix}_migrator`,priv=`cp_${suffix}_priv`;
const oldPassword='cp-local-old-synthetic-only',newPassword='cp-local-replacement-synthetic-only';
const q=(name:string)=>'"'+name.replaceAll('"','""')+'"';
const ownedDbs:string[]=[];const ownedRoles:string[]=[];
let db:string,base:URL,ownerPool:Pool,newPool:Pool,migrationPool:Pool,inspect:any;
const login=(role:string,password=role===old?oldPassword:newPassword,database=db)=>{
  const u=new URL(base??target);u.pathname='/'+database;u.username=role;u.password=password;return u.href;
};
beforeAll(async()=>{
  for(const [name,attrs] of [[old,`LOGIN CREATEROLE CREATEDB PASSWORD '${oldPassword}'`],
    [fresh,`LOGIN NOCREATEROLE NOCREATEDB PASSWORD '${newPassword}'`],
    [migrator,`LOGIN NOCREATEROLE NOCREATEDB PASSWORD '${newPassword}'`],[priv,'NOLOGIN']] ){
    await admin.query(`CREATE ROLE ${q(name)} ${attrs}`);ownedRoles.push(name);
  }
});
beforeEach(async()=>{
  await admin.query(`ALTER ROLE ${q(old)} PASSWORD '${oldPassword}'`);
  await admin.query(`GRANT ${q(priv)} TO ${q(old)}; GRANT ${q(old)} TO ${q(migrator)} WITH SET TRUE, ADMIN FALSE, INHERIT FALSE`);
  db=`cp_${randomUUID().replaceAll('-','')}_test`;base=new URL(adminUrl);base.pathname='/'+db;
  await admin.query(`CREATE DATABASE ${q(db)} OWNER ${q(old)}`);ownedDbs.push(db);
  ownerPool=new Pool({connectionString:login(old)});newPool=new Pool({connectionString:login(fresh)});migrationPool=new Pool({connectionString:login(migrator)});
  await ownerPool.query('CREATE TABLE schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for(const file of ['001_initial.sql','002_login_rate_limits.sql']){
    const sql=await readFile(new URL('../server/migrations/'+file,import.meta.url),'utf8');
    await ownerPool.query(sql);await ownerPool.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[file,createHash('sha256').update(sql).digest('hex')]);
  }
  await ownerPool.query(`GRANT CONNECT ON DATABASE ${q(db)} TO ${q(fresh)},${q(migrator)};
    GRANT USAGE ON SCHEMA public TO ${q(fresh)};
    GRANT SELECT,INSERT,UPDATE,DELETE ON users,events,registrations,session,login_rate_limits TO ${q(fresh)}`);
  inspect=postgresFenceInspection({adminUrl:base.href,oldUrl:login(old),newUrl:login(fresh),migratorUrl:login(migrator),ownerRole:old});
});
afterEach(async()=>{await Promise.all([ownerPool?.end(),newPool?.end(),migrationPool?.end()]);});
afterAll(async()=>{
  for(const name of ownedDbs)await admin.query(`DROP DATABASE ${q(name)} WITH (FORCE)`);
  for(const name of [...ownedRoles].reverse())await admin.query(`DROP ROLE ${q(name)}`);
  await admin.end();
});

test.each([false,true])('CP-17 / real003 owner profile INHERIT=%s: DDL/ledger/backfill/owner and no-op rerun',async(inherit)=>{
  await admin.query(`GRANT ${q(old)} TO ${q(migrator)} WITH INHERIT ${inherit?'TRUE':'FALSE'}`);
  await seed(ownerPool,'cp-local-app-synthetic-password');
  const registration=randomUUID();const event='20000000-0000-4000-8000-000000000001';
  await ownerPool.query('INSERT INTO registrations(id,event_id,participant_id) VALUES($1,$2,$3)',[registration,event,demoIds.participant]);
  const before=(await ownerPool.query('SELECT * FROM registrations')).rows;
  const ownersBefore=(await ownerPool.query("SELECT oid,relname,relowner FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY relname")).rows;
  await migrate(migrationPool,{ownerRole:old});await migrate(migrationPool,{ownerRole:old});
  expect((await ownerPool.query('SELECT * FROM registrations')).rows[0]).toMatchObject({...before[0],status:'ACTIVE',registered_at:before[0].created_at,cancelled_at:null});
  expect((await ownerPool.query('SELECT name FROM schema_migrations ORDER BY name')).rows).toHaveLength(3);
  expect((await ownerPool.query("SELECT oid,relname,relowner FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY relname")).rows).toEqual(ownersBefore);
  expect((await migrationPool.query('SELECT session_user,current_user')).rows[0]).toEqual({session_user:migrator,current_user:migrator});
  expect((await migrationPool.query("SELECT pg_has_role(current_user,$1,'USAGE') AS inherited",[old])).rows[0].inherited).toBe(inherit);
  await expect(newPool.query(`SET ROLE ${q(old)}`)).rejects.toMatchObject({code:'42501'});
  await expect(newPool.query('ALTER TABLE registrations ADD COLUMN unauthorized text')).rejects.toMatchObject({code:'42501'});
  const e=(await ownerPool.query('SELECT * FROM registrations')).rows[0];
  await expect(ownerPool.query("UPDATE registrations SET status='BAD' WHERE id=$1",[e.id])).rejects.toMatchObject({code:'23514'});
});

test('CP-18 / missing schema CREATE fails even with owner membership; rollback keeps ledger unchanged',async()=>{
  await ownerPool.query('REVOKE CREATE ON SCHEMA public FROM pg_database_owner');
  await expect(migrate(migrationPool,{ownerRole:old})).rejects.toMatchObject({code:'42501'});
  expect((await ownerPool.query("SELECT name FROM schema_migrations WHERE name='003_registration_lifecycle.sql'")).rows).toEqual([]);
});

test('CP-18 / DML-only or denied SET authority cannot migrate; transaction/ledger unchanged',async()=>{
  await admin.query(`REVOKE ${q(old)} FROM ${q(migrator)}`);
  await ownerPool.query(`GRANT USAGE ON SCHEMA public TO ${q(migrator)}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${q(migrator)}`);
  await expect(migrate(migrationPool,{ownerRole:old})).rejects.toMatchObject({code:'42501'});
  expect((await ownerPool.query("SELECT name FROM schema_migrations WHERE name='003_registration_lifecycle.sql'")).rows).toEqual([]);
  expect((await ownerPool.query("SELECT column_name FROM information_schema.columns WHERE table_name='registrations' AND column_name='status'")).rows).toEqual([]);
  expect((await migrationPool.query('SELECT current_user')).rows[0].current_user).toBe(migrator);
});

test('CP-07..12 / password fence aborts in-flight writer across two DBs; data/owner preserved and replacement API works',async()=>{
  await migrate(migrationPool,{ownerRole:old});await seed(ownerPool,'cp-local-app-synthetic-password');
  const second=`cp_${randomUUID().replaceAll('-','')}_test`;
  await admin.query(`CREATE DATABASE ${q(second)} OWNER ${q(old)}`);ownedDbs.push(second);
  const oldClient=new Client({connectionString:login(old)}),other=new Client({connectionString:login(old,oldPassword,second)});
  oldClient.on('error',()=>{});other.on('error',()=>{});
  await oldClient.connect();await other.connect();
  try{
    await oldClient.query('BEGIN');await oldClient.query('INSERT INTO registrations(id,event_id,participant_id) VALUES($1,$2,$3)',[randomUUID(),'20000000-0000-4000-8000-000000000001',demoIds.participant]);
    await ownerPool.end();ownerPool=new Pool({connectionString:login(old)}); // no idle pool socket retained during termination
    const authorization={contractAccepted:true,changeApproved:true,freezeConfirmed:true,backupVerified:true,lifecycleWritesDisabled:true,inventoryComplete:true,noUncontrolledPaths:true,
      oldRoutesDisabled:true,replacementSecretIsolationVerified:true,migrationProfileVerified:true,
      windowStart:new Date(Date.now()-10000).toISOString(),windowEnd:new Date(Date.now()+60000).toISOString()};
    const expected={project:'cp-local-fixture',instance:'cp-test',oldRole:old,runtimeRole:fresh,migratorRole:migrator,operatorRole:decodeURIComponent(adminUrl.username),database:db,finalMemberships:[]};
    // Local synthetic SQL adapter simulates Cloud SQL's two management operations, never contacts GCP.
    const management={resource:{project:'cp-local-fixture',instance:'cp-test'},rotatePassword:async()=>{await admin.query(`ALTER ROLE ${q(old)} PASSWORD 'cp-rotated-controlled-synthetic-only'`);return {name:'local-reset',status:'DONE'};},
      replaceMemberships:async()=>{await admin.query(`REVOKE ${q(priv)} FROM ${q(old)}`);return {name:'local-revoke',status:'DONE'};}};
    const result=await retireCredentials({authorization,expected,management,database:inspect});
    expect(result).toMatchObject({retiredLoginDisabled:false,retiredSessionCount:0,oldCredentialSqlstate:'28P01',replacementConnectionReady:true,baselinePreserved:true});
    await expect(oldClient.query('COMMIT')).rejects.toThrow();await expect(other.query('SELECT 1')).rejects.toThrow();
    expect((await newPool.query('SELECT * FROM registrations')).rows).toEqual([]);
    const app=createApp(newPool,'cp-synthetic-session-secret-at-least-32-characters',false,false);
    const actor=async(email:string)=>{const agent=request.agent(app);const csrf=await agent.get('/api/auth/csrf');
      const login=await agent.post('/api/auth/login').set('X-CSRF-Token',csrf.body.data.csrfToken).send({email,password:'cp-local-app-synthetic-password'}).expect(200);return {agent,token:login.body.data.csrfToken};};
    const p=await actor('participant@example.test');const event='20000000-0000-4000-8000-000000000001';
    const registered=(await p.agent.post(`/api/events/${event}/registrations`).set('X-CSRF-Token',p.token).send({}).expect(201)).body.data;
    expect((await p.agent.get('/api/registrations/mine').expect(200)).body.data.some((r:any)=>r.id===registered.id)).toBe(true);
    const eventView=(await request(app).get(`/api/events/${event}`).expect(200)).body.data;
    expect(eventView).toMatchObject({registeredCount:1,remainingPlaces:23});
    const day=new Date(Date.parse(eventView.startsAt)+7*3600000).toISOString().slice(0,10);
    expect((await p.agent.get(`/api/registrations/quota?date=${day}`).expect(200)).body.data.registeredCount).toBe(1);
    const persisted=new Pool({connectionString:login(fresh)});
    try{expect((await persisted.query('SELECT id,status FROM registrations WHERE id=$1',[registered.id])).rows[0]).toEqual({id:registered.id,status:'ACTIVE'});}
    finally{await persisted.end();}
    const owner=await actor('organizer@example.test');expect((await owner.agent.get(`/api/events/${event}/registrations`).expect(200)).body.data).toHaveLength(1);
    await p.agent.get(`/api/events/${event}/registrations`).expect(403);
    await request(app).get('/api/registrations/mine').expect(401);
    const p2=await actor('participant2@example.test');await p2.agent.get(`/api/registrations/${registered.id}`).expect(404);
    await p.agent.post(`/api/registrations/${registered.id}/cancel`).set('X-CSRF-Token',p.token).send({}).expect(503);
    expect((await newPool.query('SELECT status FROM registrations WHERE id=$1',[registered.id])).rows[0].status).toBe('ACTIVE');
  }finally{await Promise.allSettled([oldClient.end(),other.end()]);}
});
