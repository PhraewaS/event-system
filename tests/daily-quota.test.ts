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
const pool = new Pool({ connectionString: url, max: 12 });
const other = new Pool({ connectionString: url, max: 12, application_name: "lab7-competing-api" });
const secret = "lab7-synthetic-session-secret-at-least-32";
const app = createApp(pool, secret);
const otherApp = createApp(other, secret);
const password = "Lab7-synthetic-test-password!";
const day = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const nextDay = new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10);
type Actor = { agent: ReturnType<typeof request.agent>; token: string; cookie: string };
async function actor(email = "participant@example.test", target = app): Promise<Actor> {
  const agent = request.agent(target);
  const bootstrap = await agent.get("/api/auth/csrf").expect(200);
  const response = await agent.post("/api/auth/login").set("X-CSRF-Token", bootstrap.body.data.csrfToken)
    .send({ email, password }).expect(200);
  return { agent, token: response.body.data.csrfToken, cookie: response.headers["set-cookie"][0].split(";")[0] };
}
async function event(startsAt = `${day}T12:00:00+07:00`, capacity = 10) {
  const owner = await actor("organizer@example.test");
  return (await owner.agent.post("/api/events").set("X-CSRF-Token", owner.token).send({
    title: `Quota ${randomUUID()}`, description: "Synthetic Lab7 real publication fixture.",
    location: "Lab7 Room", capacity, startsAt,
    registrationDeadline: new Date(Date.parse(startsAt) - 86400000).toISOString(),
  }).expect(201)).body.data;
}
const post = (who: Actor, id: string, body: unknown = {}) => who.agent.post(`/api/events/${id}/registrations`)
  .set("X-CSRF-Token", who.token).send(body);
const quota = (who: Actor, date = day) => who.agent.get(`/api/registrations/quota?date=${date}`);
const snapshot = async () => (await pool.query("SELECT id,event_id,participant_id FROM registrations ORDER BY id")).rows;
async function two(who: Actor) {
  const a = await event(); const b = await event();
  await post(who, a.id).expect(201); await post(who, b.id).expect(201);
  return [a, b];
}
beforeAll(async () => {
  await migrate(pool);
  await pool.query("TRUNCATE registrations,events,users,session,login_rate_limits CASCADE");
  await seed(pool, password);
});
beforeEach(async () => { await pool.query("TRUNCATE registrations,events,session,login_rate_limits CASCADE"); });
afterAll(async () => { await Promise.all([pool.end(), other.end()]); });

