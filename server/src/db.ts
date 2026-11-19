import "dotenv/config";
import pg from "pg";
export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString)
    throw new Error("DATABASE_URL is required. See .env.example.");
  const max = Number(process.env.DB_POOL_MAX ?? 10);
  if (!Number.isInteger(max) || max < 1 || max > 100)
    throw new Error("DB_POOL_MAX must be an integer from 1 to 100.");
  const pool = new pg.Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    query_timeout: 12000,
  });
  pool.on("error", () =>
    console.error("Unexpected idle database connection failure."),
  );
  return pool;
}
