import express from "express";
import helmet from "helmet";
import path from "node:path";
import { existsSync } from "node:fs";
import type { Pool } from "pg";
export function createApp(pool: Pool, _secret: string, _production = false) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ strictTransportSecurity: false }));
  app.get("/api/health", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      await pool.query("SELECT 1");
      res.json({ data: { status: "ok" } });
    } catch {
      res
        .status(503)
        .json({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Database unavailable.",
          },
        });
    }
  });
  app.use("/api", (_req, res) => {
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "API route not found." } });
  });
  const folder = path.resolve("dist/client");
  if (existsSync(path.join(folder, "index.html"))) {
    app.use(express.static(folder));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(folder, "index.html"));
    });
  }
  return app;
}
