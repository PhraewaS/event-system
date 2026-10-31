# Gather — Sprint 1: authentication

Review unit 2/8: [Issue #1](https://github.com/PhraewaS/event-system/issues/1) → [PR #15](https://github.com/PhraewaS/event-system/pull/15). Foundation plus login/logout/current identity, PostgreSQL sessions, password hashing, CSRF and server authentication boundaries. The UI still shows database health; role screens come in PR #19.

This is a scoped, cumulative review snapshot. The [engineering baseline](docs/sprint-1.md) describes the complete target increment; later features and historical full-increment evidence do not represent functionality or tests on this branch. The complete runnable snapshot is on `feature/sprint1-github-delivery-5`.

## Local setup for this branch

Use Node 24 and PostgreSQL 15+. React/TypeScript/Vite → Express API → persistent PostgreSQL follows the lab stack. Versioned SQL and `pg` make database constraints and transactions explicit.

1. Check out `feature/sprint1-authentication-1` after cloning the repository.
2. Create separate disposable development/test databases once in `psql`:

   ```sql
   CREATE ROLE event_app LOGIN PASSWORD 'local-demo-password';
   CREATE DATABASE event_system_dev OWNER event_app;
   CREATE DATABASE event_system_test OWNER event_app;
   ```

3. Copy `.env.example` to `.env`, adjust the connection URLs and replace `SESSION_SECRET` using random output from:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
   ```

4. Run:

   ```sh
   npm ci
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

Open http://localhost:5173. The page must display **API and persistent PostgreSQL are connected.** Login/registration screens are intentionally introduced in PR #19.

For the built application run `npm run build` then `npm start` and open http://localhost:3000. `GET /api/health` runs a real database query and returns `{ "data": { "status": "ok" } }`; database failure returns 503. Stop/restart the server: the seeded data remains in PostgreSQL.

## Seed and configuration

Four synthetic accounts are seeded: `organizer@example.test`, `organizer2@example.test`, `participant@example.test`, and `participant2@example.test`. Their initial password is `DEMO_PASSWORD` from the local environment. Passwords use Argon2id. Seed reruns preserve existing accounts, hashes, dates and registrations; three sample events are inserted once. Seeding is disabled in production.

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | Persistent application PostgreSQL connection |
| TEST_DATABASE_URL | Separate disposable database ending in `_test` |
| SESSION_SECRET | Random value of at least 32 characters; reserve for session signing |
| DEMO_PASSWORD | At least 12 characters; required for local demo seeding |
| PORT | Application port; defaults to 3000 |
| NODE_ENV | Development locally; production for deployed builds |

Local sample credentials are synthetic. Never commit `.env` or real credentials. Migration names/checksums are stored in PostgreSQL; add new numbered migrations rather than changing applied files. Relationships and constraints are defined in [001_initial.sql](server/migrations/001_initial.sql).

## Verification for this snapshot

```sh
npm run build
npm test -- --reporter=verbose
node scripts/evidence.mjs
```

The current cumulative suite has **10 tests**, including new boundary cases for both roles, spoofed/malformed login fields, current database identity and eight-hour session expiry. The [authentication acceptance contract and test mapping](docs/sprint-1.md#authentication-review-contract--issue-1--pr-15) states the partial review scope. Browser acceptance tests are introduced in PR #20; do not run or claim browser verification for this snapshot.

Tests intentionally clear only `TEST_DATABASE_URL`, whose database name must end in `_test`. Use a separate disposable database and run database/browser suites sequentially. Build before running browser tests. Generated local logs/manifests are under ignored `artifacts/`; hosted CI artifacts identify the submitted head. Required CI builds the application, runs the tests available on this branch, builds the Docker image and uploads evidence. Docker/Compose execution on the implementation machine and GCP deployment are separate gates; Compose is introduced in PR #21 and GCP is Lab 5 work.

## Review and integration workflow

Parent PR #14 received independent approval and was merged into `sprint1-staging` at `d4ba0fb15da5fd6be1cc327d64466d9adaf69d9d`. This branch is synchronized from that staging commit; PR #15 targets staging for its own independent review. Current validation and readiness are recorded in Issue #1 and PR Checks. Domain publication/registration/ownership PRs continue to wait for authentication acceptance.

The [Kanban](https://github.com/users/PhraewaS/projects/3/views/2) tracks Issues. Ready work uses PR Review; review findings use Fixing. One independent teammate approval, passing required `build-and-test`, an up-to-date branch and resolved conversations are required to merge. Use the PR's Reviewers sidebar for the current teammate request; Assignees alone do not request review. An actual review must state a specific check, finding or reason for approval. Authors cannot approve their own PRs.

After reviewed staging integration and acceptance for this item's scope, record the merge and close its Issue/move it to Done. Manual Development linking does not replace acceptance evidence. Follow the remaining dependent PRs in order; [Issue #6](https://github.com/PhraewaS/event-system/issues/6) tracks full sprint integration and a separately reviewed release PR from staging to `main`. No release is accepted yet.

The original implementation branch `feat/sprint-1` and superseded PR #10 preserve the earlier history. This series reconstructs bounded review units from that implementation; it does not invent an earlier issue-first/TDD sequence. Follow the official [issue linking](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue) and [protected branch review](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) guidance.
