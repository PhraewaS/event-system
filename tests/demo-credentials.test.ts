import "dotenv/config";
import { verify } from "argon2";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import {
  parseDemoPasswordsJson,
  seedCredentialsFromEnv,
  type DemoPasswords,
} from "../server/src/demo-credentials.js";
import { migrate } from "../server/src/migrate.js";
import { resetDemoPasswords } from "../server/src/reset-demo-passwords.js";
import { demoAccounts, demoIds, seed } from "../server/src/seed.js";

const initialPasswords: DemoPasswords = {
  organizer: "synthetic-initial-organizer",
  organizer2: "synthetic-initial-organizer-two",
  participant: "synthetic-initial-participant",
  participant2: "synthetic-initial-participant-two",
};
const rotatedPasswords: DemoPasswords = {
  organizer: "synthetic-rotated-organizer",
  organizer2: "synthetic-rotated-organizer-two",
  participant: "synthetic-rotated-participant",
  participant2: "synthetic-rotated-participant-two",
};

describe("Production demo credentials", () => {
  test("uses four distinct JSON passphrases and rejects the shared password shortcut", () => {
    expect(
      seedCredentialsFromEnv({
        NODE_ENV: "production",
        DEMO_PASSWORDS_JSON: JSON.stringify(initialPasswords),
      }),
    ).toEqual(initialPasswords);
    expect(() =>
      seedCredentialsFromEnv({
        NODE_ENV: "production",
        DEMO_PASSWORD: "synthetic-shared-password",
      }),
    ).toThrow(/Set DEMO_PASSWORDS_JSON/);
  });

  test.each([
    { name: "invalid JSON", raw: "{", error: /must be a JSON object/ },
    { name: "an array", raw: "[]", error: /must be a JSON object/ },
    { name: "missing keys", raw: "{}", error: /must contain exactly/ },
    {
      name: "an extra key",
      raw: JSON.stringify({ ...initialPasswords, other: "synthetic-extra-passphrase" }),
      error: /must contain exactly/,
    },
    {
      name: "a non-string passphrase",
      raw: JSON.stringify({ ...initialPasswords, organizer: 123 }),
      error: /characters/,
    },
    {
      name: "a short passphrase",
      raw: JSON.stringify({ ...initialPasswords, organizer: "short" }),
      error: /characters/,
    },
    {
      name: "duplicate passphrases",
      raw: JSON.stringify({ ...initialPasswords, organizer: initialPasswords.participant }),
      error: /different passphrase/,
    },
  ])("rejects $name", ({ raw, error }) => {
    expect(() => parseDemoPasswordsJson(raw)).toThrow(error);
  });
});

describe("Demo password lifecycle in PostgreSQL", () => {
  const otherAccountId = "30000000-0000-4000-8000-000000000001";
  const eventId = "30000000-0000-4000-8000-000000000002";
  let pool: Pool;

  async function snapshot() {
    const [users, events, registrations, sessions] = await Promise.all([
      pool.query<{ id: string; name: string; email: string; role: string; password_hash: string }>(
        "SELECT * FROM users ORDER BY id",
      ),
      pool.query("SELECT * FROM events ORDER BY id"),
      pool.query("SELECT * FROM registrations ORDER BY id"),
      pool.query("SELECT sid, sess::jsonb AS sess, expire FROM session ORDER BY sid"),
    ]);
    return {
      users: users.rows,
      events: events.rows,
      registrations: registrations.rows,
      sessions: sessions.rows,
    };
  }

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith("_test"))
      throw new Error("Dedicated *_test database required.");
    pool = new Pool({ connectionString: url });
    await migrate(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE registrations, events, users, session");
    await seed(pool, initialPasswords);
    await pool.query(
      "INSERT INTO users (id, name, email, role, password_hash) VALUES ($1, 'Other User', 'other@example.test', 'PARTICIPANT', 'other-test-hash')",
      [otherAccountId],
    );
    await pool.query(
      `INSERT INTO events (id, organizer_id, title, description, location, capacity, starts_at, registration_deadline)
       VALUES ($1, $2, 'Persistence test event', 'An event with two existing registrations.', 'Test room', 4,
               now() + interval '2 days', now() + interval '1 day')`,
      [eventId, demoIds.organizer],
    );
    await pool.query(
      `INSERT INTO registrations (id, participant_id, event_id)
       VALUES ('30000000-0000-4000-8000-000000000003', $1, $3),
              ('30000000-0000-4000-8000-000000000004', $2, $3)`,
      [demoIds.participant, otherAccountId, eventId],
    );
    for (const id of [...Object.values(demoIds), otherAccountId]) {
      await pool.query(
        "INSERT INTO session (sid, sess, expire) VALUES ($1, $2, now() + interval '1 day')",
        [`session-${id}`, { userId: id }],
      );
    }
  });

  test("repeated seed preserves stored hashes and data even with new passphrases", async () => {
    const before = await snapshot();
    for (const { key } of demoAccounts) {
      const user = before.users.find(({ id }) => id === demoIds[key])!;
      expect(await verify(user.password_hash, initialPasswords[key])).toBe(true);
    }

    await seed(pool, rotatedPasswords);

    expect(await snapshot()).toEqual(before);
  });

  test("reset rotates only the four demo accounts and removes only their sessions", async () => {
    const before = await snapshot();

    await resetDemoPasswords(pool, rotatedPasswords);

    const after = await snapshot();
    const profiles = (users: typeof before.users) =>
      users.map(({ id, name, email, role }) => ({ id, name, email, role }));
    expect(profiles(after.users)).toEqual(profiles(before.users));
    for (const { key } of demoAccounts) {
      const current = after.users.find(({ id }) => id === demoIds[key])!;
      const previous = before.users.find(({ id }) => id === demoIds[key])!;
      expect(current.password_hash).not.toBe(previous.password_hash);
      expect(await verify(current.password_hash, rotatedPasswords[key])).toBe(true);
    }
    expect(after.users.find(({ id }) => id === otherAccountId)).toEqual(
      before.users.find(({ id }) => id === otherAccountId),
    );
    expect(before.sessions).toHaveLength(5);
    expect(after.sessions).toEqual(
      before.sessions.filter(({ sid }) => sid === `session-${otherAccountId}`),
    );
    expect(after.events).toEqual(before.events);
    expect(after.registrations).toEqual(before.registrations);
  });

  test.each([
    ["email", "different@example.test"],
    ["role", "ORGANIZER"],
  ] as const)("rolls back earlier account changes when the last demo %s does not match", async (field, value) => {
    // The last identity fails after earlier identities have been updated or inserted.
    await pool.query(`UPDATE users SET ${field} = $1 WHERE id = $2`, [value, demoIds.participant2]);
    await pool.query("DELETE FROM users WHERE id = $1", [demoIds.organizer2]);
    const before = await snapshot();

    await expect(resetDemoPasswords(pool, rotatedPasswords)).rejects.toThrow(
      "Expected exactly one seeded account for participant2.",
    );

    expect(await snapshot()).toEqual(before);
  });
});
