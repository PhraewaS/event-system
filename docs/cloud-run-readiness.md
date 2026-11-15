# Cloud Run readiness — Lab 2.5

This is a source audit of Gather on branch refactor/2-cloud-ready. TokTickIT is the lab example, not this repository. Checked boxes below describe code behavior; the GCP gates remain open until someone verifies actual resources and the deployed revision. No cloud deployment has been performed by this audit.

## Six-item checklist for the pull request

- [x] 1. Uploaded files are not saved in a local folder. Gather currently has no upload endpoint; all application data is in PostgreSQL. Future uploads must use database bytes or Cloud Storage.
- [x] 2. The seed is safe for production. Demo passwords are supplied only through DEMO_PASSWORD (12–256 characters), never printed or returned by the UI. Reruns preserve accounts, hashes, dates and registrations. Production CLI seeding is blocked unless an explicit UAT job sets ALLOW_DEMO_SEED=true.
- [x] 3. No dev shortcuts in production. Identity comes from the database-backed login session; no requester selector, user-header bypass, or displayed default login password exists. Admin-created users/default-password flows do not exist, so first-login password change is currently not applicable; require it before adding that feature.
- [x] 4. Sessions are stored in the database, not in server memory. connect-pg-simple uses PostgreSQL; all revisions must share the database and SESSION_SECRET.
- [x] 5. The server reads its port from PORT and binds to 0.0.0.0.
- [x] 6. /api/ready exists. It queries PostgreSQL and returns 200 with {status: "ready", db: "connected"}, or 503 with {status: "not_ready"} on failure. Existing /api/health behavior is preserved.

## Environment inventory — Lab 2.3

The root .env.example and server/.env.example list all eight variables read directly by application/test code, plus the local Compose setting. Both examples are identical; copy either to the repository-root .env. The current scripts do not load server/.env or client/.env. Optional settings remain commented so copying the examples does not enable production demo seeding or change the pool default. All example credentials are synthetic; real deployed URLs/passwords/session secrets belong in Secret Manager.

| Variable | Read by | Required/default |
| --- | --- | --- |
| DATABASE_URL | server/src/db.ts | Required for server, migration and seed; persistent DB |
| SESSION_SECRET | server/src/index.ts | Required, at least 32 random characters |
| PORT | server/src/index.ts | 3000 locally; supplied by Cloud Run |
| NODE_ENV | server/src/index.ts, both seed entry points | development locally; production in Docker/Cloud Run |
| DB_POOL_MAX | server/src/db.ts | Optional, 10; integer 1–100 |
| DEMO_PASSWORD | server/src/seed.ts, server/scripts/seed.ts | Required only for explicit demo seed, 12–256 characters |
| ALLOW_DEMO_SEED | Both seed entry points | Production seed opt-in, otherwise blocked |
| TEST_DATABASE_URL | tests and playwright.config.ts | Required only for tests; disposable *_test database |
| POSTGRES_PASSWORD | compose.yaml interpolation | Local Compose only; synthetic default documented |

No process.env or import.meta.env reads exist in the Vite client. No client environment file is needed; client API requests use the same origin. TokTickIT-specific ADMIN_PASSWORD, CORS_ORIGIN, SEED_DEMO_DATA and legacy requester settings are not settings in Gather and have not been invented here.

## Additional code checks

- [x] Login rate-limit counters live in PostgreSQL (002_login_rate_limits.sql), so instances and revisions share the same window. Atomic upserts prevent lost concurrent increments; expired counters are pruned by requests. Database errors fail closed through the API error handler.
- [x] Pool connections are bounded by DB_POOL_MAX (default 10, allowed 1–100). Connection establishment times out after 5 seconds; statements after 10 seconds and client queries after 12 seconds.
- [x] Production enables Secure/HttpOnly/SameSite=Lax session cookies and trusts one proxy hop for HTTPS termination. Existing CSRF checks and session regeneration stay enabled.
- [x] SIGTERM stops accepting requests and closes the pool, with a 9-second forced exit inside Cloud Run's shutdown window.
- [x] Docker uses Node 24, installs production dependencies in its runtime stage, runs as a non-root user, and includes the built UI and SQL migrations. No .env is copied into the image. Explicit Docker/gcloud ignore rules exclude local credentials and generated files.
- [x] Frontend API calls use the same origin; there is no deployed localhost API URL. The server serves the built UI and its assets.
- [x] A repeatable smoke command checks readiness, the UI document and its real JavaScript asset: npm run smoke -- https://YOUR-SERVICE-URL.

## GCP gates — verify before traffic/UAT

