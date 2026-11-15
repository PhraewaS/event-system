# Prepare Gather for Cloud Run and shared-instance authentication

Part of #7. The handout uses #2 as its example issue; repository Issue #2 is already accepted event-publication work and is not reopened by this change.

## Problem and resulting behavior

Gather had a database check at /api/health but lacked the lab smoke endpoint /api/ready. Login throttling used process memory and could reset on deployment or scale-out. This change adds the readiness contract, moves login counters to PostgreSQL with an additive migration, bounds database waits and makes pool size configurable. It removes the sample demo password, permits explicit production UAT seed jobs using environment secrets, and adds a deployment smoke command and GCP checklist.

## Lab 2.3 — environment configuration

- [x] Audited every process.env/import.meta.env reference in server, client, tests, scripts and build/test configuration.
- [x] Root .env.example and server/.env.example document all eight directly read variables and the local Compose POSTGRES_PASSWORD setting, including examples, defaults, secret handling and scope. Optional settings are comments. The Vite client reads no environment variables.
- [x] Only synthetic example credentials/placeholders are included; .env and real secrets remain ignored.

## Lab 2.5 checklist

- [x] 1. Uploaded files are not saved in a local folder. Gather currently has no upload endpoint; all application data is in PostgreSQL. Future uploads must use database bytes or Cloud Storage.
- [x] 2. The seed is safe for production. Demo passwords are supplied only through DEMO_PASSWORD (12–256 characters), never printed or returned by the UI. Reruns preserve accounts, hashes, dates and registrations. Production CLI seeding is blocked unless an explicit UAT job sets ALLOW_DEMO_SEED=true.
- [x] 3. No dev shortcuts in production. Identity comes from the database-backed login session; no requester selector, user-header bypass, or displayed default login password exists. Admin-created users/default-password flows do not exist, so first-login password change is currently not applicable; require it before adding that feature.
- [x] 4. Sessions are stored in the database, not in server memory. connect-pg-simple uses PostgreSQL; all revisions must share the database and SESSION_SECRET.
- [x] 5. The server reads its port from PORT and binds to 0.0.0.0.
- [x] 6. /api/ready exists. It queries PostgreSQL and returns 200 with {status: "ready", db: "connected"}, or 503 with {status: "not_ready"} on failure. Existing /api/health behavior is preserved.

## Deployment requirements

Run node dist/server/migrate.js from the built image before routing traffic; migration 002 creates the shared login counter table. Configure NODE_ENV=production, a stable Secret Manager SESSION_SECRET, Cloud SQL DATABASE_URL and the pool/instance budget. Production UAT seed jobs alone may set ALLOW_DEMO_SEED=true and receive DEMO_PASSWORD.

See [additional GCP gates](cloud-run-readiness.md#gcp-gates--verify-before-trafficuat). IAM, Cloud SQL, backups/restore, image build/scan, deployed smoke/journeys and rollback verification are pending. This PR does not claim a completed GCP deployment.

## Validation

Local verification on 15 November 2026 (Windows, Node 24.19.0):

- npm run build: passed (TypeScript and production Vite bundle).
- npm test -- --reporter=verbose: 47/47 tests passed, including CLOUD-01–04 and cross-instance login blocking in T-13.
- npm run test:e2e: 12/12 desktop/mobile browser journeys passed with zero configured retries.
- Built server with NODE_ENV=production on a temporary local port: /api/ready, the UI document and its JavaScript asset passed scripts/smoke.mjs.
- Built production seed CLI: blocked by default; rejected a missing password after opt-in; two explicit environment-secret seed runs preserved all existing test account hashes and did not print the supplied password.
- git diff --check: passed.

All database verification used the guarded disposable *_test database. Docker image build/startup and real GCP deployment checks remain unverified here; the Docker CLI is unavailable. Existing CI builds the image when this branch is submitted. The Windows build/test runners needed permission to start child processes; their approved runs passed.

## Review and integration

Deployment work relates to Issue #7. Independent review, GitHub Development linkage, CI/image build and integration remain pending. This file is the versioned PR body. Same-team guluJa review and approval must precede merge into sprint1-staging. Issue #7 stays open until its broader container/GCP deployment gates are complete.
