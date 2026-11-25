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