- [ ] Create/select the project, billing account, region and Artifact Registry repository; enable required Run, SQL Admin, Secret Manager, Artifact Registry and build APIs. Keep Cloud Run and Cloud SQL near each other. Set budget alerts.
- [ ] Build/push the Dockerfile as a Linux amd64-compatible image, scan dependencies/image, and record an immutable image digest and source commit. Do not deploy a development server. This workstation has no Docker CLI, so the actual image build remains a CI gate.
- [ ] Provision persistent Cloud SQL PostgreSQL, enable automated backups/PITR as required, and verify a restore procedure. Use separate development, test and deployed databases.
- [ ] Attach Cloud SQL to the service and migration/seed jobs; use its authenticated Unix socket or a correctly secured private connection. For the built-in Unix socket path, use DATABASE_URL in the form postgresql://USER:ENCODED_PASSWORD@/DATABASE?host=/cloudsql/PROJECT:REGION:INSTANCE (URL-encode credentials). A localhost URL from .env will not connect to Cloud SQL. Do not bypass certificate validation for a direct TCP connection.
- [ ] Give a dedicated runtime service account only the required Cloud SQL Client and per-secret Secret Accessor permissions. Prefer a separate migration account with DDL access; the web database role needs application/session/rate-limit DML, not schema ownership. Avoid service-account key files and project-wide Editor.
- [ ] Inject DATABASE_URL and a strong random SESSION_SECRET from Secret Manager, pinned to explicit secret versions. Keep the same SESSION_SECRET across instances/revisions to preserve sessions. Set NODE_ENV=production. Keep DEMO_PASSWORD and ALLOW_DEMO_SEED off the web service.
- [ ] Set maximum instances and DB_POOL_MAX so all active revisions/instances plus migration jobs and maintenance connections fit Cloud SQL's connection budget; allow deployment/surge headroom. Choose request concurrency and memory with load tests, including concurrent Argon2 logins (each hash uses about 19 MiB). Do not treat a max-instance setting alone as an absolute database connection guarantee.
- [ ] Run migrations once as a controlled Cloud Run Job from the same image, command: node dist/server/migrate.js. Wait for success before sending traffic. The advisory lock serializes migrations; never edit previously applied SQL. New migration 002 is required for login throttling. Keep schema changes compatible with the old revision for rollback.
- [ ] If UAT needs demo accounts, run a separate explicit job: node dist/server/seed.js, with NODE_ENV=production, ALLOW_DEMO_SEED=true and DEMO_PASSWORD from Secret Manager. Do not seed on container startup or every deploy. Reruns intentionally do not rotate existing passwords; use fresh UAT accounts/database or an explicit account-management procedure when rotating credentials. Keep access limited to the intended testers.
- [ ] Verify the ingress/IAM policy for intended users. A public browser login page needs public invocation (or an intentional compatible access layer); application authentication still protects private APIs. Confirm only the intended proxy can reach the service and test req.ip/login throttling with the real proxy chain. Recheck trust proxy if adding a load balancer/IAP.
- [ ] Verify HTTPS, Secure cookie delivery, sign-in/logout, CSRF rejection, and forbidden access for the other role on the actual service URL. Keep frontend and API on the same origin unless deliberately configuring CORS/cookies.
- [ ] Use /api/ready for the post-deployment smoke gate (and optionally an HTTP startup probe). It depends on PostgreSQL. Do not use a database-dependent endpoint as a liveness restart signal; use a separate process-only endpoint if configuring HTTP liveness. Configure probe timeouts/thresholds with the database timeouts in mind.
- [ ] Configure Cloud Logging/error and uptime alerts for 5xx, latency, readiness failures and DB saturation; avoid logging secrets, cookies, passwords or database URLs. Schedule expired-session deletion as a database/Cloud Run job if needed: the current in-process 15-minute cleanup timer is best effort with idle CPU and scale-to-zero; session expiry enforcement does not depend on it.
- [ ] Run npm run smoke -- https://YOUR-SERVICE-URL after every deployment; record the revision, commit/digest and result. Then perform Organizer publish → Participant registration → owner roster, cross-role denial, session continuity after a revision change, and data persistence after redeploy. Verify scale-out shares sessions and the 429 login limit. Rehearse rollback to the previous compatible revision.

## Validation and limits

The source suite covers real PostgreSQL sessions, cross-instance registration races and seed/migration reruns. New CLOUD-01–04 tests cover readiness success/outage, atomic throttling across independent pools/recreation, and database-clock expiry/cleanup. T-13 now checks that a fresh application instance retains the login block. Test fixtures clear only the guarded dedicated *_test database.

Local production build, 47/47 automated tests, 12/12 browser cases, built-server smoke and production seed safeguards passed on 15 November 2026; detailed results are recorded in [the PR draft](cloud-run-pr.md). Cloud SQL connectivity, IAM, actual Linux container startup and deployed browser/persistence checks cannot be inferred from local tests; keep the gates above open until verified.

## Official deployment references

- [Cloud Run container contract: ports, filesystem, signals and image architecture](https://docs.cloud.google.com/run/docs/container-contract)
- [Cloud SQL PostgreSQL from Cloud Run: service identity, sockets and pool limits](https://docs.cloud.google.com/sql/docs/postgres/connect-run)
- [Cloud Run Secret Manager configuration and pinned environment secret versions](https://docs.cloud.google.com/run/docs/configuring/services/secrets)
- [Cloud Run health probes and their different purposes](https://docs.cloud.google.com/run/docs/configuring/healthchecks)
