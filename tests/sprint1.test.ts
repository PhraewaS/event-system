import "dotenv/config";
import { beforeAll, afterAll, describe, expect, test, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createApp } from "../server/src/app.js";
import { migrate } from "../server/scripts/migrate.js";
import { seed, demoIds } from "../server/scripts/seed.js";
import { publishInput } from "../server/src/validation.js";

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
    const logout = await agent
      .post("/api/auth/logout")
      .set("X-CSRF-Token", login.body.data.csrfToken)
      .send({})
      .expect(204);
    const clearedCookie = logout.headers["set-cookie"][0];
    expect(clearedCookie).toMatch(/^gather\.sid=;/);
    const expires = /Expires=([^;]+)/i.exec(clearedCookie)?.[1];
    expect(expires).toBeDefined();
    expect(Date.parse(expires!)).toBeLessThan(Date.now());
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM session WHERE sess->>'csrfToken'=$1",
          [login.body.data.csrfToken],
        )
      ).rows[0].n,
    ).toBe(0);
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
  test("PUB-BOUND-01 / AC-03,04 publication rejects anonymous, wrong-role and invalid-CSRF requests without writes", async () => {
    const before = (await pool.query("SELECT count(*)::int AS n FROM events")).rows[0].n;
    const anonymous = await request(app).post("/api/events").send(eventBody()).expect(401);
    expect(anonymous.body.error.code).toBe("UNAUTHENTICATED");
    const participant = await actor();
    const forbidden = await participant.agent.post("/api/events")
      .set("X-CSRF-Token", participant.token).send(eventBody()).expect(403);
    expect(forbidden.body.error.code).toBe("FORBIDDEN");
    const owner = await actor("organizer@example.test");
    const missing = await owner.agent.post("/api/events").send(eventBody()).expect(403);
    expect(missing.body.error.code).toBe("CSRF_INVALID");
    const wrong = await owner.agent.post("/api/events")
      .set("X-CSRF-Token", "wrong").send(eventBody()).expect(403);
    expect(wrong.body.error.code).toBe("CSRF_INVALID");
    expect((await pool.query("SELECT count(*)::int AS n FROM events")).rows[0].n).toBe(before);
  });

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

  test("PUB-BOUND-02 / AC-PUB-01 anonymous discovery persists across API instances and paginates without exposing private data", async () => {
    const owner = await actor("organizer@example.test");
    const created = await publish(owner, { capacity: 2 });
    // Synthetic database fixture exercises public counts; no registration API is claimed here.
    await pool.query("INSERT INTO registrations(id,participant_id,event_id) VALUES($1,$2,$3)",
      [randomUUID(), demoIds.participant, created.id]);
    const freshPool = new Pool({ connectionString: url });
    const freshApp = createApp(freshPool, secret);
    try {
      const detail = await request(freshApp).get(`/api/events/${created.id}`).expect(200);
      expect(detail.body.data).toMatchObject({
        id: created.id, organizerId: demoIds.organizer, capacity: 2,
        registeredCount: 1, remainingPlaces: 1, registrationOpen: true,
      });
      expect(detail.body.data.organizerName).toEqual(expect.any(String));
      expect(Object.keys(detail.body.data).sort()).toEqual([
        "id", "organizerId", "organizerName", "title", "description", "location", "capacity",
        "startsAt", "registrationDeadline", "createdAt", "registeredCount", "remainingPlaces", "registrationOpen",
      ].sort());
      expect((await request(freshApp).get("/api/events/not-a-uuid").expect(400)).body.error.code)
        .toBe("VALIDATION_ERROR");
      expect((await request(freshApp).get(`/api/events/${randomUUID()}`).expect(404)).body.error.code)
        .toBe("NOT_FOUND");
      for (const offset of ["-1", "abc", "1.5", "10000001"])
        expect((await request(freshApp).get(`/api/events?offset=${offset}`).expect(400)).body.error.code)
          .toBe("VALIDATION_ERROR");
      const ids = Array.from({ length: 203 }, () => randomUUID());
      await pool.query(`INSERT INTO events(id,organizer_id,title,description,location,capacity,starts_at,registration_deadline)
        SELECT id,$2,'Pagination workshop','Synthetic pagination fixture','Campus',2,$3,$4
        FROM unnest($1::uuid[]) AS ids(id)`, [ids, demoIds.organizer, future(48), future(24)]);
      const expected = (await pool.query("SELECT id FROM events")).rows.map(r => r.id).sort();
      const seen: string[] = [];
      let offset: number | null = 0;
      do {
        const response = await request(freshApp).get(`/api/events?offset=${offset}`).expect(200);
        expect(response.body.data.length).toBeLessThanOrEqual(200);
        expect(response.body.page).toMatchObject({ offset, limit: 200 });
        if (response.body.data.length === 200) expect(response.body.page.nextOffset).toBe(offset! + 200);
        else expect(response.body.page.nextOffset).toBeNull();
        seen.push(...response.body.data.map((e: { id: string }) => e.id));
        offset = response.body.page.nextOffset;
        // Prevent a broken continuation token from looping forever.
        expect(seen.length).toBeLessThanOrEqual(expected.length);
      } while (offset !== null);
      expect(seen.sort()).toEqual(expected);
      expect(new Set(seen).size).toBe(expected.length);
    } finally {
      await freshPool.end();
    }
  });

  test("PUB-BOUND-03 / AC-04,05 exact text bounds are trimmed and timezone-offset instants persist", async () => {
    const owner = await actor("organizer2@example.test");
    const at = new Date(Date.now() + 55 * 3600000).toISOString().replace("Z", "+07:00");
    for (const [title, description, location, capacity] of [
      ["abc", "d".repeat(10), "xy", 1],
      ["t".repeat(120), "d".repeat(4000), "l".repeat(200), 1000000],
    ] as const) {
      const created = await publish(owner, {
        title: `  ${title}  `, description: ` ${description} `, location: ` ${location} `,
        capacity, startsAt: at, registrationDeadline: at,
      });
      expect(created).toMatchObject({ title, description, location, capacity, organizerId: demoIds.organizer2 });
      expect(created.startsAt).toBe(new Date(at).toISOString());
      expect(created.registrationDeadline).toBe(new Date(at).toISOString());
      const saved = (await pool.query("SELECT title,description,location,organizer_id,starts_at,registration_deadline FROM events WHERE id=$1", [created.id])).rows[0];
      expect(saved).toMatchObject({ title, description, location, organizer_id: demoIds.organizer2 });
      expect(saved.starts_at.toISOString()).toBe(new Date(at).toISOString());
      expect(saved.registration_deadline.toISOString()).toBe(new Date(at).toISOString());
    }
  });

  test("PUB-UNIT-01 / AC-05 publication schema enforces types, bounds, normalization and deadline order", () => {
    const at = future(48);
    const valid = eventBody({ title: " abc ", description: " 0123456789 ", location: " xy ", startsAt: at, registrationDeadline: at, capacity: 1 });
    expect(publishInput.parse(valid)).toMatchObject({ title: "abc", description: "0123456789", location: "xy", capacity: 1 });
    expect(publishInput.safeParse(eventBody({ capacity: 1000000 })).success).toBe(true);
    for (const change of [
      { capacity: 0 }, { capacity: -1 }, { capacity: 1.5 }, { capacity: "1" }, { capacity: 1000001 },
      { title: "ab" }, { description: "123456789" }, { location: "x" },
      { title: "x".repeat(121) }, { description: "x".repeat(4001) }, { location: "x".repeat(201) },
      { organizerId: demoIds.organizer2 }, { registrationDeadline: future(72) },
      { startsAt: "2027-01-01T10:00:00" },
    ]) expect(publishInput.safeParse(eventBody(change)).success).toBe(false);
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
    const ownB = (await register(b, event.id).expect(201)).body.data;
    await a.agent.get(`/api/registrations/${registration.id}`).expect(200);
    const forbidden = await b.agent
      .get(`/api/registrations/${registration.id}`)
      .expect(404);
    const missing = await b.agent
      .get(`/api/registrations/${randomUUID()}`)
      .expect(404);
    expect(forbidden.body).toEqual(missing.body);
    const personal = await b.agent.get("/api/registrations/mine").expect(200);
    expect(personal.body.data.some((r: { id: string }) => r.id === ownB.id)).toBe(true);
    expect(personal.body.data.some((r: { id: string }) => r.id === registration.id)).toBe(false);
    expect(
      (await b.agent.get("/api/registrations/mine")).body.data.every(
        (r: { participantId: string }) =>
          r.participantId === demoIds.participant2,
      ),
    ).toBe(true);
    await owner.agent.get(`/api/registrations/${registration.id}`).expect(403);
  });

  test("REG-BOUND-01 / AC-03,06,09 registration permissions, CSRF and spoofed identities reject without writes", async () => {
    const owner = await actor("organizer@example.test");
    const participant = await actor();
    const event = await publish(owner);
    const path = `/api/events/${event.id}/registrations`;
    expect((await request(app).post(path).send({}).expect(401)).body.error.code).toBe("UNAUTHENTICATED");
    for (const route of ["/api/registrations/mine", `/api/registrations/${randomUUID()}`]) {
      expect((await request(app).get(route).expect(401)).body.error.code).toBe("UNAUTHENTICATED");
      expect((await owner.agent.get(route).expect(403)).body.error.code).toBe("FORBIDDEN");
    }
    expect((await register(owner, event.id).expect(403)).body.error.code).toBe("FORBIDDEN");
    expect((await participant.agent.post(path).send({}).expect(403)).body.error.code).toBe("CSRF_INVALID");
    expect((await participant.agent.post(path).set("X-CSRF-Token", "wrong").send({}).expect(403)).body.error.code).toBe("CSRF_INVALID");
    for (const body of [{ participantId: demoIds.participant2 }, { role: "ORGANIZER" }, { id: randomUUID() }, []])
      expect((await register(participant, event.id, body).expect(400)).body.error.code).toBe("VALIDATION_ERROR");
    expect((await register(participant, "not-a-uuid").expect(400)).body.error.code).toBe("VALIDATION_ERROR");
    expect((await participant.agent.get("/api/registrations/not-a-uuid").expect(400)).body.error.code).toBe("VALIDATION_ERROR");
    expect((await pool.query("SELECT count(*)::int AS n FROM registrations WHERE event_id=$1", [event.id])).rows[0].n).toBe(0);
    const created = (await register(participant, event.id).expect(201)).body.data;
    expect(created).toMatchObject({ eventId: event.id, participantId: demoIds.participant });
  });

  test("REG-BOUND-02 / AC-07 duplicate wins after closure/full and rejected transactions leave a single-connection pool reusable", async () => {
    const onePool = new Pool({ connectionString: url, max: 1 });
    const oneApp = createApp(onePool, secret);
    try {
      const owner = await actor("organizer@example.test");
      const a = await actor("participant@example.test", oneApp);
      const b = await actor("participant2@example.test", oneApp);
      const full = await publish(owner, { capacity: 1 });
      await register(a, full.id).expect(201);
      await pool.query("UPDATE events SET registration_deadline=clock_timestamp()-interval '1 second' WHERE id=$1", [full.id]);
      expect((await register(a, full.id).expect(409)).body.error.code).toBe("DUPLICATE_REGISTRATION");
      expect((await register(b, full.id).expect(409)).body.error.code).toBe("REGISTRATION_CLOSED");
      const closed = await publish(owner);
      await pool.query("UPDATE events SET registration_deadline=clock_timestamp()-interval '1 second' WHERE id=$1", [closed.id]);
      expect((await register(a, closed.id).expect(409)).body.error.code).toBe("REGISTRATION_CLOSED");
      expect((await register(a, randomUUID()).expect(404)).body.error.code).toBe("NOT_FOUND");
      const recovery = await publish(owner);
      await register(b, recovery.id).expect(201);
      const counts = async (id: string) => (await pool.query("SELECT count(*)::int AS n FROM registrations WHERE event_id=$1", [id])).rows[0].n;
      expect(await counts(full.id)).toBe(1);
      expect(await counts(closed.id)).toBe(0);
      expect(await counts(recovery.id)).toBe(1);
    } finally {
      await onePool.end();
    }
  });

  test("REG-CONC-01 / AC-07,08 a request blocked on the real event lock is rejected when the deadline closes before lock release", async () => {
    const owner = await actor("organizer@example.test");
    const participant = await actor();
    const event = await publish(owner);
    const onePool = new Pool({ connectionString: url, max: 1 });
    const locker = await pool.connect();
    let transactionOpen = false;
    let pending: Promise<Awaited<ReturnType<typeof register>>> | undefined;
    try {
      const pid = (await onePool.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const blockedApp = createApp(onePool, secret);
      await locker.query("BEGIN");
      transactionOpen = true;
      await locker.query("SELECT id FROM events WHERE id=$1 FOR UPDATE", [event.id]);
      pending = request(blockedApp).post(`/api/events/${event.id}/registrations`)
        .set("Cookie", participant.cookie).set("X-CSRF-Token", participant.token).send({}).then(r => r);
      // Wait for observed PostgreSQL lock contention, not an assumed timing delay.
      await vi.waitFor(async () => {
        const waiting = (await pool.query("SELECT wait_event_type,query FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0];
        expect(waiting.wait_event_type).toBe("Lock");
        expect(waiting.query).toContain("FOR UPDATE");
      }, { timeout: 5000, interval: 25 });
      await locker.query("UPDATE events SET registration_deadline=clock_timestamp()-interval '1 second' WHERE id=$1", [event.id]);
      await locker.query("COMMIT");
      transactionOpen = false;
      const response = await pending;
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("REGISTRATION_CLOSED");
      expect((await pool.query("SELECT count(*)::int AS n FROM registrations WHERE event_id=$1", [event.id])).rows[0].n).toBe(0);
    } finally {
      if (transactionOpen) await locker.query("ROLLBACK");
      locker.release();
      if (pending) await pending.catch(() => undefined);
      await onePool.end();
    }
  });

  test("REG-BOUND-03 / AC-09 personal pagination returns every own record once and excludes another participant", async () => {
    const a = await actor();
    const b = await actor("participant2@example.test");
    const eventIds = Array.from({ length: 203 }, () => randomUUID());
    const registrationIds = eventIds.map(() => randomUUID());
    await pool.query(`INSERT INTO events(id,organizer_id,title,description,location,capacity,starts_at,registration_deadline)
      SELECT id,$2,'Private pagination','Synthetic private pagination fixture','Campus',2,$3,$4
      FROM unnest($1::uuid[]) AS ids(id)`, [eventIds, demoIds.organizer, future(48), future(24)]);
    await pool.query(`INSERT INTO registrations(id,event_id,participant_id)
      SELECT id,event_id,$3 FROM unnest($1::uuid[],$2::uuid[]) AS fixture(id,event_id)`, [registrationIds, eventIds, demoIds.participant]);
    const foreign = (await register(b, eventIds[0]).expect(201)).body.data;
    const expected = (await pool.query("SELECT id FROM registrations WHERE participant_id=$1", [demoIds.participant])).rows.map(r => r.id).sort();
    const seen: string[] = [];
    let offset: number | null = 0;
    do {
      const response = await a.agent.get(`/api/registrations/mine?offset=${offset}`).expect(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body.data.length).toBeLessThanOrEqual(200);
      expect(response.body.page).toMatchObject({ offset, limit: 200 });
      if (response.body.data.length === 200) expect(response.body.page.nextOffset).toBe(offset! + 200);
      else expect(response.body.page.nextOffset).toBeNull();
      for (const row of response.body.data) {
        expect(row.participantId).toBe(demoIds.participant);
        expect(row.id).not.toBe(foreign.id);
        seen.push(row.id);
      }
      offset = response.body.page.nextOffset;
      expect(seen.length).toBeLessThanOrEqual(expected.length);
    } while (offset !== null);
    expect(seen.sort()).toEqual(expected);
    expect(new Set(seen).size).toBe(expected.length);
    const personalB = await b.agent.get("/api/registrations/mine").expect(200);
    expect(personalB.body.data.some((r: { id: string }) => r.id === foreign.id)).toBe(true);
    expect(personalB.body.data.every((r: { participantId: string }) => r.participantId === demoIds.participant2)).toBe(true);
    expect((await a.agent.get("/api/registrations/mine?offset=-1").expect(400)).body.error.code).toBe("VALIDATION_ERROR");
  });
});
