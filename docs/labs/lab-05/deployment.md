# Lab 5 deployment and CI procedure

Status: Episode 4 preparation for Issue #44. Actual GCP deployment and a main-only
deployment pipeline remain separate work in #45–#48. This document records the
chosen local stack and reproducible CI procedure; it does not claim cloud
resources or a released/deployed version that has not been verified.

## Stack and accepted starting point

Gather uses React/TypeScript/Vite → Express → PostgreSQL, with one root npm
lockfile. Express serves the API and built frontend from the same image.
Versioned SQL and `pg` replace the example's Prisma commands. Docker runs as
`node` on port 8080; local Compose maps port 3000 and starts database → migration
→ app. See [local Docker procedure](../../docker-episode3.md) and
[readiness audit](../../cloud-run-readiness.md).

PR #39 prepared the application. PR #40 was independently approved and merged
into staging at `c2fd354e616c921d7f888f589631fb9d41a93947`; the fresh isolated-clone
execution is recorded in [Issue #43](https://github.com/PhraewaS/event-system/issues/43).
The original accepted application tag `v0.1.0` keeps its own 43-test history.
The later staging suite contains 47 tests and 12 browser cases.

## Environment inventory

Copy the root `.env.example` to ignored `.env` and fill values privately.
CI uses synthetic values only in its disposable `event_system_test` database.

| Variable | Purpose / scope | Secret? | Value source |
| --- | --- | --- | --- |
| DATABASE_URL | API, migration and seed PostgreSQL connection | Yes | Private local environment; planned deployed database secret |
| SESSION_SECRET | Stable signing secret shared by app instances | Yes | Generate at least 32 random characters; planned Secret Manager |
| PORT | Listener; app binds 0.0.0.0 | No | Local setting or Cloud Run-provided port |
| NODE_ENV | Development/test/production behavior | No | Execution environment; production for deployed web |
| DB_POOL_MAX | Connections per process, integer 1–100; default 10 | No | Set against actual database/instance budget before cloud use |
| DEMO_PASSWORD | Explicit demo seed only, 12–256 characters | Yes | Private local environment or separate seed-job secret |
| ALLOW_DEMO_SEED | Explicit production seed opt-in; otherwise false | No | Separate seed job only; absent on web service |
| TEST_DATABASE_URL | Dedicated disposable database ending in _test | Yes | Private test environment or synthetic CI service URL |
| POSTGRES_PASSWORD | Local Compose database password | Yes | Private ignored environment; URL-safe for interpolation |

The client reads no environment variables and calls the API on the same origin.
Never copy server settings into VITE variables. Seed reruns preserve existing
accounts/passwords and records; changing a seed variable does not rotate an
existing account password.

Deployment scripts also read `PROJECT_ID`, `REGION`, `DRY_RUN`, and release
`IMAGE_TAG` (full 40-character SHA), `ROLLBACK`, optional service/job names and
`GITHUB_ENV`. These are non-secret identifiers/controls. Actual project, region
and resource identifiers must be confirmed from team setup and the approved #45
deployment; they are not inferred from the template defaults.

## Build, test and local runtime commands

Node 24 and a separate disposable PostgreSQL test database are required for host
tests. Tests clear only the guarded *_test database.

```sh
npm ci
npm run db:migrate
# Set DEMO_PASSWORD privately before explicit seeding.
npm run db:seed
npm run build
npm test -- --reporter=verbose
npx playwright install chromium
npm run test:e2e
docker compose --env-file .env.example config --quiet
docker compose up --build -d
docker compose ps -a
node scripts/smoke.mjs http://localhost:3000
```

For Docker, migration runs in the separate `migrate` service; demo seeding is an
explicit command described in the existing Docker procedure. Use `docker compose
down` to retain its named database volume; do not add `-v` when proving data
survival. The fresh-clone evidence in #43 used its own project/volume and a
localhost-only port override, without reusing existing environment secrets.

## CI triggers, jobs and permissions

`.github/workflows/ci-docker.yml` is the single CI entry point. It replaces the
earlier `ci.yml`; historical runs/commits remain intact.

| Trigger / job | Behavior |
| --- | --- |
| pull_request into main or sprint1-staging | Checks feature/fix/docs integration PRs and release PRs |
| push to main or sprint*-staging | Checks the actual integrated source after merge |
| workflow_call | Same checks can be reused by the later deployment workflow |
| workflow_dispatch | Manual checks after this workflow is present on the default branch |
| test-and-docker | Offline deploy tests, root install/migrate/seed/build/tests, desktop/mobile browsers, Compose config, Docker build and source/test artifact |
| build-and-test | Compatibility gate: succeeds only when test-and-docker succeeds, preserving the existing required-check name |

The workflow is named **CI & Docker Build**. Contents permission is read-only;
checkout does not persist credentials. It performs no Google Cloud login,
resource changes, registry push or deployment. Concurrency cancels superseded
runs for the same workflow/ref. A cancelled run is not a passing check.

The existing branch protections require **build-and-test**. They are not changed
by this PR. Episode 6 can additionally select **test-and-docker** after the
reviewed workflow is available, with proof that a deliberately failing temporary
PR cannot merge (C-02). Preserve all current protections and history.

## Evidence index — version-specific results

| Check | Tested source / evidence | Result / limit |
| --- | --- | --- |
| C-01 existing readiness PR | [PR #39 CI](https://github.com/PhraewaS/event-system/actions/runs/43720996070/job/132832737171), submitted head 1261c11 | Build, 47 tests, 12 browser cases, Compose and Docker passed |
| C-01 existing Docker PR | [PR #40 CI](https://github.com/PhraewaS/event-system/actions/runs/43724811202/job/132844340937), submitted head 14e6a27 | Same regression/config/image checks passed |
| Integrated staging | [push CI](https://github.com/PhraewaS/event-system/actions/runs/44298279587/job/134780937962), c2fd354 | Build, 47 tests, 12 browser cases, Compose and Docker passed |
| C-03 fresh clone | [actual execution](https://github.com/PhraewaS/event-system/issues/43#issuecomment-6978931016), c2fd354 | New isolated Docker build/start/DB/browser/recreation checks passed; separate operator run |
| Episode 4 workflow and offline checks | [Issue #44](https://github.com/PhraewaS/event-system/issues/44) links the actual new PR/head/run and separate release PR | Current execution and review status recorded there; no acceptance claimed in advance |
| Historical main release | [PR #29 CI](https://github.com/PhraewaS/event-system/actions/runs/42826991379/job/129866787385) | Historical 43-test/12-browser result; not a new 47-test run or GCP deployment |

The workflow uploads `lab5-ci-evidence`; its source manifest and browser results
identify the tested source. Keep new-head CI distinct from older successful
runs. Starter Kit offline checks are extra script checks, not part of the
47 application tests or 12 existing browser cases.

## Episode 4 integration and release procedure

1. Branch `ci/4-pr-checks` from accepted `sprint1-staging`; open a labelled PR
   into `sprint1-staging`, linked to #44.
2. Verify **test-and-docker** and dependent **build-and-test** on the submitted
   head. Resolve failures on that branch and obtain a specific non-author
   teammate review/approval.
3. Merge through the protected path; record actual staging merge and push CI.
4. Open/promote a separate `sprint1-staging` → `main` release PR containing the
   accepted readiness/Docker/CI increment. The same checks and independent
   release approval are required; a Draft release remains blocked until step 3.
5. Record the actual main merge and main CI before accepting #44/marking Done.
   This release only places reviewed CI/deployment preparation on main.
6. Episode 7 adds real main-only deployment. Then record tag/source SHA ↔
   immutable image ↔ pipeline run ↔ Cloud Run revision/public URL, and the
   procedure to query the currently running commit. No deployed identity exists
   in this Episode 4 evidence alone.

Keep #7 open for the wider lab. C-04 public workflow, C-05 cloud restart/redeploy
persistence and C-06 main-to-cloud pipeline proof remain separate gates.
