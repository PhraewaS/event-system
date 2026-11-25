import "dotenv/config";
import { beforeAll, beforeEach, afterAll, test, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createApp } from "../server/src/app.js";
import { migrate } from "../server/src/migrate.js";
import { seed, demoIds } from "../server/src/seed.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Dedicated *_test DB required");
const pool = new Pool({connectionString:url, max:12,application_name:"s2-primary-api"});
const other = new Pool({connectionString:url,max:12,application_name:"s2-other-api"});
const secret = "sprint2-synthetic-session-secret-32-characters";
const password = "Sprint2-synthetic-test-password!";
const app = createApp(pool,secret,false,true);
const second = createApp(other,secret,false,true);
const disabled = createApp(other,secret,false,false);
const day = new Date(Date.now()+30*86400000).toISOString().slice(0,10);
type Actor = {agent:ReturnType<typeof request.agent>; token:string; cookie:string};
async function actor(email="participant@example.test",target=app):Promise<Actor>{
 const agent=request.agent(target); const bootstrap=await agent.get("/api/auth/csrf").expect(200);
 const login=await agent.post("/api/auth/login").set("X-CSRF-Token",bootstrap.body.data.csrfToken).send({email,password}).expect(200);
 return {agent,token:login.body.data.csrfToken,cookie:login.headers["set-cookie"][0].split(";")[0]};
}
async function event(capacity=10,startsAt=`${day}T12:00:00+07:00`){
 const o=await actor("organizer@example.test");
 return (await o.agent.post("/api/events").set("X-CSRF-Token",o.token).send({title:`S2 ${randomUUID()}`,description:"Synthetic Sprint 2 lifecycle fixture.",location:"S2 Room",capacity,startsAt,registrationDeadline:new Date(Date.parse(startsAt)-86400000).toISOString()}).expect(201)).body.data;
}
const post=(p:Actor,id:string)=>p.agent.post(`/api/events/${id}/registrations`).set("X-CSRF-Token",p.token).send({});
const cancel=(p:Actor,id:string)=>p.agent.post(`/api/registrations/${id}/cancel`).set("X-CSRF-Token",p.token).send({});
const quota=(p:Actor)=>p.agent.get(`/api/registrations/quota?date=${day}`);
const rows=async()=> (await pool.query("SELECT * FROM registrations ORDER BY id")).rows;
const publicEvent=(id:string)=>request(app).get(`/api/events/${id}`);
async function waitForLock(queryPrefix:string,count=1){
 const end=Date.now()+5000;
 while(Date.now()<end){
  const waiting=await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE application_name IN ('s2-primary-api','s2-other-api') AND wait_event_type='Lock' AND query LIKE $1",[queryPrefix+'%']);
  if(waiting.rows[0].n>=count)return;
  await new Promise(r=>setTimeout(r,10));
 }
 throw new Error('Expected actual database lock wait was not observed');
}
async function compete(actions:(()=>PromiseLike<request.Response>)[]){
 const blocker=await pool.connect();let pending:Promise<request.Response[]>|undefined;
 try{
  await blocker.query('BEGIN');await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[demoIds.participant]);
  pending=Promise.all(actions.map(a=>a()));
  await waitForLock('SELECT id FROM users WHERE id=',2);await blocker.query('COMMIT');return await pending;
 }finally{await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
}
beforeAll(async()=>{await migrate(pool); await pool.query("TRUNCATE registrations,events,users,session,login_rate_limits CASCADE");await seed(pool,password);});
beforeEach(async()=>{await pool.query("TRUNCATE registrations,events,session,login_rate_limits CASCADE");});
afterAll(async()=>{await Promise.all([pool.end(),other.end()]);});

test('S2-A-API-10 / server cancellation eligibility follows DB clock, state and write gate',async()=>{
 const p=await actor();const e=await event();const r=(await post(p,e.id).expect(201)).body.data;
 const own=()=>p.agent.get(`/api/registrations/${r.id}`);
 expect((await own()).body.data.canCancel).toBe(true);
 const off=await actor('participant@example.test',disabled);
 expect((await off.agent.get('/api/registrations/mine')).body.data[0].canCancel).toBe(false);
 await cancel(p,r.id).expect(200);expect((await own()).body.data.canCancel).toBe(false);
 await post(p,e.id).expect(200);
 await pool.query('UPDATE events SET registration_deadline=clock_timestamp() WHERE id=$1',[e.id]);
 expect((await own()).body.data.canCancel).toBe(false);
 expect((await p.agent.get('/api/registrations/mine')).body.data[0].canCancel).toBe(false);
});

