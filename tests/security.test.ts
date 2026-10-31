import "dotenv/config";
import { afterAll, beforeAll, expect, test } from "vitest";
import { Pool } from "pg";
import request from "supertest";
import { createApp } from "../server/src/app.js";
import { migrate } from "../server/scripts/migrate.js";
import { seed, demoIds } from "../server/scripts/seed.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Dedicated *_test database required.");
const pool = new Pool({ connectionString: url });
const secret = "security-test-session-secret-at-least-32-chars";
const password = "Synthetic-security-tests-2026!";
beforeAll(async () => {
  await migrate(pool);
  await pool.query("TRUNCATE registrations,events,users,session CASCADE");
  await seed(pool, password);
});
afterAll(async () => {
  await pool.end();
});

test("T-13 / AC-01,03 failed-login throttling preserves successful use", async () => {
  const app = createApp(pool, secret);
  const agent = request.agent(app);
  const token = (await agent.get("/api/auth/csrf").expect(200)).body.data
    .csrfToken;
  for (let n = 0; n < 20; n++)
    await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", token)
      .send({ email: "participant@example.test", password: "incorrect" })
      .expect(401);
  const blocked = await agent
    .post("/api/auth/login")
    .set("X-CSRF-Token", token)
    .send({ email: "participant@example.test", password })
    .expect(429);
  expect(blocked.body.error.code).toBe("LOGIN_RATE_LIMIT");
  await agent.get("/api/auth/me").expect(401);
});

test("T-14 / AC-02,03 production cookies require HTTPS and retain CSRF protections", async () => {
  const app = createApp(pool, secret, true);
  const bootstrap = await request(app)
    .get("/api/auth/csrf")
    .set("X-Forwarded-Proto", "https")
    .expect(200);
  const cookie = bootstrap.headers["set-cookie"][0].split(";")[0];
  expect(bootstrap.headers["set-cookie"][0]).toMatch(/; Secure/);
  expect(bootstrap.headers["set-cookie"][0]).toMatch(/; HttpOnly/);
  const login = await request(app)
    .post("/api/auth/login")
    .set("X-Forwarded-Proto", "https")
    .set("Cookie", cookie)
    .set("X-CSRF-Token", bootstrap.body.data.csrfToken)
    .send({ email: "participant@example.test", password })
    .expect(200);
  expect(login.headers["set-cookie"][0]).toMatch(/; Secure/);
  expect(login.headers["set-cookie"][0]).toMatch(/; SameSite=Lax/);
  expect(login.headers["cache-control"]).toBe("no-store");
});
