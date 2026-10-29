import "dotenv/config";
import { beforeAll, afterAll, expect, test } from "vitest";
import { Pool } from "pg";
import request from "supertest";
import { createApp } from "../server/src/app.js";
import { migrate } from "../server/src/migrate.js";
import { seed } from "../server/src/seed.js";
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