test("L7-Q-API-01 / Q01,Q02 primary domain RED: third same-day registration is rejected without writes", async () => {
  const p = await actor(); await two(p); const c = await event(); const before = await snapshot();
  const response = await post(p, c.id);
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe("DAILY_REGISTRATION_LIMIT");
  expect(await snapshot()).toEqual(before);
  expect((await request(app).get(`/api/events/${c.id}`)).body.data).toMatchObject({ registeredCount: 0, remainingPlaces: 10 });
});
test("L7-Q-API-02 / Q03,Q04 Thai midnight, UTC-date independence and separate participants", async () => {
  const p = await actor();
  const a = await event(`${day}T16:59:59.999Z`);
  const b = await event(`${day}T17:00:00.000Z`);
  const c = await event(`${nextDay}T00:00:00.000Z`);
  for (const e of [a,b,c]) await post(p,e.id).expect(201);
  expect((await quota(p)).body.data).toMatchObject({ date: day, registeredCount: 1, remaining: 1 });
  expect((await quota(p,nextDay)).body.data).toMatchObject({ date: nextDay, registeredCount: 2, remaining: 0 });
  await post(p,(await event(`${nextDay}T07:00:00+07:00`)).id).expect(409);
  const p2 = await actor("participant2@example.test"); await post(p2,b.id).expect(201);
  expect((await quota(p2,nextDay)).body.data.registeredCount).toBe(1);
});
test("L7-Q-API-03 / Q05 old duplicate/closed/full precedence survives exhausted quota", async () => {
  const p = await actor(); const [a] = await two(p);
  await pool.query("UPDATE events SET registration_deadline=clock_timestamp() WHERE id=$1",[a.id]);
  expect((await post(p,a.id).expect(409)).body.error.code).toBe("DUPLICATE_REGISTRATION");
  const closed = await event(); await pool.query("UPDATE events SET registration_deadline=clock_timestamp() WHERE id=$1",[closed.id]);
  expect((await post(p,closed.id).expect(409)).body.error.code).toBe("REGISTRATION_CLOSED");
  const full = await event(undefined,1); const p2 = await actor("participant2@example.test"); await post(p2,full.id).expect(201);
  expect((await post(p,full.id).expect(409)).body.error.code).toBe("EVENT_FULL");
});
test("L7-Q-API-04 / Q06 preserved auth, role, CSRF, body, UUID and missing-event denials", async () => {
  const e = await event(); const p = await actor(); const o = await actor("organizer@example.test");
  await request(app).post(`/api/events/${e.id}/registrations`).send({}).expect(401);
  await post(o,e.id).expect(403);
  await p.agent.post(`/api/events/${e.id}/registrations`).send({}).expect(403);
  await post(p,e.id,{participantId:demoIds.participant2}).expect(400);
  await post(p,"bad-uuid").expect(400); await post(p,randomUUID()).expect(404);
  expect(await snapshot()).toEqual([]);
});
test("L7-Q-API-05 / Q02,Q07 direct POST cannot bypass quota and snapshot remains unchanged", async () => {
  const p = await actor(); await two(p); const c = await event();
  const before = await quota(p).expect(200);
  expect(before.body.data).toEqual({date:day,timeZone:"Asia/Bangkok",limit:2,registeredCount:2,remaining:0,canRegister:false});
  const saved = await snapshot(); await post(p,c.id).expect(409);
  expect((await quota(p).expect(200)).body).toEqual(before.body); expect(await snapshot()).toEqual(saved);
});
// Observe real lock waits: no arbitrary sleep used to manufacture a concurrent result.
async function waitForBlocked(minimum: number) {
  const until = Date.now()+5000;
  while (Date.now()<until) {
    const n = (await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()")).rows[0].n;
    if(n>=minimum) return;
    await new Promise(resolve => setTimeout(resolve,10));
  }
  throw new Error(`Expected ${minimum} actual database lock waiters`);
}
test("L7-Q-API-06 / Q08 same participant competing across pools cannot take two remaining slots", async () => {
  const p = await actor(); const pOther = await actor("participant@example.test",otherApp);
  const a = await event(); await post(p,a.id).expect(201); const b = await event(); const c = await event();
  const blocker = await pool.connect(); let pending: Promise<request.Response>[] = [];
  try {
    await blocker.query("BEGIN");
    // Both implementations wait on events; new implementation additionally serializes the user.
    await blocker.query("SELECT id FROM events WHERE id=ANY($1::uuid[]) FOR UPDATE",[[b.id,c.id]]);
    pending = [post(p,b.id).then(r=>r),post(pOther,c.id).then(r=>r)];
    await waitForBlocked(2); await blocker.query("COMMIT");
    const responses = await Promise.all(pending);
    expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
    expect(responses.find(r=>r.status===409)?.body.error.code).toBe("DAILY_REGISTRATION_LIMIT");
    expect((await snapshot()).length).toBe(2);
  } finally { await blocker.query("ROLLBACK"); blocker.release(); await Promise.allSettled(pending); }
});
test("L7-Q-API-07 / Q05,Q08 different participants still compete safely for last seat", async () => {
  const a = await actor(); const b = await actor("participant2@example.test",otherApp); const e = await event(undefined,1);
  const results = await Promise.all([post(a,e.id),post(b,e.id)]);
  expect(results.map(r=>r.status).sort()).toEqual([201,409]);
  expect(results.find(r=>r.status===409)?.body.error.code).toBe("EVENT_FULL"); expect((await snapshot()).length).toBe(1);
});
test("L7-Q-API-08 / Q09 grandfathered rows survive fresh pool, private reads and owner roster", async () => {
  const events = [await event(),await event(),await event()];
  for(const e of events) await pool.query("INSERT INTO registrations(id,participant_id,event_id) VALUES($1,$2,$3)",[randomUUID(),demoIds.participant,e.id]);
  const before = await snapshot(); const fresh = new Pool({connectionString:url});
  try {
    const p = await actor("participant@example.test",createApp(fresh,secret));
    expect((await quota(p).expect(200)).body.data).toMatchObject({registeredCount:3,remaining:0,canRegister:false});
    expect((await p.agent.get("/api/registrations/mine").expect(200)).body.data.map((r:{id:string})=>r.id).sort()).toEqual(before.map(r=>r.id).sort());
    const owner = await actor("organizer@example.test");
    for (const e of events) expect((await owner.agent.get(`/api/events/${e.id}/registrations`).expect(200)).body.data.length).toBe(1);
    await post(p,(await event()).id).expect(409); expect(await snapshot()).toEqual(before);
  } finally { await fresh.end(); }
});
test("L7-Q-API-09 / Q07 strict private date query, roles, privacy and no writes", async () => {
  const p = await actor(); const p2 = await actor("participant2@example.test"); const o = await actor("organizer@example.test"); await two(p);
  const path = "/api/registrations/quota";
  await request(app).get(`${path}?date=${day}`).expect(401); await o.agent.get(`${path}?date=${day}`).expect(403);
  for (const suffix of ["", "?date=2027-02-30", "?date=0000-01-01", "?date=2027-2-01", `?date=${day}&date=${day}`, `?date=${day}&participantId=${demoIds.participant}`, `?date[]=${day}`])
    expect((await p.agent.get(path+suffix).expect(400)).body.error.code).toBe("VALIDATION_ERROR");
  for(const d of ["0001-01-01","2000-02-29","9999-12-31"]) expect((await quota(p,d).expect(200)).body.data.registeredCount).toBe(0);
  const response = await quota(p2).expect(200);
  expect(response.headers["cache-control"]).toContain("no-store");
  expect(response.body.data).toEqual({date:day,timeZone:"Asia/Bangkok",limit:2,registeredCount:0,remaining:2,canRegister:true});
  expect((await snapshot()).length).toBe(2);
});
test("L7-Q-API-10 / Q07,Q10 aggregate includes target rows beyond first 200; static routes coexist", async () => {
  const p = await actor();
  // Explicit legacy fixture: target-day records are oldest, outside first page.
  await pool.query(`WITH made AS (INSERT INTO events(id,organizer_id,title,description,location,capacity,starts_at,registration_deadline)
    SELECT gen_random_uuid(),$1,'Legacy quota fixture','Historical all-row aggregate fixture','Lab7 Room',10,
      $2::date+interval '12 hours'-interval '7 hours'+i*interval '1 day', $2::date-interval '2 days'
      FROM generate_series(0,202) AS i RETURNING id,starts_at)
    INSERT INTO registrations(id,participant_id,event_id,created_at)
      SELECT gen_random_uuid(),$3,id,starts_at FROM made`,[demoIds.organizer,day,demoIds.participant]);
  const first = await p.agent.get("/api/registrations/mine").expect(200); expect(first.body.data.length).toBe(200);
  expect(first.body.data.some((r:{event:{startsAt:string}})=>r.event.startsAt.startsWith(day))).toBe(false);
  expect((await quota(p).expect(200)).body.data.registeredCount).toBe(1);
  await p.agent.get(`/api/registrations/${first.body.data[0].id}`).expect(200);
});
