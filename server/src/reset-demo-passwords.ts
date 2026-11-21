import "dotenv/config";
import { hash, argon2id } from "argon2";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { createPool } from "./db.js";
import { parseDemoPasswordsJson } from "./demo-credentials.js";
import { demoAccounts, demoIds } from "./seed.js";

export async function resetDemoPasswords(
  pool: Pool,
  passwords: ReturnType<typeof parseDemoPasswordsJson>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const account of demoAccounts) {
      const passwordHash = await hash(passwords[account.key], {
        type: argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      // Add any missing fixed demo identity without seeding sample events or
      // overwriting an existing account profile.
      await client.query(
        "INSERT INTO users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
        [demoIds[account.key], account.name, account.email, account.role, passwordHash],
      );
      const updated = await client.query(
        "UPDATE users SET password_hash = $1 WHERE id = $2 AND email = $3 AND role = $4",
        [passwordHash, demoIds[account.key], account.email, account.role],
      );
      if (updated.rowCount !== 1) {
        throw new Error(`Expected exactly one seeded account for ${account.key}.`);
      }
    }

    const accountIds = demoAccounts.map((account) => demoIds[account.key]);
    await client.query(
      "DELETE FROM session WHERE sess->>'userId' = ANY($1::text[])",
      [accountIds],
    );
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
  if (process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_PASSWORD_RESET !== "true") {
    throw new Error("Demo password reset requires a production job with ALLOW_DEMO_PASSWORD_RESET=true.");
  }
  if (!process.env.DEMO_PASSWORDS_JSON) {
    throw new Error("Set DEMO_PASSWORDS_JSON from the restricted Secret Manager reference.");
  }

  const passwords = parseDemoPasswordsJson(process.env.DEMO_PASSWORDS_JSON);
  const pool = createPool();
  try {
    await resetDemoPasswords(pool, passwords);
    console.log("Ensured four demo identities, rotated their passwords, and invalidated their sessions.");
  } finally {
    await pool.end();
  }
}