test("S2-A-API-01 / primary RED: cancel releases exactly one place and quota and preserves own record",async()=>{
 const p=await actor();const e=await event(1);const original=(await post(p,e.id).expect(201)).body.data;
 expect((await quota(p)).body.data.registeredCount).toBe(1);
 const response=await cancel(p,original.id);
 expect(response.status).toBe(200);
 expect(response.body.data).toMatchObject({id:original.id,eventId:e.id,participantId:demoIds.participant,status:"CANCELLED",createdAt:original.createdAt});
 expect(response.body.data.cancelledAt).toBeTruthy();
 expect((await publicEvent(e.id)).body.data).toMatchObject({registeredCount:0,remainingPlaces:1,registrationOpen:true});
 expect((await quota(p)).body.data).toMatchObject({registeredCount:0,remaining:2});
 const own=(await p.agent.get(`/api/registrations/${original.id}`).expect(200)).body.data;
 expect(own).toMatchObject({id:original.id,status:"CANCELLED"});
 const persisted=await other.query("SELECT id,status FROM registrations WHERE id=$1",[original.id]);
 expect(persisted.rows).toEqual([{id:original.id,status:"CANCELLED"}]);
});

test("S2-A-API-02 / repeated cancel is idempotent even after cutoff and with writes disabled",async()=>{
 const p=await actor();const e=await event();const r=(await post(p,e.id).expect(201)).body.data;
 await cancel(p,r.id).expect(200);const before=await rows();
 await pool.query("UPDATE events SET registration_deadline=clock_timestamp() WHERE id=$1",[e.id]);
 const off=await actor("participant@example.test",disabled);
 await cancel(off,r.id).expect(200);expect(await rows()).toEqual(before);
 expect((await quota(p)).body.data.registeredCount).toBe(0);
});

test("S2-A-API-03 / active cancellation at or after deadline rejects without writes",async()=>{
 const p=await actor();const e=await event();const r=(await post(p,e.id).expect(201)).body.data;
 const before=await rows();await pool.query("UPDATE events SET registration_deadline=clock_timestamp() WHERE id=$1",[e.id]);
 expect((await cancel(p,r.id).expect(409)).body.error.code).toBe("CANCELLATION_CLOSED");expect(await rows()).toEqual(before);
});

test("S2-A-API-04 / reactivation returns same ID with new activation and normal inserts stay 201",async()=>{
 const p=await actor();const e=await event();const r=(await post(p,e.id).expect(201)).body.data;
 await cancel(p,r.id).expect(200);
 const active=(await post(p,e.id).expect(200)).body.data;
 expect(active).toMatchObject({id:r.id,createdAt:r.createdAt,status:"ACTIVE",cancelledAt:null});
 expect(Date.parse(active.registeredAt)).toBeGreaterThanOrEqual(Date.parse(r.registeredAt));
 expect((await rows()).length).toBe(1);expect((await quota(p)).body.data.registeredCount).toBe(1);
});

test("S2-A-API-05 / active duplicate, closed, full and quota precedence with no rejected writes",async()=>{
 const p=await actor();const e=await event(1);const r=(await post(p,e.id).expect(201)).body.data;
 await cancel(p,r.id).expect(200);const p2=await actor("participant2@example.test");await post(p2,e.id).expect(201);
 let before=await rows();expect((await post(p,e.id).expect(409)).body.error.code).toBe("EVENT_FULL");expect(await rows()).toEqual(before);
 await pool.query("UPDATE events SET registration_deadline=clock_timestamp() WHERE id=$1",[e.id]);
 before=await rows();expect((await post(p,e.id).expect(409)).body.error.code).toBe("REGISTRATION_CLOSED");expect(await rows()).toEqual(before);
 expect((await post(p2,e.id).expect(409)).body.error.code).toBe("DUPLICATE_REGISTRATION");
 const q=await event();const qr=(await post(p,q.id).expect(201)).body.data;await cancel(p,qr.id).expect(200);
 await post(p,(await event()).id).expect(201);await post(p,(await event()).id).expect(201);before=await rows();
 expect((await post(p,q.id).expect(409)).body.error.code).toBe("DAILY_REGISTRATION_LIMIT");expect(await rows()).toEqual(before);
});

test("S2-A-API-06 / ACTIVE-only full aggregate, Thai date/person separation and grandfathered legacy",async()=>{
 const p=await actor();const p2=await actor("participant2@example.test");const ids:string[]=[];
 for(let i=0;i<203;i++){
  const e=await event();ids.push(e.id);
  await pool.query("INSERT INTO registrations(id,event_id,participant_id,status,cancelled_at) VALUES($1,$2,$3,$4,$5)",[randomUUID(),e.id,demoIds.participant,i<200?"CANCELLED":"ACTIVE",i<200?new Date():null]);
 }
 expect((await quota(p)).body.data).toMatchObject({registeredCount:3,remaining:0,canRegister:false});
 const before=await rows();await post(p,(await event()).id).expect(409);expect(await rows()).toEqual(before);
 const owned=(await p.agent.get("/api/registrations/mine")).body;expect(owned.data.length).toBe(200);expect(owned.page.nextOffset).toBe(200);
 expect((await p.agent.get("/api/registrations/mine?offset=200")).body.data.length).toBe(3);
 await post(p2,ids[0]).expect(201);expect((await quota(p2)).body.data.registeredCount).toBe(1);
 const tomorrow=new Date(Date.parse(day)+86400000).toISOString().slice(0,10);
 await post(p,(await event(10,`${tomorrow}T00:00:00+07:00`)).id).expect(201);
 expect((await quota(p)).body.data.registeredCount).toBe(3);
});

