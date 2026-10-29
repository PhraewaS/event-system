import "dotenv/config";
import { hash, argon2id } from "argon2";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { createPool } from "./db.js";

export const demoIds = {
  organizer: "10000000-0000-4000-8000-000000000001",
  organizer2: "10000000-0000-4000-8000-000000000002",
  participant: "10000000-0000-4000-8000-000000000003",
  participant2: "10000000-0000-4000-8000-000000000004",
};

export async function seed(pool: Pool, password: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [key, name, email, role] of [
      ["organizer", "Alex Morgan", "organizer@example.test", "ORGANIZER"],
      ["organizer2", "Jamie Rivera", "organizer2@example.test", "ORGANIZER"],
      ["participant", "Sam Taylor", "participant@example.test", "PARTICIPANT"],
      [
        "participant2",
        "Riley Chen",
        "participant2@example.test",
        "PARTICIPANT",
      ],
    ]) {
      const passwordHash = await hash(password, {
        type: argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      await client.query(
        "INSERT INTO users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
        [demoIds[key as keyof typeof demoIds], name, email, role, passwordHash],
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
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo seeding is disabled in production.");
  if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 12)
    throw new Error("Set DEMO_PASSWORD (12+ characters).");
  const pool = createPool();
  try {
    await seed(pool, process.env.DEMO_PASSWORD);
    console.log("Demo seed complete. Existing accounts/events were preserved.");
  } finally {
    await pool.end();
  }
}
