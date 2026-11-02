# Gather — Sprint 1: organizer

Review unit 5/8: [Issue #4](https://github.com/PhraewaS/event-system/issues/4) → [PR #18](https://github.com/PhraewaS/event-system/pull/18). Previous APIs plus organizer-owned event lists and owner-only registration rosters. The UI still shows database health; role screens come in PR #19.

This is a scoped, cumulative review snapshot. The [engineering baseline](docs/sprint-1.md) describes the complete target increment; later features and historical full-increment evidence do not represent functionality or tests on this branch. The complete runnable snapshot is on `feature/sprint1-github-delivery-5`.

## Local setup for this branch

Use Node 24 and PostgreSQL 15+. React/TypeScript/Vite → Express API → persistent PostgreSQL follows the lab stack. Versioned SQL and `pg` make database constraints and transactions explicit.

1. Check out `feature/sprint1-organizer-management-4` after cloning the repository.
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

This snapshot retains the 30 foundation/authentication/publication/registration tests and introduces T-03/T-10/T-11/T-15 for the complete backend API/ownership/constraint slice: **34 inherited tests** before the organizer acceptance audit. Current results and additional verification are tracked in Issue #4 / PR #18. Browser acceptance tests are introduced in PR #20; do not run or claim browser verification for this snapshot.

Tests intentionally clear only `TEST_DATABASE_URL`, whose database name must end in `_test`. Use a separate disposable database and run database/browser suites sequentially. Build before running browser tests. Generated local logs/manifests are under ignored `artifacts/`; hosted CI artifacts identify the submitted head. Required CI builds the application, runs the tests available on this branch, builds the Docker image and uploads evidence. Docker/Compose execution on the implementation machine and GCP deployment are separate gates; Compose is introduced in PR #21 and GCP is Lab 5 work.

## Review and integration workflow

Parent PR #17 received same-team approval from guluJa at `1b913d114c247e0aecc54b3c7ad6b1e977e91d99` and was merged into `sprint1-staging` at `b225e83667b2c443c2a53edcf66c1e75d0ce9b7d`. This organizer-management branch incorporates that source. PR #18 is the next bounded API review unit into staging. The earlier foundation/authentication same-team assessments are recorded in closed Issues #11/#1; their missing pre-merge reviews remain historical process deviations and are not recreated by retrospective checks.

The [Kanban](https://github.com/users/PhraewaS/projects/3/views/2) tracks Issues. Ready work uses PR Review; review findings use Fixing. One independent teammate approval, passing required `build-and-test`, an up-to-date branch and resolved conversations are required to merge. Use the PR's Reviewers sidebar for the current teammate request; Assignees alone do not request review. An actual review must state a specific check, finding or reason for approval. Authors cannot approve their own PRs.

PR review is performed by the other developer in the same team: PhraewaS and guluJa review each other's changes. Cross-team accounts do not substitute for that course gate, even if GitHub grants Write access. Cross-team UAT begins in Lab 6 on an actual released version: the other group executes the linked cases, records the release/commit and results, raises defect Issues, and retests the relevant released version after fixes. Existing cross-team code approvals are additional historical feedback, not completed UAT. No UAT result is claimed now.

After reviewed staging integration and acceptance for this item's scope, record the merge and close its Issue/move it to Done. Manual Development linking does not replace acceptance evidence. Follow the remaining dependent PRs in order; [Issue #6](https://github.com/PhraewaS/event-system/issues/6) tracks full sprint integration and a separately reviewed release PR from staging to `main`. No release is accepted yet.

The original implementation branch `feat/sprint-1` and superseded PR #10 preserve the earlier history. This series reconstructs bounded review units from that implementation; it does not invent an earlier issue-first/TDD sequence. Follow the official [issue linking](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue) and [protected branch review](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) guidance.
