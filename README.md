> Review unit 8/8: **[Sprint 1] Repository delivery conventions and local containers**, Issue #5. This branch contains the cumulative dependency snapshot through this unit. The complete increment was originally implemented at 369961b; these are newly reconstructed review units, not backdated initial development. Earlier units intentionally omit later APIs/UI/tests. Follow the dependency order and merge into sprint1-staging only after independent review.

# Gather — Sprint 1 event system

React + TypeScript + Vite → Express JSON API → persistent PostgreSQL. Uses the lab stack; `pg` and versioned SQL keep transaction/constraint behavior explicit. Node 24 and PostgreSQL 15+ required. One consolidated [engineering baseline](docs/sprint-1.md) contains SRS, system/feature SDS, feature inventory, traceability, AC, STS, permissions and references.

The implementation is on `feat/sprint-1`, awaiting independent review into `sprint/1`; `main` remains the release branch. Until acceptance, clone/check out `feat/sprint-1` to run the application.

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

The [public repository](https://github.com/PhraewaS/event-system) is connected as `origin`. The [project board](https://github.com/users/PhraewaS/projects/3), [Sprint 1 milestone](https://github.com/PhraewaS/event-system/milestone/1), and [issues](https://github.com/PhraewaS/event-system/issues) track the work. Feature review issues #1–#4 cover F-01–F-04; #5 tracks bootstrap; #6 tracks independent integration/release acceptance; #7 tracks Lab 5; #8–#9 retain later-sprint features. Tracking was added after the original local implementation; no earlier issue/PR history is claimed.

Both `main` and `sprint/1` enforce a passing GitHub Actions `build-and-test` check, an up-to-date branch, one independent approval, stale-review dismissal and resolved conversations, including for administrators. Force pushes/deletion are blocked. Merge commits preserve implementation history; staging branches are retained. The [implementation PR list](https://github.com/PhraewaS/event-system/pulls) targets `sprint/1`; only an approved release PR may move the increment to `main`. Hosted CI validates build, PostgreSQL API tests, desktop/mobile browser tests and the Docker build, with evidence in [Actions](https://github.com/PhraewaS/event-system/actions). CI is configured with read-only default token permissions and cannot approve PRs.

`guluJa` was invited with repository Write and project Writer access. The repository invitation must be accepted before collaborator review can be completed. Issue/PR templates are included with this feature branch and become the default forms after the reviewed release reaches `main`. [Preserved local red/green/browser evidence](evidence/sprint-1/) identifies implementation commit `305444a`; hosted CI records its own submitted commit. Teammate approval, reviewed integration, release tagging and GCP deployment remain human/release gates, tracked in #6/#7.

GCP deployment and completed CI/CD are due in Lab 5. The planned deployment is Cloud Run + Cloud SQL PostgreSQL + Secret Manager, with release migrations and an approved main-to-release pipeline. No cloud resources were created or deployed. See the engineering baseline for official documentation sources and the remaining release gates.
