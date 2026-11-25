import 'dotenv/config';
import {beforeAll,beforeEach,afterAll,test,expect} from 'vitest';
import {Pool} from 'pg';
import request from 'supertest';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/src/app.js';
import {migrate} from '../server/src/migrate.js';
import {seed,demoIds} from '../server/src/seed.js';

const url=process.env.TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||!new URL(url).pathname.endsWith('_test'))throw new Error('Isolated local *_test DB required');
const pool=new Pool({connectionString:url,application_name:'s2-capacity-api',max:12});
const rivalPool=new Pool({connectionString:url,application_name:'s2-capacity-rival',max:12});
const secret='s2-capacity-synthetic-session-secret-at-least-32';
const password='S2-capacity-synthetic-password!';
const app=createApp(pool,secret,false,true),rival=createApp(rivalPool,secret,false,true);
type Actor={agent:ReturnType<typeof request.agent>;token:string};
async function actor(email='organizer@example.test',target=app):Promise<Actor>{
 const agent=request.agent(target);const csrf=await agent.get('/api/auth/csrf').expect(200);
 const login=await agent.post('/api/auth/login').set('X-CSRF-Token',csrf.body.data.csrfToken).send({email,password}).expect(200);
 return {agent,token:login.body.data.csrfToken};
}
async function event(capacity=10){
 const owner=await actor();const starts=Date.now()+40*86400000;
 return (await owner.agent.post('/api/events').set('X-CSRF-Token',owner.token).send({title:`Capacity ${randomUUID()}`,description:'Synthetic capacity change fixture.',location:'Test room',capacity,startsAt:new Date(starts).toISOString(),registrationDeadline:new Date(starts-86400000).toISOString()}).expect(201)).body.data;
}
const change=(owner:Actor,id:string,capacity:unknown)=>owner.agent.patch(`/api/events/${id}/capacity`).set('X-CSRF-Token',owner.token).send({capacity});
const register=(p:Actor,id:string)=>p.agent.post(`/api/events/${id}/registrations`).set('X-CSRF-Token',p.token).send({});
const cancel=(p:Actor,id:string)=>p.agent.post(`/api/registrations/${id}/cancel`).set('X-CSRF-Token',p.token).send({});
const registrations=async()=> (await pool.query('SELECT * FROM registrations ORDER BY id')).rows;
const snapshot=async()=>({events:(await pool.query('SELECT * FROM events ORDER BY id')).rows,registrations:await registrations()});
beforeAll(async()=>{await migrate(pool);});
beforeEach(async()=>{await pool.query('TRUNCATE registrations,events,users,session,login_rate_limits CASCADE');await seed(pool,password);});
afterAll(async()=>{await Promise.all([pool.end(),rivalPool.end()]);});

test('S2-B-API-02 / primary RED: owner increases and decreases capacity without changing registrations or quota',async()=>{
 const owner=await actor();const p=await actor('participant@example.test');const e=await event(2);
 const saved=(await register(p,e.id).expect(201)).body.data;const before=await registrations();
 const day=new Date(Date.parse(e.startsAt)+7*3600000).toISOString().slice(0,10);
 const quota=(await p.agent.get(`/api/registrations/quota?date=${day}`).expect(200)).body;
 const increased=await change(owner,e.id,4);
 expect(increased.status).toBe(200);
 expect(increased.body.data).toMatchObject({id:e.id,capacity:4,registeredCount:1,remainingPlaces:3,registrationOpen:true});
 expect((await change(owner,e.id,1).expect(200)).body.data).toMatchObject({capacity:1,registeredCount:1,remainingPlaces:0,registrationOpen:false});
 expect(await registrations()).toEqual(before);
 expect((await p.agent.get(`/api/registrations/quota?date=${day}`).expect(200)).body).toEqual(quota);
 expect((await p.agent.get(`/api/registrations/${saved.id}`).expect(200)).body.data.id).toBe(saved.id);
 expect((await pool.query('SELECT capacity FROM events WHERE id=$1',[e.id])).rows[0].capacity).toBe(1);
});

