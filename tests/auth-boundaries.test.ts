import "dotenv/config";
import { beforeAll, afterAll, expect, test } from "vitest";
import { Pool } from "pg";
import request from "supertest";
import { createApp } from "../server/src/app.js";
import { migrate } from "../server/src/migrate.js";
import { seed, demoIds } from "../server/src/seed.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Dedicated *_test database required.");
const pool = new Pool({ connectionString: url });
const app = createApp(pool, "auth-boundary-secret-at-least-32-characters");
const password = "Auth-boundary-synthetic-password!";
beforeAll(async () => {
  await migrate(pool);
  await pool.query("TRUNCATE registrations,events,users,session CASCADE");
  await seed(pool, password);
});
afterAll(async () => {
  await pool.end();
});
test("AUTH-BOUND-01 identity and login/logout enforce authentication and CSRF before domain routes exist", async () => {
  await request(app).get("/api/auth/me").expect(401);
  await request(app)
    .post("/api/auth/login")
    .send({ email: "participant@example.test", password })
    .expect(403);
  const agent = request.agent(app);
  const token = (await agent.get("/api/auth/csrf").expect(200)).body.data
    .csrfToken;
  await agent
    .post("/api/auth/login")
    .set("X-CSRF-Token", "wrong")
    .send({ email: "participant@example.test", password })
    .expect(403);
  const login = await agent
    .post("/api/auth/login")
    .set("X-CSRF-Token", token)
    .send({ email: "participant@example.test", password })
    .expect(200);
  expect(login.body.data.user.role).toBe("PARTICIPANT");
  await agent.post("/api/auth/logout").send({}).expect(403);
  await agent
    .post("/api/auth/logout")
    .set("X-CSRF-Token", login.body.data.csrfToken)
    .send({})
    .expect(204);
  await agent.get("/api/auth/me").expect(401);
});

test("AUTH-BOUND-02 / AC-01,03 both roles retain server identity and reject malformed or spoofed login fields", async () => {
  for (const [email, id, role] of [
    ["participant@example.test", demoIds.participant, "PARTICIPANT"],
    ["organizer@example.test", demoIds.organizer, "ORGANIZER"],
  ]) {
    const agent = request.agent(app);
    const token = (await agent.get("/api/auth/csrf").expect(200)).body.data
      .csrfToken;
    for (const input of [
      { email, password, role: "ORGANIZER", userId: demoIds.organizer2 },
      { email: "invalid-email", password },
      { email, password: "" },
      { email, password: "x".repeat(257) },
    ]) {
      const rejected = await agent
        .post("/api/auth/login")
        .set("X-CSRF-Token", token)
        .send(input)
        .expect(400);
      expect(rejected.body.error.code).toBe("VALIDATION_ERROR");
      await agent.get("/api/auth/me").expect(401);
    }
    const login = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", token)
      .send({ email: email.toUpperCase(), password })
      .expect(200);
    expect(login.body.data.user).toMatchObject({ id, email, role });
    expect(login.body.data.user).not.toHaveProperty("password_hash");
    const identity = await agent.get("/api/auth/me").expect(200);
    expect(identity.body.data).toMatchObject({ id, email, role });
    expect(identity.body.data).not.toHaveProperty("password_hash");
  }
});

test("AUTH-BOUND-03 / AC-03 current identity rechecks the stored role and rejects a deleted account", async () => {
  const agent = request.agent(app);
  const token = (await agent.get("/api/auth/csrf").expect(200)).body.data
    .csrfToken;
  await agent
    .post("/api/auth/login")
    .set("X-CSRF-Token", token)
    .send({ email: "participant2@example.test", password })
    .expect(200);
  await pool.query("UPDATE users SET role='ORGANIZER' WHERE id=$1", [
    demoIds.participant2,
  ]);
  const changed = await agent.get("/api/auth/me").expect(200);
  expect(changed.body.data).toMatchObject({
    id: demoIds.participant2,
    role: "ORGANIZER",
  });
  await pool.query("DELETE FROM users WHERE id=$1", [demoIds.participant2]);
  const revoked = await agent.get("/api/auth/me").expect(401);
  expect(revoked.body.error.code).toBe("UNAUTHENTICATED");
});

test("AUTH-BOUND-04 / AC-02 a new login has an eight-hour persisted session lifetime", async () => {
  const agent = request.agent(app);
  const token = (await agent.get("/api/auth/csrf").expect(200)).body.data
    .csrfToken;
  const startedAt = Date.now();
  const login = await agent
    .post("/api/auth/login")
    .set("X-CSRF-Token", token)
    .send({ email: "organizer2@example.test", password })
    .expect(200);
  const cookie = login.headers["set-cookie"][0];
  const expires = /Expires=([^;]+)/i.exec(cookie)?.[1];
  expect(expires).toBeDefined();
  const eightHours = 8 * 60 * 60 * 1000;
  expect(Math.abs(Date.parse(expires!) - startedAt - eightHours)).toBeLessThan(
    10000,
  );
  // The store compares expire with to_timestamp(...); use the database's zone,
  // rather than interpreting its timestamp-without-zone in the Node process zone.
  const sessions = await pool.query(
    "SELECT expire::timestamptz AS expire FROM session WHERE sess->>'userId'=$1",
    [demoIds.organizer2],
  );
  expect(sessions.rowCount).toBe(1);
  expect(
    Math.abs(sessions.rows[0].expire.getTime() - startedAt - eightHours),
  ).toBeLessThan(10000);
});
