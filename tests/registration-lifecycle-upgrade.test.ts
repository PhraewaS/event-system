import 'dotenv/config';
import {beforeAll,beforeEach,afterAll,test,expect} from 'vitest';
import {Pool} from 'pg';
import request from 'supertest';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/src/app.js';
import {migrate} from '../server/src/migrate.js';
import {seed,demoIds} from '../server/src/seed.js';

const target=new URL(process.env.TEST_DATABASE_URL!);
if(!target.pathname.endsWith('_test')||!['127.0.0.1','localhost'].includes(target.hostname))throw new Error('Local disposable *_test DB required');
// A run owns a newly created DB; never reuse/drop a fixed developer DB.
const name=`s2_upgrade_${process.pid}_${randomUUID().replaceAll('-','')}_test`;
let created=false;
const adminUrl=new URL(target);adminUrl.pathname='/postgres';target.pathname='/'+name;
const pool=new Pool({connectionString:target.href});
const secret='s2-upgrade-synthetic-session-secret-at-least-32';const password='S2-upgrade-synthetic-password!';
let oldCreate:typeof createApp;let oldMigrate:typeof migrate;
beforeAll(async()=>{
 const admin=new Pool({connectionString:adminUrl.href});
 try{await admin.query(`CREATE DATABASE "${name}"`);created=true;}finally{await admin.end();}
 console.info(`Disposable upgrade database: ${name}`);
 const extraction=`artifacts/legacy-e2b9842-${name}`;
 execFileSync(process.execPath,['scripts/prepare-lifecycle-legacy.mjs',extraction]);
 const root=path.resolve(extraction,'server/src');
 oldCreate=(await import(pathToFileURL(path.join(root,'app.ts')).href)).createApp;
 oldMigrate=(await import(pathToFileURL(path.join(root,'migrate.ts')).href)).migrate;
});
beforeEach(async()=>{
 // This database is created exclusively by this test and validated *_test above.
 await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
 await oldMigrate(pool);await seed(pool,password);
});
afterAll(async()=>{
 await pool.end();
 if(created){const admin=new Pool({connectionString:adminUrl.href});try{await admin.query(`DROP DATABASE "${name}"`);}finally{await admin.end();}}
});
async function actor(app:ReturnType<typeof createApp>,email='participant@example.test'){
 const agent=request.agent(app);const b=await agent.get('/api/auth/csrf');
 const r=await agent.post('/api/auth/login').set('X-CSRF-Token',b.body.data.csrfToken).send({email,password}).expect(200);
 return {agent,token:r.body.data.csrfToken};
}
async function event(app:ReturnType<typeof createApp>){
 const o=await actor(app,'organizer@example.test');const future=Date.now()+40*86400000;
 return (await o.agent.post('/api/events').set('X-CSRF-Token',o.token).send({title:'S2 migration event',description:'Synthetic old/new API coexistence fixture.',location:'Test room',capacity:10,startsAt:new Date(future).toISOString(),registrationDeadline:new Date(future-86400000).toISOString()}).expect(201)).body.data;
}
const post=(p:Awaited<ReturnType<typeof actor>>,id:string)=>p.agent.post(`/api/events/${id}/registrations`).set('X-CSRF-Token',p.token).send({});
test('S2-A-DB-01a / populated upgrade preserves IDs/createdAt and enforces defaults/constraints',async()=>{
 const app=oldCreate(pool,secret);const p=await actor(app);const e=await event(app);await post(p,e.id).expect(201);
 const before=(await pool.query('SELECT * FROM registrations')).rows[0];
 await migrate(pool);await migrate(pool);
 const row=(await pool.query('SELECT * FROM registrations')).rows[0];
 expect(row).toMatchObject({...before,status:'ACTIVE',registered_at:before.created_at,cancelled_at:null});
 const columns=(await pool.query("SELECT column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='registrations'")).rows;
 expect(columns.find(x=>x.column_name==='status')).toMatchObject({is_nullable:'NO'});
 expect(columns.find(x=>x.column_name==='status').column_default).toContain('ACTIVE');
 expect(columns.find(x=>x.column_name==='registered_at')).toMatchObject({is_nullable:'NO',column_default:'clock_timestamp()'});
 await expect(pool.query("UPDATE registrations SET status=NULL")).rejects.toThrow();
 await expect(pool.query("UPDATE registrations SET status='CANCELLED' WHERE id=$1",[row.id])).rejects.toThrow();
});
test('S2-A-DB-01b / actual e2b9842 API and new disabled API both insert on upgraded DB',async()=>{
 await migrate(pool);const old=oldCreate(pool,secret);const fresh=createApp(pool,secret,false,false);
 const e=await event(old);const oldP=await actor(old);const oldReg=(await post(oldP,e.id).expect(201)).body.data;
 async function checkBoth(count:number,ids:string[]){
  for(const app of [old,fresh]){
   expect((await request(app).get(`/api/events/${e.id}`).expect(200)).body.data).toMatchObject({registeredCount:count,remainingPlaces:10-count});
   const owner=await actor(app,'organizer@example.test');
   const roster=(await owner.agent.get(`/api/events/${e.id}/registrations`).expect(200)).body.data;
   expect(roster.map((r:{id:string})=>r.id).sort()).toEqual([...ids].sort());
  }
 }
 await checkBoth(1,[oldReg.id]);
 const newP=await actor(fresh,'participant2@example.test');const newReg=(await post(newP,e.id).expect(201)).body.data;
 await checkBoth(2,[oldReg.id,newReg.id]);
 const rows=(await pool.query('SELECT status,registered_at,cancelled_at FROM registrations')).rows;
 expect(rows).toHaveLength(2);for(const row of rows){expect(row.status).toBe('ACTIVE');expect(row.registered_at).toBeInstanceOf(Date);expect(row.cancelled_at).toBeNull();}
 for(const p of [oldP,newP]){const day=new Date(Date.now()+40*86400000+7*3600000).toISOString().slice(0,10);expect((await p.agent.get(`/api/registrations/quota?date=${day}`)).body.data.registeredCount).toBe(1);}
});
test('S2-A-DB-01c / state-aware rollback app keeps cancelled IDs/history and ACTIVE-only reads',async()=>{
 await migrate(pool);const current=createApp(pool,secret,false,true);const p=await actor(current);const e=await event(current);const r=(await post(p,e.id).expect(201)).body.data;
 await p.agent.post(`/api/registrations/${r.id}/cancel`).set('X-CSRF-Token',p.token).send({}).expect(200);
 await post(p,(await event(current)).id).expect(201);
 const before=(await pool.query('SELECT * FROM registrations')).rows;
 const separate=new Pool({connectionString:target.href});
 try{
  const fallback=createApp(separate,secret,false,false);const own=await actor(fallback);const o=await actor(fallback,'organizer@example.test');
  expect((await request(fallback).get(`/api/events/${e.id}`)).body.data).toMatchObject({registeredCount:0,remainingPlaces:10});
  expect((await own.agent.get('/api/registrations/mine')).body.data.find((x:{id:string})=>x.id===r.id)).toMatchObject({id:r.id,status:'CANCELLED'});
  const day=new Date(Date.parse(e.startsAt)+7*3600000).toISOString().slice(0,10);
  expect((await own.agent.get(`/api/registrations/quota?date=${day}`)).body.data.registeredCount).toBe(1);
  expect((await o.agent.get(`/api/events/${e.id}/registrations`)).body.data).toEqual([]);
  await own.agent.get(`/api/events/${e.id}/registrations`).expect(403);
  await post(own,e.id).expect(503);expect((await pool.query('SELECT * FROM registrations')).rows).toEqual(before);
 }finally{await separate.end();}
});
