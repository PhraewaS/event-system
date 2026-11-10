# Gather — Event registration (Sprint 1)

Gather is a React → Express → PostgreSQL event registration app. Organizers publish capacity-limited events and inspect owned rosters; Participants reserve places and view private registrations. Current verification: 43 unit/API/DB/client tests and 12 desktop/mobile browser cases.

The [engineering baseline](docs/sprint-1.md) defines the Sprint 1 increment and its acceptance evidence. Delivery PR #21 / Issue #5 has been accepted and merged into sprint1-staging at d04ed58. Release PR #24 was independently approved and merged into main at 0fb7e11. The first main CI passed build/43 tests but failed one mobile browser case (11/12); Issue #27 corrects test account-switch synchronization before the release/tag acceptance in Issue #6. Historical evidence retains its original source identity; current results must be attributed to their actual source and runner.

## Local setup for this branch

Use Node 24 and PostgreSQL 15+. React/TypeScript/Vite → Express API → persistent PostgreSQL follows the lab stack. Versioned SQL and `pg` make database constraints and transactions explicit.

1. Clone the repository. Until the reviewed release reaches main, check out sprint1-staging for the integrated application; main is the accepted-release branch.
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

Open http://localhost:5173. Sign in as Organizer, publish a capacity-1 event, sign out and register as Participant. View My registrations, then sign in as the owning Organizer to inspect the roster.

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
npx playwright install chromium
npm run test:e2e
node scripts/evidence.mjs
```

The current cumulative suite has **43 unit/API/database tests**: the 38 accepted foundation/authentication/publication/registration/organizer checks plus CLIENT-CSRF-01–05. There are **8 selected browser cases**: UI-REVIEW-01–04 each at desktop 1440×1000 and mobile 390×844. They run the built UI against the real API/test database; only UI-REVIEW-04 explicitly injects list responses to inspect empty/error/loading states. Its session-expiry check updates an actual test session and signs in again through the in-app link without reloading. See the [UI contract and test mapping](docs/sprint-1.md#ui-review-contract--issue-12--pr-19). The [organizer baseline](evidence/sprint-1/organizer-integration-baseline-2026-11-02.json), original [CSRF failing](evidence/sprint-1/csrf-red.txt)/[passing](evidence/sprint-1/csrf-green.txt) runs and [new expiry regression](evidence/sprint-1/ui-expiry-red-2026-11-04.json) remain preserved.

This verification unit adds **four browser cases**, INT-UI-01/02 at both viewports, for **12 browser cases total** with zero retries. Two separate Participant sessions submit for one remaining place; assertions compare 201/409 API outcomes, the sole SQL row and winner/loser/owner screens. Pagination uses 201 real owned-event fixtures plus foreign events and observes actual offset 0/200 responses. The old prepared six-case `sprint1.spec.ts` overlaps the stronger accepted `ui-review.spec.ts` and is superseded here; all accepted UI assertions remain unchanged. See the [verification contract](docs/sprint-1.md#verification-review-contract--issue-13--pr-20).

[Actual staging revalidation](evidence/sprint-1/staging-ui-revalidation-2026-11-06.json) records build/43 tests/eight browser cases at merged UI source `484027e`, before accepting UI Issues #12/#22/#23. The older `tdd-red.txt`, `test-results.txt`, `browser-results.txt` and `source-manifest.json` in evidence/sprint-1 retain their original implementation identities/counts; they are historical evidence, not current-source execution. Current hosted results and generated source manifests are linked from PR #20 / Issue #13.

### Execution records by source and runner

The following are separate runs of d04ed58, not a combined success claim:

| Execution | Unit/API tests and build | Browser outcome / limits | Evidence |
| --- | --- | --- | --- |
| Assistant, Final staging on 9 November | Build and 43 tests passed | Full default suite: 12/12 passed, zero retries | Issue #6 source/log hashes; staging/release CI links below |
| guluJa local release review | Build and 43 tests reported passed | Default full run: 8 passes and 4 timeouts at 30 seconds; focused rerun of two Desktop journeys with 120 seconds passed unchanged assertions. This is not a full local 12/12 pass. | [Reviewer report](https://github.com/PhraewaS/event-system/pull/24#pullrequestreview-5826613204) |
| Hosted CI at d04ed58 | Build and 43 tests passed; Compose config and image build passed | Full suite: 12/12 passed | [Staging CI](https://github.com/PhraewaS/event-system/actions/runs/42618680936), [Release CI](https://github.com/PhraewaS/event-system/actions/runs/42618689044) |

[First main CI at 0fb7e11](https://github.com/PhraewaS/event-system/actions/runs/42819320782) passed build/43 tests but had 11 browser passes/one mobile INT-UI-01 failure; Docker checks were skipped. The trace showed logout interrupted by login navigation, then a stale signed-in UI check. [Issue #27](https://github.com/PhraewaS/event-system/issues/27) records the synchronization fix and actual red/green evidence. All original assertions and default timeout/retry settings remain; previous executions above retain their own identities.

Tests intentionally clear only `TEST_DATABASE_URL`, whose database name must end in `_test`. Use a separate disposable database and run database/browser suites sequentially. Build before running browser tests. Generated local logs/manifests are under ignored `artifacts/`; hosted CI artifacts identify the submitted head. Required CI builds the application, runs the tests available on this branch, builds the Docker image and uploads evidence. Compose configuration is already included through accepted PR #21. Actual container startup/restart/persistence execution and completed GCP delivery remain Lab 5 Issue #7 gates.

## Why GitHub may show fewer files

The repository homepage displays its selected branch. main holds accepted releases; sprint1-staging holds integrated work awaiting release. If main shows only the initial docs, open [sprint1-staging](https://github.com/PhraewaS/event-system/tree/sprint1-staging) to view the already-pushed application. Files appear on main after the separately reviewed staging-to-main release PR is merged. Local .env, node_modules, dist, artifacts, .local and Windows desktop.ini stay ignored; they are not missing application source.

## Review and integration workflow

Verification PR #20 / Issue #13 is accepted. Delivery PR #21 was independently reviewed and approved by guluJa at c1088b0, then merged by guluJa into staging d04ed58 on 9 November 2026; Issue #5 is accepted/Done. README correction #25/#26 and updated release #24 were approved by guluJa and merged; main now contains the full application. First main CI at 0fb7e11 failed mobile INT-UI-01 after an interrupted test logout; Issue #27 follows the normal fix-to-staging/review/integration path. Issue #6 remains open pending corrected main CI and actual release/tag evidence. Earlier foundation/authentication process deviations remain recorded.

The [Kanban](https://github.com/users/PhraewaS/projects/3/views/2) tracks Issues. Ready work uses PR Review; review findings use Fixing. One independent teammate approval, passing required `build-and-test`, an up-to-date branch and resolved conversations are required to merge. Use the PR's Reviewers sidebar for the current teammate request; Assignees alone do not request review. An actual review must state a specific check, finding or reason for approval. Authors cannot approve their own PRs.

PR review is performed by the other developer in the same team: PhraewaS and guluJa review each other's changes. Cross-team accounts do not substitute for that course gate, even if GitHub grants Write access. Cross-team UAT begins in Lab 6 on an actual released version: the other group executes the linked cases, records the release/commit and results, raises defect Issues, and retests the relevant released version after fixes. Existing cross-team code approvals are additional historical feedback, not completed UAT. No UAT result is claimed now.

After reviewed staging integration and acceptance for this item's scope, record the merge and close its Issue/move it to Done. Manual Development linking does not replace acceptance evidence. Follow the remaining dependent PRs in order; [Issue #6](https://github.com/PhraewaS/event-system/issues/6) tracks full sprint integration and a separately reviewed release PR from staging to `main`. No release is accepted yet.

The original implementation branch `feat/sprint-1` and superseded PR #10 preserve the earlier history. This series reconstructs bounded review units from that implementation; it does not invent an earlier issue-first/TDD sequence. Follow the official [issue linking](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue) and [protected branch review](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) guidance.


## Local containers and delivery

Docker Compose uses PostgreSQL 17 with a named event-data volume. A healthy database precedes migration; app starts only after migration succeeds. Set a random SESSION_SECRET in the ignored .env and optionally a URL-safe POSTGRES_PASSWORD (it is interpolated into the local connection URL). Then run:

~~~sh
docker compose up --build
~~~

Open http://localhost:3000. No accounts are seeded automatically. In another terminal seed only the local Compose database:

~~~sh
docker compose exec -e "DEMO_PASSWORD=Gather-demo-2026!" app node dist/server/seed.js
~~~

Local Compose uses HTTP/development cookie mode; the runtime image defaults to production for HTTPS deployments. Production rejects demo seeding. docker compose down preserves the named database volume. Hosted CI validates Compose configuration and builds the image. Docker is unavailable on the implementation machine; container startup/restart/persistence execution remains Lab 5 Issue #7, with GCP delivery. Image/config checks do not establish runtime execution.

Feature/bug Issue forms and the PR template require stable AC/test traceability, full criteria in descriptions and same-team review. They become repository defaults after the reviewed release is merged into main. Final release review, actual merge/tag and released-version UAT are separate acceptance events.
