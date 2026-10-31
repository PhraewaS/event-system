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
beforeAll(async () => {
  await migrate(pool);
  await pool.query("TRUNCATE registrations,events,users,session CASCADE");
  await seed(pool, "Foundation-synthetic-password!");
});
afterAll(async () => {
  await pool.end();
});
test("FOUND-01 health endpoint verifies the real persistent database", async () => {
  const response = await request(
    createApp(pool, "foundation-session-secret-at-least-32-chars"),
  )
    .get("/api/health")
    .expect(200);
  expect(response.body.data.status).toBe("ok");
});
test("FOUND-02 migrations and seed are repeatable and survive an independent connection", async () => {
  await migrate(pool);
  await seed(pool, "Foundation-synthetic-password!");
  const other = new Pool({ connectionString: url });
  try {
    expect(
      (await other.query("SELECT count(*)::int AS n FROM users")).rows[0].n,
    ).toBe(4);
    expect(
      (await other.query("SELECT count(*)::int AS n FROM events")).rows[0].n,
    ).toBe(3);
    expect(
      (await other.query("SELECT password_hash FROM users LIMIT 1")).rows[0]
        .password_hash,
    ).toMatch(/^\$argon2id\$/);
  } finally {
    await other.end();
  }
});
