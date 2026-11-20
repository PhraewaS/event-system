import "dotenv/config";
import { hash, argon2id } from "argon2";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { createPool } from "./db.js";
import { seedCredentialsFromEnv, type DemoAccountKey, type SeedCredentials } from "./demo-credentials.js";

export const demoIds = {
  organizer: "10000000-0000-4000-8000-000000000001",
  organizer2: "10000000-0000-4000-8000-000000000002",
  participant: "10000000-0000-4000-8000-000000000003",
  participant2: "10000000-0000-4000-8000-000000000004",
};

export const demoAccounts = [
  { key: "organizer", name: "Alex Morgan", email: "organizer@example.test", role: "ORGANIZER" },
  { key: "organizer2", name: "Jamie Rivera", email: "organizer2@example.test", role: "ORGANIZER" },
  { key: "participant", name: "Sam Taylor", email: "participant@example.test", role: "PARTICIPANT" },
  { key: "participant2", name: "Riley Chen", email: "participant2@example.test", role: "PARTICIPANT" },
] as const;

export async function seed(pool: Pool, credentials: SeedCredentials) {
  if (typeof credentials === "string" && (credentials.length < 12 || credentials.length > 256))
    throw new Error("Set a 12–256 character synthetic DEMO_PASSWORD for local seed operations.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Production UAT requires a unique passphrase for every seeded identity.
    const accounts = demoAccounts;
    for (const account of accounts) {
      const password =
        typeof credentials === "string"
          ? credentials
          : credentials[account.key as DemoAccountKey];
      const passwordHash = await hash(password, {
        type: argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      await client.query(
        "INSERT INTO users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
        [demoIds[account.key], account.name, account.email, account.role, passwordHash],
      );
    }
    const examples = [
      [
        "20000000-0000-4000-8000-000000000001",
        "Designing for people",
        "A practical workshop on making digital experiences more useful, inclusive, and human.",
        "Design studio · Building A",
        24,
        3,
      ],
      [
        "20000000-0000-4000-8000-000000000002",
        "Build something together",
        "Meet fellow makers for an afternoon of ideas, rapid prototypes, and shared learning.",
        "Innovation lab · Building C",
        18,
        5,
      ],
      [
        "20000000-0000-4000-8000-000000000003",
        "An evening of big ideas",
        "Short talks, fresh perspectives, and good conversations with our campus community.",
        "Main auditorium",
        60,
        8,
      ],
    ];
    for (const [id, title, description, location, capacity, days] of examples) {
      // Relative dates keep a fresh install demonstrable; reruns never move existing events.
      await client.query(
        `INSERT INTO events(id,organizer_id,title,description,location,capacity,starts_at,registration_deadline)
        VALUES($1,$2,$3,$4,$5,$6,date_trunc('hour',now()) + $7 * interval '1 day',date_trunc('hour',now()) + ($7 - 1) * interval '1 day') ON CONFLICT (id) DO NOTHING`,
        [id, demoIds.organizer, title, description, location, capacity, days],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true")
    throw new Error("Production demo seeding requires ALLOW_DEMO_SEED=true for an explicit UAT seed job.");
  const pool = createPool();
  try {
    await seed(pool, seedCredentialsFromEnv());
    console.log("Demo seed complete. Existing accounts/events were preserved.");
  } finally {
    await pool.end();
  }
}
