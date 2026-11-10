import "dotenv/config";
import { createPool } from "./db.js";
import { createApp } from "./app.js";
const secret = process.env.SESSION_SECRET;
if (!secret || secret.startsWith("replace-"))
  throw new Error("Set a random SESSION_SECRET of at least 32 characters.");
const pool = createPool();
await pool.query("SELECT 1 FROM schema_migrations");
const app = createApp(pool, secret, process.env.NODE_ENV === "production");
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT.");
const server = app.listen(port, "0.0.0.0", () =>
  console.log(`Gather API ready at http://localhost:${port}`),
);
const pruning = setInterval(
  () => {
    void pool
      .query("DELETE FROM session WHERE expire < now()")
      .catch(() => console.error("Session cleanup failed."));
  },
  15 * 60 * 1000,
);
pruning.unref();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    clearInterval(pruning);
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
