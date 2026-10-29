import express, {
  type RequestHandler,
  type ErrorRequestHandler,
  type Response,
} from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { hash, verify, argon2id } from "argon2";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import type { Pool } from "pg";
import { ZodError } from "zod";
import {
  emptyInput,
  loginInput,
  pageInput,
  publishInput,
  uuid,
} from "./validation.js";
import { AppError } from "./errors.js";
import { registerParticipant } from "./registrations.js";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
  }
}
type User = {
  id: string;
  email: string;
  name: string;
  role: "PARTICIPANT" | "ORGANIZER";
};
const user = (res: Response) => res.locals.user as User;
const eventSelect = `SELECT e.id, e.organizer_id AS "organizerId", u.name AS "organizerName", e.title,
  e.description, e.location, e.capacity, e.starts_at AS "startsAt", e.registration_deadline AS "registrationDeadline",
  e.created_at AS "createdAt", c.n AS "registeredCount", e.capacity-c.n AS "remainingPlaces",
  (clock_timestamp()<e.registration_deadline AND c.n<e.capacity) AS "registrationOpen"
  FROM events e JOIN users u ON u.id=e.organizer_id
  CROSS JOIN LATERAL (SELECT count(*)::int AS n FROM registrations WHERE event_id=e.id) c`;
const registrationSelect = `SELECT r.id, r.participant_id AS "participantId", r.created_at AS "createdAt",
  json_build_object('id', e.id, 'title', e.title, 'location', e.location, 'startsAt', e.starts_at,
    'registrationDeadline', e.registration_deadline) AS event
  FROM registrations r JOIN events e ON e.id=r.event_id`;
const page = (res: Response, rows: unknown[], offset: number) =>
  res.json({
    data: rows,
    page: {
      offset,
      limit: 200,
      nextOffset: rows.length === 200 ? offset + 200 : null,
    },
  });

