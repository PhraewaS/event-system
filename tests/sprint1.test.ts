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

  test("T-03 / AC-03 authentication and CSRF enforced, safe errors", async () => {
    for (const path of [
      "/api/auth/me",
      "/api/registrations/mine",
      "/api/organizer/events",
      `/api/events/${randomUUID()}/registrations`,
    ]) {
      await request(app).get(path).expect(401);
    }
    await request(app).post("/api/events").send(eventBody()).expect(401);
    await request(app)
      .post(`/api/events/${randomUUID()}/registrations`)
      .send({})
      .expect(401);
    await request(app)
      .post("/api/auth/login")
      .send({ email: "participant@example.test", password })
      .expect(403);
    const owner = await actor("organizer@example.test");
    await owner.agent.post("/api/events").send(eventBody()).expect(403);
    await owner.agent
      .post("/api/events")
      .set("X-CSRF-Token", "wrong")
      .send(eventBody())
      .expect(403);
    await owner.agent.post("/api/auth/logout").send({}).expect(403);
    await request(app).get("/api/events/not-a-uuid").expect(400);
    await request(app).get(`/api/events/${randomUUID()}`).expect(404);
    await request(app).get("/api/no-such-route").expect(404);
    await owner.agent
      .post("/api/events")
      .set("X-CSRF-Token", owner.token)
      .set("Content-Type", "application/json")
      .send("{broken")
      .expect(400);
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

describe("F-03 Registration and persistence", () => {
  test("T-06 / AC-06 full API journey survives independent application/pool recreation", async () => {
    const owner = await actor("organizer@example.test");
    const participant = await actor();
    const event = await publish(owner);
    const all = await request(app).get("/api/events").expect(200);
    expect(all.body.data.some((e: { id: string }) => e.id === event.id)).toBe(
      true,
    );
    const detail = await request(app)
      .get(`/api/events/${event.id}`)
      .expect(200);
    expect(detail.body.data.remainingPlaces).toBe(2);
    const res = await register(participant, event.id).expect(201);
    const own = await participant.agent
      .get(`/api/registrations/${res.body.data.id}`)
      .expect(200);
    expect(own.body.data.event.id).toBe(event.id);
    const mine = await participant.agent
      .get("/api/registrations/mine")
      .expect(200);
    expect(
      mine.body.data.some((r: { id: string }) => r.id === res.body.data.id),
    ).toBe(true);
    const recreatedPool = new Pool({ connectionString: url });
    try {
      const recreated = createApp(recreatedPool, secret);
      const persisted = await request(recreated)
        .get("/api/registrations/mine")
        .set("Cookie", participant.cookie)
        .expect(200);
      expect(
        persisted.body.data.some(
          (r: { id: string }) => r.id === res.body.data.id,
        ),
      ).toBe(true);
      expect(
        (await request(recreated).get(`/api/events/${event.id}`)).body.data
          .remainingPlaces,
      ).toBe(1);
    } finally {
      await recreatedPool.end();
    }
  });

  test("T-07 / AC-07 duplicate, full, deadline, missing and forged registration", async () => {
    const owner = await actor("organizer@example.test");
    const a = await actor();
    const b = await actor("participant2@example.test");
    const event = await publish(owner, { capacity: 1 });
    await register(a, event.id).expect(201);
    expect((await register(a, event.id).expect(409)).body.error.code).toBe(
      "DUPLICATE_REGISTRATION",
    );
    expect((await register(b, event.id).expect(409)).body.error.code).toBe(
      "EVENT_FULL",
    );
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM registrations WHERE event_id=$1",
          [event.id],
        )
      ).rows[0].n,
    ).toBe(1);
    const closed = await publish(owner);
    await pool.query(
      "UPDATE events SET registration_deadline=clock_timestamp() WHERE id=$1",
      [closed.id],
    );
    expect((await register(a, closed.id).expect(409)).body.error.code).toBe(
      "REGISTRATION_CLOSED",
    );
    expect(
      (await request(app).get(`/api/events/${closed.id}`)).body.data
        .registrationOpen,
    ).toBe(false);
    await register(a, randomUUID()).expect(404);
    await register(a, closed.id, {
      participantId: demoIds.participant2,
    }).expect(400);
    await register(a, "not-a-uuid").expect(400);
  });

  test("T-08 / AC-08 two independent API instances compete for final place", async () => {
    const owner = await actor("organizer@example.test");
    const a = await actor();
    const b = await actor("participant2@example.test", secondApp);
    for (let attempt = 0; attempt < 5; attempt++) {
      const event = await publish(owner, { capacity: 1 });
      const results = await Promise.all([
        register(a, event.id),
        register(b, event.id),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)?.body.error.code).toBe(
        "EVENT_FULL",
      );
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM registrations WHERE event_id=$1",
            [event.id],
          )
        ).rows[0].n,
      ).toBe(1);
    }
    const same = await actor("participant@example.test", secondApp);
    const event = await publish(owner, { capacity: 2 });
    const results = await Promise.all([
      register(a, event.id),
      register(same, event.id),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)?.body.error.code).toBe(
      "DUPLICATE_REGISTRATION",
    );
    expect(
      (await request(app).get(`/api/events/${event.id}`)).body.data
        .remainingPlaces,
    ).toBe(1);
  });

  test("T-09 / AC-09 private registration owner restrictions", async () => {
    const owner = await actor("organizer@example.test");
    const a = await actor();
    const b = await actor("participant2@example.test");
    const event = await publish(owner);
    const registration = (await register(a, event.id).expect(201)).body.data;
    await a.agent.get(`/api/registrations/${registration.id}`).expect(200);
    const forbidden = await b.agent
      .get(`/api/registrations/${registration.id}`)
      .expect(404);
    const missing = await b.agent
      .get(`/api/registrations/${randomUUID()}`)
      .expect(404);
    expect(forbidden.body).toEqual(missing.body);
    expect(
      (await b.agent.get("/api/registrations/mine")).body.data.every(
        (r: { participantId: string }) =>
          r.participantId === demoIds.participant2,
      ),
    ).toBe(true);
    await owner.agent.get(`/api/registrations/${registration.id}`).expect(403);
  });
});