test('S2-B-API-01 / strict capacity inputs and UUID/JSON failures preserve all records',async()=>{
 const owner=await actor();const e=await event();
 for(const capacity of [1,1000000])expect((await change(owner,e.id,capacity).expect(200)).body.data.capacity).toBe(capacity);
 const before=await snapshot();
 for(const body of [{},{capacity:0},{capacity:1000001},{capacity:1.25},{capacity:'3'},{capacity:null},{capacity:2,organizerId:demoIds.organizer2},[]]){
  const r=await owner.agent.patch(`/api/events/${e.id}/capacity`).set('X-CSRF-Token',owner.token).send(body).expect(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
 }
 await owner.agent.patch(`/api/events/${e.id}/capacity`).set('X-CSRF-Token',owner.token).set('Content-Type','application/json').send('{bad').expect(400);
 await change(owner,'invalid',2).expect(400);expect(await snapshot()).toEqual(before);
});
async function fixtures(id:string,active:number,cancelled=0){
 for(let i=0;i<active+cancelled;i++){
  const participant=randomUUID();
  await pool.query(`INSERT INTO users(id,email,name,role,password_hash) SELECT $1,$2,'Synthetic legacy participant','PARTICIPANT',password_hash FROM users WHERE id=$3`,[participant,`${participant}@example.test`,demoIds.participant]);
  await pool.query('INSERT INTO registrations(id,event_id,participant_id,status,cancelled_at) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,participant,i<active?'ACTIVE':'CANCELLED',i<active?null:new Date()]);
 }
}
test('S2-B-API-03 / equality, cancelled rows, empty minimum and no-op retain registration history',async()=>{
 const owner=await actor();const e=await event(6);await fixtures(e.id,3,2);const before=await registrations();
 expect((await change(owner,e.id,3).expect(200)).body.data).toMatchObject({capacity:3,registeredCount:3,remainingPlaces:0,registrationOpen:false});
 await change(owner,e.id,3).expect(200);expect(await registrations()).toEqual(before);
 const empty=await event();expect((await change(owner,empty.id,1).expect(200)).body.data).toMatchObject({capacity:1,registeredCount:0,remainingPlaces:1});
});
test('S2-B-API-04 / below ACTIVE count rejects with exact no-write snapshot',async()=>{
 const owner=await actor();const e=await event(5);await fixtures(e.id,3,2);const before=await snapshot();
 expect((await change(owner,e.id,2).expect(409)).body.error.code).toBe('CAPACITY_BELOW_ACTIVE_COUNT');
 expect(await snapshot()).toEqual(before);
});
test('S2-B-API-05 / closed event rejects even no-op and deadline wins over active count',async()=>{
 const owner=await actor();const e=await event(4);await fixtures(e.id,3);
 await pool.query('UPDATE events SET registration_deadline=clock_timestamp() WHERE id=$1',[e.id]);const before=await snapshot();
 for(const n of [4,2,6])expect((await change(owner,e.id,n).expect(409)).body.error.code).toBe('CAPACITY_CHANGE_CLOSED');
 expect(await snapshot()).toEqual(before);
});
test('S2-B-API-06 / role, ownership, CSRF and absent event are denied without private data or writes',async()=>{
 const owner=await actor();const foreign=await actor('organizer2@example.test');const p=await actor('participant@example.test');const e=await event();const before=await snapshot();
 await request(app).patch(`/api/events/${e.id}/capacity`).send({capacity:3}).expect(401);
 await change(p,e.id,3).expect(403);
 const hidden=(await change(foreign,e.id,3).expect(404)).body;
 expect((await change(foreign,randomUUID(),3).expect(404)).body).toEqual(hidden);expect(hidden.data).toBeUndefined();
 await change(owner,randomUUID(),3).expect(404);
 await owner.agent.patch(`/api/events/${e.id}/capacity`).send({capacity:3}).expect(403);
 await owner.agent.patch(`/api/events/${e.id}/capacity`).set('X-CSRF-Token','incorrect').send({capacity:3}).expect(403);
 expect(await snapshot()).toEqual(before);
});
async function waitForEventLocks(count:number){
 const until=Date.now()+5000;
 while(Date.now()<until){
  const waiting=await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE application_name IN ('s2-capacity-api','s2-capacity-rival') AND wait_event_type='Lock' AND query LIKE '%FROM events%FOR UPDATE%'");
  if(waiting.rows[0].n>=count)return;
  await new Promise(r=>setTimeout(r,10));
 }
 throw new Error('Expected actual event lock wait not observed');
}
async function compete(id:string,actions:(()=>PromiseLike<request.Response>)[]){
 const blocker=await pool.connect();let pending:Promise<request.Response[]>|undefined;
 try{
  await blocker.query('BEGIN');await blocker.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[id]);
  pending=Promise.all(actions.map(a=>a()));await waitForEventLocks(actions.length);await blocker.query('COMMIT');return await pending;
 }finally{await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
}
async function invariant(id:string){
 const row=(await pool.query("SELECT capacity,(SELECT count(*)::int FROM registrations WHERE event_id=$1 AND status='ACTIVE') AS active FROM events WHERE id=$1",[id])).rows[0];
 expect(row.active).toBeLessThanOrEqual(row.capacity);
 const duplicates=await pool.query('SELECT event_id,participant_id FROM registrations GROUP BY event_id,participant_id HAVING count(*)>1');expect(duplicates.rows).toEqual([]);
 return row;
}
test('S2-B-API-07 / independent pools serialize reduction/increase with registrations and lifecycle races',async()=>{
 const owner=await actor();const p=await actor('participant@example.test');const p2=await actor('participant2@example.test',rival);
 const e=await event(2);const original=(await register(p,e.id).expect(201)).body.data;
 const reduction=await compete(e.id,[()=>change(owner,e.id,1),()=>register(p2,e.id)]);
 expect([[200,409],[409,201]]).toContainEqual(reduction.map(r=>r.status));await invariant(e.id);
 if(reduction[0].status===409)expect(reduction[0].body.error.code).toBe('CAPACITY_BELOW_ACTIVE_COUNT');
 else expect(reduction[1].body.error.code).toBe('EVENT_FULL');
 // Use another Thai day so the remaining scenarios exercise capacity, not quota.
 const next=await event(1);await pool.query("UPDATE events SET starts_at=starts_at+interval '1 day' WHERE id=$1",[next.id]);
 await register(p,next.id).expect(201);
 const increase=await compete(next.id,[()=>change(owner,next.id,2),()=>register(p2,next.id)]);
 expect(increase[0].status).toBe(200);expect([201,409]).toContain(increase[1].status);
 if(increase[1].status===409){expect(increase[1].body.error.code).toBe('EVENT_FULL');await register(p2,next.id).expect(201);}await invariant(next.id);
 // Start one ACTIVE and one CANCELLED, with both IDs already persisted.
 await cancel(p,original.id).expect(200);
 let second=(await pool.query('SELECT id FROM registrations WHERE event_id=$1 AND participant_id=$2',[e.id,demoIds.participant2])).rows[0];
 if(!second){await change(owner,e.id,2).expect(200);second=(await register(p2,e.id).expect(201)).body.data;}
 const mix=await compete(e.id,[()=>change(owner,e.id,1),()=>register(p,e.id),()=>cancel(p2,second.id)]);
 expect([200,409]).toContain(mix[0].status);expect([200,409]).toContain(mix[1].status);expect(mix[2].status).toBe(200);await invariant(e.id);
 if(mix[0].status===409)expect(mix[0].body.error.code).toBe('CAPACITY_BELOW_ACTIVE_COUNT');
 if(mix[1].status===409)expect(mix[1].body.error.code).toBe('EVENT_FULL');
 const own=(await pool.query('SELECT id FROM registrations WHERE event_id=$1 AND participant_id=$2',[e.id,demoIds.participant])).rows[0];expect(own.id).toBe(original.id);
});
test('S2-B-API-05b / DB clock is read after an observed event-lock wait across cutoff',async()=>{
 const owner=await actor('organizer@example.test',rival);const e=await event(3);const blocker=await pool.connect();let pending:Promise<request.Response>|undefined;
 try{
  await blocker.query('BEGIN');await blocker.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[e.id]);
  pending=change(owner,e.id,4).then(r=>r);await waitForEventLocks(1);
  await blocker.query('UPDATE events SET registration_deadline=clock_timestamp() WHERE id=$1',[e.id]);await blocker.query('COMMIT');
  const before=await snapshot();const response=await pending;expect(response.status).toBe(409);expect(response.body.error.code).toBe('CAPACITY_CHANGE_CLOSED');expect(await snapshot()).toEqual(before);
 }finally{await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
});
test('S2-B-REG-01 / fresh app and pool retrieve saved capacity, ACTIVE counts and unchanged lifecycle data',async()=>{
 const owner=await actor();const e=await event(5);await fixtures(e.id,1,2);const before=await registrations();
 await change(owner,e.id,2).expect(200);
 const fresh=new Pool({connectionString:url});
 try{
  const reopened=createApp(fresh,secret,false,false);const o=await actor('organizer@example.test',reopened);
  expect((await request(reopened).get(`/api/events/${e.id}`).expect(200)).body.data).toMatchObject({capacity:2,registeredCount:1,remainingPlaces:1});
  expect((await o.agent.get(`/api/events/${e.id}/registrations`).expect(200)).body.data).toHaveLength(1);
  expect(await registrations()).toEqual(before);
 }finally{await fresh.end();}
});
