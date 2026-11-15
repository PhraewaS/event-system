import { createHash } from "node:crypto";
import type { Options, Store } from "express-rate-limit";
import type { Pool } from "pg";

// Shared by every revision/instance. Expiry uses the database clock.
export class PostgresRateLimitStore implements Store {
  localKeys = false;
  private windowMs = 15 * 60 * 1000;

  constructor(private pool: Pool) {}

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  private key(key: string) {
    return createHash("sha256").update(`login:${key}`).digest("hex");
  }

  async increment(key: string) {
    // Request-driven cleanup also works when Cloud Run suspends idle CPU.
    await this.pool.query("DELETE FROM login_rate_limits WHERE reset_at <= now()");
    const result = await this.pool.query(
      `INSERT INTO login_rate_limits(key,hits,reset_at)
       VALUES($1,1,now() + $2 * interval '1 millisecond')
       ON CONFLICT (key) DO UPDATE SET
         hits=CASE WHEN login_rate_limits.reset_at <= now() THEN 1 ELSE login_rate_limits.hits+1 END,
         reset_at=CASE WHEN login_rate_limits.reset_at <= now() THEN EXCLUDED.reset_at ELSE login_rate_limits.reset_at END
       RETURNING hits,reset_at`,
      [this.key(key), this.windowMs],
    );
    return { totalHits: result.rows[0].hits as number, resetTime: result.rows[0].reset_at as Date };
  }

  async decrement(key: string) {
    await this.pool.query(
      "UPDATE login_rate_limits SET hits=GREATEST(0,hits-1) WHERE key=$1 AND reset_at > now()",
      [this.key(key)],
    );
  }

  async resetKey(key: string) {
    await this.pool.query("DELETE FROM login_rate_limits WHERE key=$1", [this.key(key)]);
  }
}