describe("F-04 Organizer ownership and data integrity", () => {
  test("T-10 / AC-10 role and event ownership enforced independently", async () => {
    const owner = await actor("organizer@example.test");
    const other = await actor("organizer2@example.test");
    const participant = await actor();
    const event = await publish(owner);
    await register(participant, event.id).expect(201);
    const roster = await owner.agent
      .get(`/api/events/${event.id}/registrations`)
      .expect(200);
    expect(roster.body.data).toHaveLength(1);
    expect(roster.body.data[0].participant.email).toBe(
      "participant@example.test",
    );
    await other.agent.get(`/api/events/${event.id}/registrations`).expect(404);
    await participant.agent
      .get(`/api/events/${event.id}/registrations`)
      .expect(403);
    await participant.agent.get("/api/organizer/events").expect(403);
    expect(
      (await other.agent.get("/api/organizer/events").expect(200)).body.data,
    ).toHaveLength(0);
    await register(owner, event.id).expect(403);
    await owner.agent.get("/api/registrations/mine").expect(403);
  });

  test("T-11 / AC-11 database constraints and migration/seed reproducibility", async () => {
    const owner = await actor("organizer@example.test");
    const event = await publish(owner);
    for (const [sql, values] of [
      ["UPDATE events SET capacity=0 WHERE id=$1", [event.id]],
      [
        "UPDATE events SET registration_deadline=starts_at+interval '1 day' WHERE id=$1",
        [event.id],
      ],
      ["UPDATE users SET role='ADMIN' WHERE id=$1", [demoIds.participant]],
      [
        "UPDATE events SET organizer_id=$1 WHERE id=$2",
        [randomUUID(), event.id],
      ],
    ] as const)
      await expect(pool.query(sql, [...values])).rejects.toBeDefined();
    const a = await actor();
    await register(a, event.id).expect(201);
    await expect(
      pool.query(
        "INSERT INTO registrations(id,event_id,participant_id) VALUES($1,$2,$3)",
        [randomUUID(), event.id, demoIds.participant],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    const before = (await pool.query("SELECT count(*)::int AS n FROM events"))
      .rows[0].n;
    await migrate(pool);
    await seed(pool, password);
    expect(
      (await pool.query("SELECT count(*)::int AS n FROM events")).rows[0].n,
    ).toBe(before);
  });
});