test("S2-A-API-07 / server authorization, CSRF and strict payload preserve data",async()=>{
 const p=await actor();const p2=await actor("participant2@example.test");const o=await actor("organizer@example.test");const e=await event();const r=(await post(p,e.id).expect(201)).body.data;const before=await rows();
 await request(app).post(`/api/registrations/${r.id}/cancel`).send({}).expect(401);
 await cancel(o,r.id).expect(403);await cancel(p2,r.id).expect(404);await cancel(p,randomUUID()).expect(404);
 await p.agent.post(`/api/registrations/${r.id}/cancel`).send({}).expect(403);
 await p.agent.post(`/api/registrations/${r.id}/cancel`).set("X-CSRF-Token",p.token).send({participantId:demoIds.participant2}).expect(400);
 await cancel(p,"invalid").expect(400);expect(await rows()).toEqual(before);
});

test("S2-A-API-08 / concurrent repeated cancel/reactivate and quota races through independent pools",async()=>{
 const p=await actor();const rival=await actor("participant@example.test",second);const e=await event(1);const r=(await post(p,e.id).expect(201)).body.data;
 const cancelled=await compete([()=>cancel(p,r.id),()=>cancel(rival,r.id)]);expect(cancelled.map(x=>x.status)).toEqual([200,200]);
 expect((await quota(p)).body.data.registeredCount).toBe(0);
 const active=await compete([()=>post(p,e.id),()=>post(rival,e.id)]);expect(active.map(x=>x.status).sort()).toEqual([200,409]);expect((await rows()).length).toBe(1);
 const b=await event();const c=await event();const race=await compete([()=>post(p,b.id),()=>post(rival,c.id)]);
 expect(race.map(x=>x.status).sort()).toEqual([201,409]);expect((await quota(p)).body.data.registeredCount).toBe(2);
 const loser=race[0].status===409?b:c; const mixed=await compete([()=>cancel(p,r.id),()=>post(rival,loser.id)]);
 expect(mixed[0].status).toBe(200);expect([201,409]).toContain(mixed[1].status);
 expect((await quota(p)).body.data.registeredCount).toBeLessThanOrEqual(2);
 expect((await publicEvent(e.id)).body.data.registeredCount).toBe(0);
});

test('S2-A-API-03b / cancellation reads database clock after actual event lock wait',async()=>{
 const p=await actor();const rival=await actor('participant@example.test',second);const e=await event();const r=(await post(p,e.id).expect(201)).body.data;const before=await rows();
 const blocker=await pool.connect();let pending:Promise<request.Response>|undefined;
 try{
  await blocker.query('BEGIN');await blocker.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[e.id]);
  pending=cancel(rival,r.id).then(x=>x);await waitForLock('SELECT registration_deadline FROM events');
  await blocker.query('UPDATE events SET registration_deadline=clock_timestamp() WHERE id=$1',[e.id]);await blocker.query('COMMIT');
  const response=await pending;expect(response.status).toBe(409);expect(response.body.error.code).toBe('CANCELLATION_CLOSED');expect(await rows()).toEqual(before);
 }finally{await blocker.query('ROLLBACK');blocker.release();if(pending)await pending.catch(()=>{});}
});

test("S2-A-API-09 / owner/public/own read models agree and disabled writes fail safely",async()=>{
 const p=await actor();const off=await actor("participant@example.test",disabled);const o=await actor("organizer@example.test");const e=await event();const r=(await post(off,e.id).expect(201)).body.data;let before=await rows();
 expect((await cancel(off,r.id).expect(503)).body.error.code).toBe("REGISTRATION_CHANGES_DISABLED");expect(await rows()).toEqual(before);
 await cancel(p,r.id).expect(200);before=await rows();expect((await post(off,e.id).expect(503)).body.error.code).toBe("REGISTRATION_CHANGES_DISABLED");expect(await rows()).toEqual(before);
 expect((await o.agent.get(`/api/events/${e.id}/registrations`)).body.data).toEqual([]);
 expect((await o.agent.get("/api/organizer/events")).body.data[0].registeredCount).toBe(0);
 expect((await p.agent.get("/api/registrations/mine")).body.data[0].status).toBe("CANCELLED");
 await post(p,e.id).expect(200);expect((await o.agent.get(`/api/events/${e.id}/registrations`)).body.data.length).toBe(1);
});
