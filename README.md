# Gather — Event registration (Sprint 1)

Gather is a React → Express → PostgreSQL event registration app. Organizers publish capacity-limited events and inspect owned rosters; Participants reserve places and view private registrations. Current verification: 43 unit/API/DB/client tests and 12 desktop/mobile browser cases.

The [engineering baseline](docs/sprint-1.md) combines the SRS, feature inventory/traceability, System and feature SDS, AC and STS. The accepted application release is [v0.1.0](https://github.com/PhraewaS/event-system/releases/tag/v0.1.0) at main `7532716bbe96b8d7d9cea33b3b063ba16bf746d2`, published on 10 November 2026 after guluJa reviewed, approved and merged [release PR #29](https://github.com/PhraewaS/event-system/pull/29). [Issue #6](https://github.com/PhraewaS/event-system/issues/6) and the original Sprint 1 milestone are closed/Done. The documentation correction tracked in [Issue #30](https://github.com/PhraewaS/event-system/issues/30) supplements that accepted release; it does not change its tag, original source archive or evidence.

## Accepted release and evidence

| Record | Exact source / actual result | Evidence |
| --- | --- | --- |
| Accepted main / tag | `v0.1.0` → `7532716bbe96b8d7d9cea33b3b063ba16bf746d2`; 59 tracked source hashes match | [Release](https://github.com/PhraewaS/event-system/releases/tag/v0.1.0), [acceptance record](https://github.com/PhraewaS/event-system/issues/6) |
| Actual main push CI | Production build, 43/43 tests, 12/12 desktop/mobile browser cases; zero failures/skips/retries; Compose config and Docker image build passed | [Main CI](https://github.com/PhraewaS/event-system/actions/runs/42829070132/job/129873990822) |
| Corrected staging | `6db75f1544dd648b1818bbcf876f2b9b3daf9490`; local build/43 tests/12 browser and hosted checks passed before release review | [Staging CI](https://github.com/PhraewaS/event-system/actions/runs/42825944757/job/129863142516), [fix acceptance #27](https://github.com/PhraewaS/event-system/issues/27) |
| Independent release review | guluJa approved staging 6db75f1 before merging #29 into main; release CI tested integration with the then-current main | [Actual approval](https://github.com/PhraewaS/event-system/pull/29#pullrequestreview-5842989660), [release CI](https://github.com/PhraewaS/event-system/actions/runs/42826991379/job/129866787385) |

Permanent release assets: [source/review/CI evidence](https://github.com/PhraewaS/event-system/releases/download/v0.1.0/sprint-1-release-evidence.json), [full main CI output](https://github.com/PhraewaS/event-system/releases/download/v0.1.0/sprint-1-main-ci.log), [actual browser results](https://github.com/PhraewaS/event-system/releases/download/v0.1.0/sprint-1-browser-results.json). These results describe the accepted source above. Checks for this later documentation revision are recorded separately in Issue #30 and its linked PR.

## Deliverable 1 documents and three-sprint scope

The existing [combined engineering baseline](docs/sprint-1.md#srs-actors-scope-and-decisions) contains the whole-product SRS, [feature/requirement traceability](docs/sprint-1.md#feature-inventory-and-requirements-traceability), System/feature SDS, AC/STS/DoD and [three-sprint plan](docs/sprint-1.md#three-sprint-plan). The 11 November supplement is tracked in [Issue #34](https://github.com/PhraewaS/event-system/issues/34); its docs PR still requires independent review/integration. Sprint 1 F-01–04 is the accepted v0.1.0 application; Sprint 2 F-05 cancellation/re-registration/capacity and Sprint 3 F-06 check-in/attendance are planned, not implemented. Future rules are proposed decisions to confirm in their feature contracts before coding.

The [29 November checkpoint plan](docs/sprint-1.md#29-november-integrated-checkpoint-and-remaining-work), refined after guluJa's PR #35 review, requires all Sprint 2 work plus a real implemented/tested F-06 owner-check-in/idempotence slice in an integrated main candidate actually deployed on GCP through [Issue #7](https://github.com/PhraewaS/event-system/issues/7), with version/CI and post-deployment journey/persistence evidence. This is the later Deliverable 2 gate; Deliverable 1 still requires deployment design only. Full F-06 reporting and remaining verification have bounded targets before 13 December. All are plans, not current feature/deployment completion.

The supplied Deliverable 1 rubric requires **one self-contained PDF with complete Parts A–E and selected execution/process evidence in Part F**, A–F page navigation, both students' names/IDs, contributor/AI-use disclosure and the immutable release reference. GitHub/ZIP links do not replace PDF contents. See [evidence/submission preparation](docs/sprint-1.md#deliverable-1-evidence-and-submission-preparation) for the actual AC/test-file mapping, test excerpts, reviewed workflow samples, verified contributor roles and outstanding PDF/identity confirmation. This docs follow-up does not claim PDF assembly/LEB2 submission or change v0.1.0.

## Local setup for this branch

Use Node 24 and PostgreSQL 15+. React/TypeScript/Vite → Express API → persistent PostgreSQL follows the lab stack. Versioned SQL and `pg` make database constraints and transactions explicit.

1. Clone [this repository](https://github.com/PhraewaS/event-system). Use `git checkout v0.1.0` to reproduce the accepted application, or `main` for accepted main history. `sprint1-staging` holds subsequent integration work. This documentation revision is tracked separately in Issue #30 and is not retroactively included in the v0.1.0 archive.
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

The cumulative suite contains **43 unit/API/database/client tests**. The **12 browser cases** comprise UI-REVIEW-01–04 at desktop 1440×1000/mobile 390×844 (eight cases) plus INT-UI-01/02 at both sizes (four cases), with zero configured retries. They run the built UI against the real API/disposable PostgreSQL database. Only UI-REVIEW-04 explicitly injects list responses for loading/empty/503 states; its session-expiry/re-login scenario uses a real stored session and the in-app link without reload. See the [UI contract and mapping](docs/sprint-1.md#ui-review-contract--issue-12--pr-19) and [verification contract](docs/sprint-1.md#verification-review-contract--issue-13--pr-20).

INT-UI-01 checks two actual Participant sessions competing for the last place: 201/409 API outcomes, the sole saved SQL row, persistent winner view, loser error/disabled state and owner roster must agree. INT-UI-02 uses 201 real owned-event fixtures plus foreign events and observes actual offset 0/200 responses. The old six-case `sprint1.spec.ts` is superseded by the accepted suites; original domain/security assertions and default timeout/retry settings are retained. The [organizer baseline](evidence/sprint-1/organizer-integration-baseline-2026-11-02.json), [CSRF RED](evidence/sprint-1/csrf-red.txt)/[GREEN](evidence/sprint-1/csrf-green.txt) and [expiry RED](evidence/sprint-1/ui-expiry-red-2026-11-04.json) remain source-specific historical evidence.

[Actual staging revalidation](evidence/sprint-1/staging-ui-revalidation-2026-11-06.json) records build/43 tests/eight browser cases at merged UI source `484027e`, before accepting UI Issues #12/#22/#23. The older `tdd-red.txt`, `test-results.txt`, `browser-results.txt` and `source-manifest.json` in evidence/sprint-1 retain their original implementation identities/counts; they are historical evidence, not current-source execution. Current accepted main results and source hashes are linked in the release/evidence index above; PR #20 / Issue #13 retain their earlier verification results.

### Execution records by source and runner

The release/evidence index above records current accepted results. The following are **historical, separate runs of d04ed58**; they are not a combined success claim or substitutes for the accepted main run:

| Execution | Unit/API tests and build | Browser outcome / limits | Evidence |
| --- | --- | --- | --- |
| Assistant, Final staging on 9 November | Build and 43 tests passed | Full default suite: 12/12 passed, zero retries | Issue #6 source/log hashes; staging/release CI links below |
| guluJa local release review | Build and 43 tests reported passed | Default full run: 8 passes and 4 timeouts at 30 seconds; focused rerun of two Desktop journeys with 120 seconds passed unchanged assertions. This is not a full local 12/12 pass. | [Reviewer report](https://github.com/PhraewaS/event-system/pull/24#pullrequestreview-5826613204) |
| Hosted CI at d04ed58 | Build and 43 tests passed; Compose config and image build passed | Full suite: 12/12 passed | [Staging CI](https://github.com/PhraewaS/event-system/actions/runs/42618680936), [Release CI](https://github.com/PhraewaS/event-system/actions/runs/42618689044) |

[First main CI at 0fb7e11](https://github.com/PhraewaS/event-system/actions/runs/42819320782) remains historical RED: build/43 tests passed, browser 11/12, Docker checks skipped. The trace showed Logout interrupted by Login navigation and a stale signed-in UI check. [Issue #27](https://github.com/PhraewaS/event-system/issues/27) / [PR #28](https://github.com/PhraewaS/event-system/pull/28) are accepted/Done after actual guluJa approval, staging merge and integrated checks. [Release #29](https://github.com/PhraewaS/event-system/pull/29) then brought the reviewed fix into accepted main `7532716`; its main CI passed 43/43 tests and 12/12 browser cases. Original assertions, default budgets, failed execution and historical reviewer-timeout results are preserved.

Tests intentionally clear only `TEST_DATABASE_URL`, whose database name must end in `_test`. Use a separate disposable database and run database/browser suites sequentially. Build before running browser tests. Generated local logs/manifests are under ignored `artifacts/`; hosted CI artifacts identify the submitted head. Required CI builds the application, runs the tests available on this branch, builds the Docker image and uploads evidence. Compose configuration is already included through accepted PR #21. Actual container startup/restart/persistence execution and completed GCP delivery remain Lab 5 Issue #7 gates.

## Repository branches and release archives

The repository homepage displays its selected branch. The accepted main release includes README, client, server, tests, docs/evidence, scripts, migrations/seed, .github workflow/templates, Dockerfile, compose.yaml and package/configuration examples. Local .env, node_modules, dist, artifacts, .local and Windows desktop.ini stay ignored. A release archive contains files at its tag: later documentation changes on another branch do not update the original v0.1.0 archive. Use Issue #30 and its linked PR to identify the supplementary documentation revision; promoting it to main or a new tagged archive follows separate review. See [GitHub release/archive semantics](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).

## Review and integration workflow

Verification PR #20 / Issue #13, delivery PR #21 / Issue #5, README correction #26 / Issue #25 and synchronization fix #28 / Issue #27 are accepted/Done. guluJa separately approved release #29 at 6db75f1 before merging into main `7532716` on 10 November 2026. Main checks and release/tag evidence are recorded in closed Issue #6. Initial release #24 and its failed first main check retain their history; they were resolved through reviewed follow-up #29. Earlier foundation/authentication process deviations remain recorded.

The [Kanban](https://github.com/users/PhraewaS/projects/3/views/2) tracks Issues and their linked PRs. New work starts with an Issue/contract, then a feature/fix/docs branch from current staging and a PR into staging. Ready work uses PR Review; findings use Fixing; Done requires actual review, merge and scoped integration evidence. Both main and staging require one independent teammate approval, stale-approval dismissal, passing strict `build-and-test`, resolved conversations and admin enforcement. The owner-authorized last-push option is false on both branches; force pushes/deletions remain disabled. Use Reviewers for the teammate request, not Assignees. Review must identify actual checks/findings; authors cannot approve their own PRs.

PR review is performed by the other developer in the same team: PhraewaS and guluJa review each other's changes. Cross-team accounts do not substitute for that course gate, even if GitHub grants Write access. Cross-team UAT begins in Lab 6 on an actual released version: the other group executes the linked cases, records the release/commit and results, raises defect Issues, and retests the relevant released version after fixes. Existing cross-team code approvals are additional historical feedback, not completed UAT. No UAT result is claimed now.

After a reviewed staging merge, record scoped integration evidence before closing that work item. The documentation correction in Issue #30 follows this workflow and does not reopen accepted product Issue #6 or move v0.1.0. A subsequent main update/new release needs its own reviewed promotion. Release acceptance and released-version UAT are distinct events.

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

Feature/bug Issue forms and the PR template are present on accepted main and require stable AC/test traceability, full criteria in PR descriptions and same-team review. Actual local Compose startup/restart/persistence, completed GCP delivery and released-version UAT retain their separate Lab 5/6 evidence gates.

## Recorded process and assessment limits

- PR #14/#15 retain missing pre-merge same-team reviews and later retrospective checks in [foundation Issue #11](https://github.com/PhraewaS/event-system/issues/11) and [authentication Issue #1](https://github.com/PhraewaS/event-system/issues/1). Retrospective acceptance does not recreate pre-merge review.
- Git was initialized after the initial red/green cycle; original failing output is retained, but no earlier test commit/Issue/PR history is invented. The reconstructed review series does not create a new historical TDD sequence.
- Target: **8 November 2026**. Actual v0.1.0 release publication: **10 November 2026, 14:00:37 UTC**. Repository release/milestone acceptance does not prove an actual submission time or determine how the course assesses that timing. Dates are not backdated.
- Docker image/config checks passed in hosted CI; actual local Compose startup/restart/persistence and GCP remain [Lab 5 #7](https://github.com/PhraewaS/event-system/issues/7). Released-version cross-team UAT is Lab 6. Cancellation/capacity editing (#8) and check-in/attendance (#9) remain later scope.

See the engineering baseline for original contracts, source-specific review/provenance records and the current acceptance index. This documentation correction adds no product feature, test assertion, timeout/retry change or new evidence for the original tag.
