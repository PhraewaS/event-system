import "dotenv/config";
import { pathToFileURL } from "node:url";
import { createPool } from "../src/db.js";
import { seed } from "../src/seed.js";
export { seed, demoIds } from "../src/seed.js";
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
