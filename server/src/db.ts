import "dotenv/config";
import pg from "pg";
export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString)
    throw new Error("DATABASE_URL is required. See .env.example.");
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
  });
  pool.on("error", () =>
    console.error("Unexpected idle database connection failure."),
  );
  return pool;
}
