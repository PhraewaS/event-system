import "dotenv/config";
import { pathToFileURL } from "node:url";
import { createPool } from "../src/db.js";
import { seedCredentialsFromEnv } from "../src/demo-credentials.js";
import { seed } from "../src/seed.js";
export { seed, demoIds } from "../src/seed.js";
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
