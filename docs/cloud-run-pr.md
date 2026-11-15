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

See [additional GCP gates](https://github.com/PhraewaS/event-system/blob/refactor/2-cloud-ready/docs/cloud-run-readiness.md#gcp-gates--verify-before-trafficuat). Image build passed in hosted CI; image scanning, IAM, Cloud SQL, backups/restore, deployed smoke/journeys and rollback verification remain pending. This PR does not claim a completed GCP deployment.

## Acceptance criteria and verification mapping

These IDs make the implemented Cloud Run preparation outcomes explicit for review; they are recorded after implementation in response to the review, not claimed as a pre-implementation/TDD contract. Checked items mean source behavior/verification is complete; independent approval and merge remain pending.

| AC ID | Observable acceptance outcome | Verification and type |
| --- | --- | --- |
| AC-CLOUD-01 | GET /api/ready queries PostgreSQL, returns 200 with status=ready/db=connected when available, or 503 with status=not_ready on query failure; neither response creates a session or exposes database internals. | Automated CLOUD-01–02 in tests/cloud-run.test.ts; CLOUD-01 also checks Cache-Control=no-store. |
| AC-CLOUD-02 | Login counters are shared across independent pools/instances/recreation: 40 concurrent increments yield each count 1–40 once, then a fresh store sees 41; successful decrement works; after 20 failed logins a fresh app returns 429, and DB-clock expiry permits login again. Expired counters are pruned on requests. | Automated CLOUD-03–04 and T-13 in tests/security.test.ts. |
| AC-CLOUD-03 | Seed CLI rejects production execution without explicit ALLOW_DEMO_SEED=true and rejects missing DEMO_PASSWORD; an opted-in secret supplied through the environment is not printed. Two reruns preserve existing account IDs/hashes; source requires 12–256 characters and ON CONFLICT preserves existing events. | CLOUD-MANUAL-SEED-01 below; inherited automated T-11 / FOUND-02 cover migration/seed reruns and persisted data. Production opt-in/output checks are outside Vitest/CI. |
| AC-CLOUD-04 | DB_POOL_MAX defaults to 10; 1 and 100 are accepted; 0, 101, fractions and non-numbers are rejected. Pool options set connectionTimeoutMillis=5000, statement_timeout=10000 and query_timeout=12000. | CLOUD-MANUAL-POOL-01 below; configuration inspection, not an elapsed-time/load test. |
| AC-CLOUD-05 | PostgreSQL stores sessions; login requires credentials/CSRF with no requester bypass/default password UI; no upload route writes local files. Server reads PORT and listens on 0.0.0.0; SIGTERM closes server/pool with a 9-second forced-exit fallback. | CLOUD-MANUAL-SOURCE-01 inspection; inherited automated T-02, T-14 and AUTH-BOUND-06 cover session recreation/expiry and production cookies. No live Cloud Run shutdown test is claimed. |
| AC-CLOUD-06 | Both environment examples are identical and document all eight process.env settings plus local Compose POSTGRES_PASSWORD, using synthetic examples and comments for optional settings; Vite client has no environment reads. | CLOUD-MANUAL-ENV-01 source/example audit. |
| AC-CLOUD-07 | Against a running built production server, scripts/smoke.mjs succeeds only after database readiness, built UI root/module markup and a same-origin JavaScript response with JavaScript content type pass. | CLOUD-MANUAL-SMOKE-01 below, operator-invoked command outside the automated suite. |
| AC-CLOUD-08 | README/System SDS describe 47 current tests and PostgreSQL-shared throttling; source-bound CI and local browser runs are separated, historical v0.1.0 43-test evidence is retained, and cloud/runtime/review gates remain explicit. | CLOUD-MANUAL-DOC-01 diff/link/history inspection; exact-head hosted regression results recorded separately below. |

## Automated checks — source 7ea91c9

[Hosted CI](https://github.com/PhraewaS/event-system/actions/runs/43718365737/job/132824718905) submitted head 7ea91c98b7797465cf349aaf083b7b4cb36e8275 passed on 15 November 2026: clean install, production build, 47/47 tests in seven files (CLOUD-01–04, T-13 and inherited tests), 12/12 browser cases (17.4 seconds total), Compose configuration validation, Docker image build and evidence upload. The CI tests the PR integration checkout; submitted head and run are identified separately from the accepted v0.1.0 release. Docker build success does not prove actual application-container startup or GCP deployment.

## Manual/operator-invoked checks — source 7ea91c9

These inspections and scripted commands were invoked outside Vitest/Playwright/hosted CI; they are not extra cases in the 47-test count. Seed, pool-option and built-server smoke checks were repeated successfully on 15 November 2026 before the documentation revision.

| Check ID | Reproducible procedure / actual result | Limit |
| --- | --- | --- |
| CLOUD-MANUAL-SEED-01 | On a guarded disposable *_test DB, run node dist/server/seed.js with NODE_ENV=production: without opt-in it exits nonzero; with opt-in but empty DEMO_PASSWORD it exits nonzero. Supply a generated 12–256-character environment secret and run twice; compare SELECT id,password_hash FROM users ORDER BY id before/after and inspect captured stdout/stderr without printing the secret. Both opted-in runs succeeded, existing accounts/hashes matched, secret absent from output. Reviewer independently reported seed checks passed. | Existing-account preservation/output/CLI policy checked; not a production account-rotation or Cloud Run Job execution test. |
| CLOUD-MANUAL-POOL-01 | Import built createPool with a synthetic URL, vary DB_POOL_MAX through unset, 1, 100, 0, 101, 1.5 and bad; inspect pool.options then close each pool. Actual default/valid max values were 10/1/100; invalid values rejected; timeout options were 5000/10000/12000 ms. | No connection is opened by this option inspection. Runtime timeout duration and total GCP connection capacity are not measured. |
| CLOUD-MANUAL-SMOKE-01 | Start built server with NODE_ENV=production, random SESSION_SECRET, PORT=3197 and the guarded TEST_DATABASE_URL used as DATABASE_URL; run node scripts/smoke.mjs http://127.0.0.1:3197. Database readiness, built HTML and real JavaScript asset passed; stop the temporary process. Reviewer independently reported smoke passed. | Local HTTP smoke; deployed HTTPS/cookie/IAM/proxy behavior remains a GCP gate. |
| CLOUD-MANUAL-ENV-01 | Enumerate process.env/import.meta.env in server, client, tests, scripts and configs; compare to both examples. All eight direct reads and Compose-only POSTGRES_PASSWORD documented; examples identical; no Vite client environment reads. | Synthetic placeholders require replacement; real settings are not published. |
| CLOUD-MANUAL-SOURCE-01 | Inspect app.ts, index.ts, migration 002, seed entry points and login UI for session storage, no bypass/upload/default password, PORT binding and shutdown handling. Outcomes match AC-CLOUD-05 and the six-item lab checklist. | Source inspection, not a deployed infrastructure check. |
| CLOUD-MANUAL-DOC-01 | Inspect changed README/System SDS/PR/audit, links and retained historical records; run git diff --check. Current count/shared-store design corrected; source and runner identity separated; release evidence and application/test implementation retained. | Approval and integration belong to the independent reviewer, not this inspection. |

## Separate browser execution records

| Source / runner | Build + unit/API/DB/client | Browser result | Evidence / interpretation |
| --- | --- | --- | --- |
| 7ea91c9 — assistant Windows local runs before initial PR | Build + 47/47 passed | Full suite 12/12 passed; separate recorded runs, zero configured retries | Prior local execution record; not substituted for the reviewer's local run below. |
| 7ea91c9 — guluJa local review | Build + 47/47 passed; seed and built-server smoke passed | Default full run: 11 passed; Desktop INT-UI-01 timed out at 30 seconds | [Actual review](https://github.com/PhraewaS/event-system/pull/39#pullrequestreview-5911000444) reports substantial time in browser/page startup in the trace; application defect not established. No timeout/retry/assertion change or focused rerun is claimed. |
| 7ea91c9 — hosted PR CI | Build + 47/47 passed; Compose + Docker build passed | 12/12 passed, 17.4 seconds total | [Source-bound CI](https://github.com/PhraewaS/event-system/actions/runs/43718365737/job/132824718905); separate environment/run, does not erase the reviewer's timeout. |

## Revision and remaining gates

This follow-up changes documentation/evidence only; application, migrations, test assertions, default browser timeout and zero-retry policy stay unchanged from 7ea91c9. Hosted validation of the new documentation head is recorded in the live PR after its run finishes; the source-bound 7ea91c9 run above is not relabelled as a new-head run. No independent acceptance, actual container startup/persistence, GCP deployment or completed UAT is claimed.

## Review and integration

Deployment work relates to Issue #7. guluJa requested changes at 7ea91c9; this documentation revision addresses both findings and awaits re-review. CI and Docker build at 7ea91c9 passed; native Development linkage and reviewed integration remain pending. This file is the versioned PR body. Same-team guluJa review and approval must precede merge into sprint1-staging. Issue #7 stays open until its broader container/GCP deployment gates are complete.
