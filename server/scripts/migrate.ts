import { pathToFileURL } from "node:url";
import { createPool } from "../src/db.js";
import { migrate } from "../src/migrate.js";
export { migrate };
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const pool = createPool();
  try {
    await migrate(pool);
    console.log("Migrations applied successfully.");
  } finally {
    await pool.end();
  }
}
