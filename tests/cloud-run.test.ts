import "dotenv/config";
import { afterAll, beforeAll, expect, test } from "vitest";
import { Pool } from "pg";
import request from "supertest";
import { createApp } from "../server/src/app.js";
import { migrate } from "../server/src/migrate.js";
import { PostgresRateLimitStore } from "../server/src/rate-limit-store.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Dedicated *_test database required.");
const pool = new Pool({ connectionString: url });
const other = new Pool({ connectionString: url });
beforeAll(async () => {
  await migrate(pool);
  await pool.query("TRUNCATE login_rate_limits");
});
afterAll(async () => { await Promise.all([pool.end(), other.end()]); });

test("CLOUD-01 readiness verifies PostgreSQL without creating a session", async () => {
  const response = await request(createApp(pool, "cloud-run-secret-at-least-32-characters", true))
    .get("/api/ready").expect(200);
  expect(response.body).toEqual({ status: "ready", db: "connected" });
  expect(response.headers["set-cookie"]).toBeUndefined();
  expect(response.headers["cache-control"]).toBe("no-store");
});

test("CLOUD-02 database outage makes readiness return 503 without internal details", async () => {
  const unavailable = new Pool({ connectionString: url });
  await unavailable.end();
  const response = await request(createApp(unavailable, "cloud-run-secret-at-least-32-characters", true))
    .get("/api/ready").expect(503);
  expect(response.body).toEqual({ status: "not_ready" });
  expect(response.headers["set-cookie"]).toBeUndefined();
});

test("CLOUD-03 concurrent login attempts share an atomic counter across pools and recreation", async () => {
  const first = new PostgresRateLimitStore(pool);
  const second = new PostgresRateLimitStore(other);
  const results = await Promise.all(Array.from({ length: 40 }, (_, n) =>
    (n % 2 ? first : second).increment("shared-client")));
  expect(results.map(r => r.totalHits).sort((a,b) => a-b)).toEqual(Array.from({length: 40}, (_, n) => n+1));
  const recreated = new PostgresRateLimitStore(other);
  expect((await recreated.increment("shared-client")).totalHits).toBe(41);
  await recreated.decrement("shared-client");
  expect((await first.increment("shared-client")).totalHits).toBe(41);
});

test("CLOUD-04 expired throttle windows reset and old entries are pruned on requests", async () => {
  await pool.query("UPDATE login_rate_limits SET reset_at=now()-interval '1 second'");
  const store = new PostgresRateLimitStore(pool);
  expect((await store.increment("new-client")).totalHits).toBe(1);
  expect((await pool.query("SELECT count(*)::int AS n FROM login_rate_limits")).rows[0].n).toBe(1);
  await store.resetKey("new-client");
  expect((await pool.query("SELECT count(*)::int AS n FROM login_rate_limits")).rows[0].n).toBe(0);
});