export function createApp(pool: Pool, secret: string, production = false) {
  if (secret.length < 32)
    throw new Error(
      "SESSION_SECRET must contain at least 32 random characters.",
    );
  const app = express();
  app.disable("x-powered-by");
  if (production) app.set("trust proxy", 1);
  app.use(helmet({ strictTransportSecurity: production ? undefined : false }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  const Store = connectPgSimple(session);
  app.use(
    session({
      name: "gather.sid",
      secret,
      resave: false,
      saveUninitialized: false,
      rolling: false,
      store: new Store({
        pool,
        createTableIfMissing: false,
        disableTouch: true,
        pruneSessionInterval: false,
      }),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: production,
        maxAge: 8 * 60 * 60 * 1000,
        path: "/",
      },
    }),
  );
  const csrf: RequestHandler = (req, _res, next) => {
    const expected = req.session.csrfToken;
    const received = req.get("X-CSRF-Token");
    if (
      !expected ||
      !received ||
      Buffer.byteLength(expected) !== Buffer.byteLength(received) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(received))
    ) {
      throw new AppError(
        403,
        "CSRF_INVALID",
        "Your security token is missing or expired. Refresh and try again.",
      );
    }
    next();
  };
  const requireUser: RequestHandler = async (req, res, next) => {
    if (!req.session.userId)
      throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
    const found = await pool.query(
      "SELECT id,email,name,role FROM users WHERE id=$1",
      [req.session.userId],
    );
    if (!found.rowCount)
      throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
    res.locals.user = found.rows[0];
    next();
  };
  const role =
    (expected: User["role"]): RequestHandler =>
    (_req, res, next) => {
      if (user(res).role !== expected)
        throw new AppError(
          403,
          "FORBIDDEN",
          "Your account does not have permission for this action.",
        );
      next();
    };
  const dummyHash = hash(randomBytes(32), {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: "LOGIN_RATE_LIMIT",
          message: "Too many login attempts. Try again in 15 minutes.",
        },
      });
    },
  });
  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ data: { status: "ok" } });
    } catch {
      res.status(503).json({
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Database unavailable.",
        },
      });
    }
  });
  app.get("/api/auth/csrf", (req, res) => {
    req.session.csrfToken ??= randomBytes(32).toString("hex");
    res.json({ data: { csrfToken: req.session.csrfToken } });
  });
  app.post("/api/auth/login", loginLimit, csrf, async (req, res) => {
    const input = loginInput.parse(req.body);
    const found = await pool.query(
      "SELECT id,email,name,role,password_hash FROM users WHERE email=$1",
      [input.email],
    );
    const foundUser = found.rows[0];
    const valid = await verify(
      foundUser?.password_hash ?? (await dummyHash),
      input.password,
    );
    if (!valid || !foundUser)
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      );
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((error) => (error ? reject(error) : resolve())),
    );
    req.session.userId = foundUser.id;
    req.session.csrfToken = randomBytes(32).toString("hex");
    await new Promise<void>((resolve, reject) =>
      req.session.save((error) => (error ? reject(error) : resolve())),
    );
    const { password_hash: _hash, ...identity } = foundUser;
    res.json({ data: { user: identity, csrfToken: req.session.csrfToken } });
  });
  app.get("/api/auth/me", requireUser, (_req, res) => {
    res.json({ data: user(res) });
  });
  app.post("/api/auth/logout", requireUser, csrf, async (req, res) => {
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((error) => (error ? reject(error) : resolve())),
    );
    res.clearCookie("gather.sid", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: production,
    });
    res.sendStatus(204);
  });
  app.get("/api/events", async (req, res) => {
    const { offset } = pageInput.parse(req.query);
    const result = await pool.query(
      `${eventSelect} ORDER BY e.created_at DESC,e.id LIMIT 200 OFFSET $1`,
      [offset],
    );
    page(res, result.rows, offset);
  });
  app.get("/api/events/:id", async (req, res) => {
    const found = await pool.query(`${eventSelect} WHERE e.id=$1`, [
      uuid.parse(req.params.id),
    ]);
    if (!found.rowCount)
      throw new AppError(404, "NOT_FOUND", "Event not found.");
    res.json({ data: found.rows[0] });
  });
  app.post(
    "/api/events",
    requireUser,
    role("ORGANIZER"),
    csrf,
    async (req, res) => {
      const input = publishInput.parse(req.body);
      const now = (await pool.query("SELECT clock_timestamp() AS now")).rows[0]
        .now as Date;
      if (
        Date.parse(input.startsAt) <= now.getTime() ||
        Date.parse(input.registrationDeadline) <= now.getTime()
      )
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Event start and registration deadline must be in the future.",
        );
      const id = randomUUID();
      await pool.query(
        `INSERT INTO events(id,organizer_id,title,description,location,capacity,starts_at,registration_deadline)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          user(res).id,
          input.title,
          input.description,
          input.location,
          input.capacity,
          input.startsAt,
          input.registrationDeadline,
        ],
      );
      const created = await pool.query(`${eventSelect} WHERE e.id=$1`, [id]);
      res.status(201).json({ data: created.rows[0] });
    },
  );
  app.post(
    "/api/events/:id/registrations",
    requireUser,
    role("PARTICIPANT"),
    csrf,
    async (req, res) => {
      const id = uuid.parse(req.params.id);
      emptyInput.parse(req.body);
      res
        .status(201)
        .json({ data: await registerParticipant(pool, id, user(res).id) });
    },
  );
  app.get(
    "/api/registrations/mine",
    requireUser,
    role("PARTICIPANT"),
    async (req, res) => {
      const { offset } = pageInput.parse(req.query);
      const result = await pool.query(
        `${registrationSelect} WHERE r.participant_id=$1 ORDER BY r.created_at DESC,r.id LIMIT 200 OFFSET $2`,
        [user(res).id, offset],
      );
      page(res, result.rows, offset);
    },
  );
  app.get(
    "/api/registrations/:id",
    requireUser,
    role("PARTICIPANT"),
    async (req, res) => {
      const found = await pool.query(
        `${registrationSelect} WHERE r.id=$1 AND r.participant_id=$2`,
        [uuid.parse(req.params.id), user(res).id],
      );
      if (!found.rowCount)
        throw new AppError(404, "NOT_FOUND", "Registration not found.");
      res.json({ data: found.rows[0] });
    },
  );

  app.use("/api", (_req, _res) => {
    throw new AppError(404, "NOT_FOUND", "API route not found.");
  });
  const clientPath = path.resolve("dist/client");
  if (existsSync(path.join(clientPath, "index.html"))) {
    app.use(express.static(clientPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(clientPath, "index.html"));
    });
  }
  const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    _next,
  ) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Check the supplied fields.",
          fields: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    } else if (error instanceof AppError) {
      res
        .status(error.status)
        .json({ error: { code: error.code, message: error.message } });
    } else if ((error as { type?: string }).type === "entity.parse.failed") {
      res.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "Request body must be valid JSON.",
        },
      });
    } else if ((error as { type?: string }).type === "entity.too.large") {
      res.status(413).json({
        error: {
          code: "BODY_TOO_LARGE",
          message: "Request body exceeds 16KiB.",
        },
      });
    } else {
      console.error(
        "API request failed:",
        (error as { code?: string }).code ?? "INTERNAL_ERROR",
      );
      res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Something went wrong. Please try again.",
        },
      });
    }
  };
  app.use(errorHandler);
  return app;
}
