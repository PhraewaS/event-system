# Gather — Sprint 1 event system

React + TypeScript + Vite → Express JSON API → persistent PostgreSQL. Uses the lab stack; `pg` and versioned SQL keep transaction/constraint behavior explicit. Node 24 and PostgreSQL 15+ required. One consolidated [engineering baseline](docs/sprint-1.md) contains SRS, system/feature SDS, feature inventory, traceability, AC, STS, permissions and references.

The complete runnable review snapshot is on `feature/sprint1-github-delivery-5`. The increment is separated into eight issue/feature-branch/PR review units, following [toktickit](https://github.com/PhraewaS/toktickit). Start review with [foundation PR #14](https://github.com/PhraewaS/event-system/pull/14); dependent PRs remain Draft until their parent is accepted into `sprint1-staging`. `main` is the accepted-release branch. See the [review order](docs/sprint-1.md#current-issue-branch-pr-review-order).

## Local setup

1. Install Node 24 and PostgreSQL. Create **separate** development/test databases using an account allowed to create roles/databases (run once in `psql`):

   ```sql
   CREATE ROLE event_app LOGIN PASSWORD 'local-demo-password';
   CREATE DATABASE event_system_dev OWNER event_app;
   CREATE DATABASE event_system_test OWNER event_app;
   ```

   The sample password is synthetic local-only data. Use your own credentials for hosted environments. On Windows, `psql.exe` may be under `C:\Program Files\PostgreSQL\17\bin`.

2. Copy `.env.example` to `.env`, adjust connection URLs, and replace `SESSION_SECRET` with random output from:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
   ```

3. From this folder:

   ```sh
   npm ci
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

   Open http://localhost:5173. Vite proxies the API to port 3000. Alternatively, `npm run build` then `npm start` serves the entire application at http://localhost:3000. Migrate before starting. Schema changes use a new numbered SQL file; never edit an applied migration. Migration names/checksums are persisted and verified; concurrent migration runners use an advisory lock.

## Demo workflow

The four accounts use the `DEMO_PASSWORD` configured when first seeded (example: `Gather-demo-2026!`). These are synthetic accounts, not real secrets.

| Email                     | Role                                            |
| ------------------------- | ----------------------------------------------- |
| organizer@example.test    | Organizer (Alex Morgan)                         |
| organizer2@example.test   | Organizer (Jamie Rivera; separate ownership)    |
| participant@example.test  | Participant (Sam Taylor)                        |
| participant2@example.test | Participant (Riley Chen; separate private data) |

Sign in as Organizer → Publish an event (capacity 1 makes rejection easy to demonstrate) → sign out → sign in as Participant → discover event → reserve a place → My registrations → sign out → sign in as original Organizer → My events → View registrations. A second Participant sees Fully booked. Participants cannot publish; the other Organizer cannot read the first Organizer's roster.

Seed reruns preserve accounts, passwords, dates and existing registrations. Initial event dates are relative to the first seed; existing events do not move on rerun. Reset demo data only by intentionally creating a fresh disposable database, not by dropping the lab database. No automatic production seeding.

Sprint 1 decisions: duplicate registration returns 409, deadline closes registration at that instant, capacity is fixed after publication. Cancellation, editing capacity, check-in and attendance reports are planned for later sprints.

## Automated verification

```sh
npm run build
npm test -- --reporter=verbose
npx playwright install chromium
npm run test:e2e
node scripts/evidence.mjs
```

`npm test` and browser tests use **TEST_DATABASE_URL only** and deliberately clear their own data. The database name must end in `_test`. Do not point it at a shared database. Run suites sequentially; the API suite and browser suite own the same disposable test database. Browser tests start a separate server on port 3100 and test the built UI, so build first. Browser reports, traces, screenshots and source hashes are under ignored `artifacts/`. The initial intentional failing test run is retained locally as `artifacts/tdd-red.log`; the subsequent green run as `artifacts/tdd-green.log`. Preserve these with the submitted commit; source manifests record a real commit when one exists, otherwise `null`.

Coverage: valid/invalid login, persisted sessions and logout/expiry, CSRF, role/ownership/private-data access, field boundaries, SQL constraints, duplicate/full/closed rejection, independent API-instance races for the last place and concurrent duplicate submissions, restart persistence, and desktop/mobile browser journeys.

## Configuration and security

| Variable          | Purpose                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| DATABASE_URL      | PostgreSQL application connection; required                                |
| TEST_DATABASE_URL | Dedicated disposable database, name ending `_test`                         |
| SESSION_SECRET    | Random 32+ characters; required; changing it invalidates signed cookies    |
| PORT              | API/production UI port, default 3000                                       |
| NODE_ENV          | `production` enables Secure cookies and trusts one terminating proxy       |
| DEMO_PASSWORD     | 12+ characters; required only by local seed; ignored for existing accounts |
| POSTGRES_PASSWORD | Optional Compose database password; default is local synthetic example     |

Eight-hour server sessions are stored in PostgreSQL, not process memory; login rotates the ID/CSRF token; logout revokes it. HttpOnly/SameSite cookies, server role/ownership checks, Argon2id password hashes and synchronizer CSRF tokens protect the workflow. Login limits 20 failed attempts per IP per 15 minutes per API process. Deploy behind a correctly configured HTTPS proxy; multi-instance deployment should centralize login throttling at the gateway. No real secrets belong in Git, Docker images, or browser storage. `/api/health` checks database connectivity. Event/public/roster lists use pages of 200 with `?offset=` and a `page.nextOffset`; UI loads subsequent pages.

## Container and delivery status

Docker/CI files are prepared; Docker is not installed on the implementation machine, so local Docker execution is **not verified**. With Docker installed and a random `SESSION_SECRET` in `.env`:

```sh
docker compose up --build
```

Open http://localhost:3000. Compose uses its own PostgreSQL container/volume; `migrate` must succeed before the application starts. No demo accounts are inserted automatically. Seed the **local** Compose database with:

```sh
docker compose exec -e DEMO_PASSWORD=Gather-demo-2026! app node dist/server/seed.js
```

Production mode rejects demo seeding. `docker compose down` preserves data; deleting its volume deletes the database. The production image supports the one-off release migration command `node dist/server/migrate.js` before starting the server.

The [public repository](https://github.com/PhraewaS/event-system) is connected as `origin`, with a [six-stage Kanban](https://github.com/users/PhraewaS/projects/3/views/2) and [Sprint 1 milestone](https://github.com/PhraewaS/event-system/milestone/1). Each bounded change has its own Issue, `feature/sprint1-…-<issue>` branch and PR. The former all-in-one PR #10 and `feat/sprint-1` preserve the initial implementation history; the new review units are explicitly reconstructed from that snapshot. They do not invent an earlier issue-first or TDD timeline.

Current staging is `sprint1-staging` (renamed from `sprint/1`); protections still require the Actions build-and-test check, an up-to-date branch, one independent approval and resolved conversations, including for administrators. Force pushes/deletion are blocked. Feature PRs ultimately integrate into staging, followed by a separately reviewed release PR to main and an accepted tag. Current dependent Draft PRs temporarily compare against their parent feature branch to keep each diff isolated. After the parent is reviewed/merged, update from staging, retarget the child to sprint1-staging, rerun checks and obtain the required review; do not merge Draft children into feature branches.

Issues #1–#4 cover the domain APIs, #11 foundation/contracts, #12 role UI, #13 verification/evidence, #5 repository delivery and #6 final staging/release acceptance. Issues #7–#9 retain Lab 5 and later features. The Project tracks Issue cards only; explicit PR hyperlinks in each Issue provide traceability without duplicate PR cards or automatic-closing associations.

CI runs the build, the actual tests present in each partial review unit, and Docker build. Browser installation/E2E execute once the verification unit supplies the browser specifications. The complete snapshot preserves all 18 original tests unchanged and adds two real-database foundation cases plus an authentication-boundary case: **21 tests**, followed by the same **six browser scenarios**. [Actions](https://github.com/PhraewaS/event-system/actions) records the tested commit and actual per-PR result; [original evidence](evidence/sprint-1/) retains its original commit identity. `guluJa` remains the nominated teammate; approval and release acceptance are separate human events.

GCP deployment and completed CI/CD are due in Lab 5. The planned deployment is Cloud Run + Cloud SQL PostgreSQL + Secret Manager, with release migrations and an approved main-to-release pipeline. No cloud resources were created or deployed. See the engineering baseline for official documentation sources and the remaining release gates.
