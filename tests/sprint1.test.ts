import "dotenv/config";
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createApp } from "../server/src/app.js";
import { migrate } from "../server/scripts/migrate.js";
import { seed, demoIds } from "../server/scripts/seed.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error(
    "TEST_DATABASE_URL must name a dedicated database ending in _test.",
  );
const pool = new Pool({ connectionString: url, max: 12 });
const secondPool = new Pool({ connectionString: url, max: 12 });
const secret = "test-session-secret-only-32-characters-minimum";
const app = createApp(pool, secret);
const secondApp = createApp(secondPool, secret);
const password = "Synthetic-tests-only-2026!";

type Actor = {
  agent: ReturnType<typeof request.agent>;
  token: string;
  cookie: string;
};
async function actor(
  email = "participant@example.test",
  target = app,
): Promise<Actor> {
  const agent = request.agent(target);
  const bootstrap = await agent.get("/api/auth/csrf").expect(200);
  const response = await agent
    .post("/api/auth/login")
    .set("X-CSRF-Token", bootstrap.body.data.csrfToken)
    .send({ email, password })
    .expect(200);
  return {
    agent,
    token: response.body.data.csrfToken,
    cookie: response.headers["set-cookie"][0].split(";")[0],
  };
}
const future = (hours: number) =>
  new Date(Date.now() + hours * 3600000).toISOString();
const eventBody = (overrides: Record<string, unknown> = {}) => ({
  title: `Workshop ${randomUUID().slice(0, 8)}`,
  description: "A meaningful workshop description for everyone.",
  location: "Campus studio",
  capacity: 2,
  startsAt: future(48),
  registrationDeadline: future(24),
  ...overrides,
});
async function publish(owner: Actor, overrides: Record<string, unknown> = {}) {
  const res = await owner.agent
    .post("/api/events")
    .set("X-CSRF-Token", owner.token)
    .send(eventBody(overrides))
    .expect(201);
  return res.body.data;
}
const register = (who: Actor, id: string, body: unknown = {}) =>
  who.agent
    .post(`/api/events/${id}/registrations`)
    .set("X-CSRF-Token", who.token)
    .send(body);

beforeAll(async () => {
  await migrate(pool);
  // This suite owns only the explicitly named disposable *_test database.
  await pool.query("TRUNCATE registrations, events, users, session CASCADE");
  await seed(pool, password);
});
afterAll(async () => {
  await Promise.all([pool.end(), secondPool.end()]);
});

describe("F-01 Identity and session security", () => {
  test("T-01 / AC-01 valid and invalid login, generic rejection, password hashing", async () => {
    const who = await actor();
    const me = await who.agent.get("/api/auth/me").expect(200);
    expect(me.body.data).toMatchObject({
      id: demoIds.participant,
      role: "PARTICIPANT",
    });
    expect(me.body.data).not.toHaveProperty("password_hash");
    const hash = (
      await pool.query("SELECT password_hash FROM users WHERE id=$1", [
        demoIds.participant,
      ])
    ).rows[0].password_hash;
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain(password);
    const agent = request.agent(app);
    const csrf = (await agent.get("/api/auth/csrf")).body.data.csrfToken;
    const wrong = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", csrf)
      .send({ email: "participant@example.test", password: "wrong" })
      .expect(401);
    const missing = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", csrf)
      .send({ email: "nobody@example.test", password: "wrong" })
      .expect(401);
    expect(wrong.body).toEqual(missing.body);
    await agent.get("/api/auth/me").expect(401);
  });

  test("T-02 / AC-02 session rotation, expiry, logout revocation, recreation persistence", async () => {
    const agent = request.agent(app);
    const bootstrap = await agent.get("/api/auth/csrf").expect(200);
    const oldCookie = bootstrap.headers["set-cookie"][0].split(";")[0];
    const login = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", bootstrap.body.data.csrfToken)
      .send({ email: "participant@example.test", password })
      .expect(200);
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    expect(cookie).not.toEqual(oldCookie);
    expect(login.body.data.csrfToken).not.toEqual(
      bootstrap.body.data.csrfToken,
    );
    expect(login.headers["set-cookie"][0]).toMatch(/HttpOnly/);
    expect(login.headers["set-cookie"][0]).toMatch(/SameSite=Lax/);
    await request(secondApp)
      .get("/api/auth/me")
      .set("Cookie", cookie)
      .expect(200);
    await request(app).get("/api/auth/me").set("Cookie", oldCookie).expect(401);
    await agent
      .post("/api/auth/logout")
      .set("X-CSRF-Token", login.body.data.csrfToken)
      .send({})
      .expect(204);
    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);
    const expired = await actor("participant2@example.test");
    await pool.query(
      "UPDATE session SET expire=now()-interval '1 minute' WHERE sess->>'userId'=$1",
      [demoIds.participant2],
    );
    await expired.agent.get("/api/auth/me").expect(401);
  });
});

describe("F-02 Publication", () => {
  test("T-04 / AC-04 roles and server-assigned ownership", async () => {
    const participant = await actor();
    await participant.agent
      .post("/api/events")
      .set("X-CSRF-Token", participant.token)
      .send(eventBody())
      .expect(403);
    const owner = await actor("organizer@example.test");
    const event = await publish(owner, { capacity: 1 });
    expect(event.organizerId).toBe(demoIds.organizer);
    const saved = await pool.query("SELECT capacity FROM events WHERE id=$1", [
      event.id,
    ]);
    expect(saved.rows[0].capacity).toBe(1);
    for (const forged of [
      { organizerId: demoIds.organizer2 },
      { role: "ORGANIZER" },
    ]) {
      await owner.agent
        .post("/api/events")
        .set("X-CSRF-Token", owner.token)
        .send(eventBody(forged))
        .expect(400);
    }
    // Published capacity has no mutation route in this sprint.
    await owner.agent
      .patch(`/api/events/${event.id}`)
      .set("X-CSRF-Token", owner.token)
      .send({ capacity: 0 })
      .expect(404);
  });

  test("T-05 / AC-05 publication boundaries leave storage unchanged", async () => {
    const owner = await actor("organizer@example.test");
    const before = (await pool.query("SELECT count(*)::int AS n FROM events"))
      .rows[0].n;
    for (const invalid of [
      { capacity: 0 },
      { capacity: -1 },
      { capacity: 1.5 },
      { capacity: 1000001 },
      { capacity: "2" },
      { title: "  " },
      { title: "a".repeat(121) },
      { description: "short" },
      { description: "a".repeat(4001) },
      { location: "" },
      { location: "a".repeat(201) },
      { startsAt: future(-1) },
      { registrationDeadline: future(-1) },
      { registrationDeadline: future(72) },
      { startsAt: "2027-11-01T10:00:00" },
    ]) {
      const res = await owner.agent
        .post("/api/events")
        .set("X-CSRF-Token", owner.token)
        .send(eventBody(invalid))
        .expect(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM events")).rows[0].n,
    ).toBe(before);
    const time = future(48);
    await publish(owner, {
      startsAt: time,
      registrationDeadline: time,
      capacity: 1000000,
    });
  });
});
