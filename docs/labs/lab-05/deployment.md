# Lab 5 deployment and CI procedure

This guide covers local reproduction, the first GCP deployment, and the reviewed
release and persistence checks. The team verified C-01 through C-06 in
[#43](https://github.com/PhraewaS/event-system/issues/43),
[#44](https://github.com/PhraewaS/event-system/issues/44),
[#45](https://github.com/PhraewaS/event-system/issues/45),
[#46](https://github.com/PhraewaS/event-system/issues/46),
[#47](https://github.com/PhraewaS/event-system/issues/47), and
[#48](https://github.com/PhraewaS/event-system/issues/48). The last release
verified for the Lab 5 submission is recorded below. Track review of the final
documents and the LEB2 submission receipt in
[#49](https://github.com/PhraewaS/event-system/issues/49).

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
| DATABASE_URL | API, migration and seed PostgreSQL connection | Yes | Private local environment; deployed `gather-database-url` Secret Manager reference |
| SESSION_SECRET | Stable signing secret shared by app instances | Yes | Generate at least 32 random characters; deployed `gather-session-secret` reference |
| PORT | Listener; app binds 0.0.0.0 | No | Local setting or Cloud Run-provided port |
| NODE_ENV | Development/test/production behavior | No | Execution environment; production for deployed web |
| DB_POOL_MAX | Connections per process, integer 1–100; default 10 | No | Set against actual database/instance budget before cloud use |
| DEMO_PASSWORD | Local-only synthetic seed shortcut | Yes | Private ignored `.env`; not for production UAT |
| DEMO_PASSWORDS_JSON | Explicit production seed/reset only; four distinct account passphrases, 15–256 characters each | Yes | `gather-demo-password` Secret Manager version, JSON keys `organizer`, `organizer2`, `participant`, `participant2` |
| ALLOW_DEMO_SEED | Explicit production seed opt-in; otherwise false | No | Separate seed job only; absent on web service |
| ALLOW_DEMO_PASSWORD_RESET | Explicit production password reset opt-in; otherwise false | No | `true` on the dedicated reset job only; keep unset on the web service |
| TEST_DATABASE_URL | Dedicated disposable database ending in _test | Yes | Private test environment or synthetic CI service URL |
| POSTGRES_PASSWORD | Local Compose database password | Yes | Private ignored environment; URL-safe for interpolation |

The client reads no environment variables and calls the API on the same origin.
Never copy server settings into VITE variables. Local tests may use one
synthetic `DEMO_PASSWORD`. Production UAT seed/reset jobs require separate
passphrases in `DEMO_PASSWORDS_JSON` for all four seeded identities:
`organizer@example.test`, `organizer2@example.test`, `participant@example.test`
and `participant2@example.test`. Seed reruns preserve existing accounts/passwords
and records; changing the Secret does not rotate an existing account hash.

### Reset the four C-05 demo accounts

The production `gather-demo-password` secret must contain a JSON object with
exactly four distinct values (`organizer`, `organizer2`, `participant`,
`participant2`), each at least 15
characters. For an existing deployment, add this as a new Secret Manager
version; do not overwrite or print the previous value. After the reviewed image
containing `reset-demo-passwords.js` is available, run
`deploy/reset-demo-passwords.sh` with the verified project, region, image digest
and numeric Secret version. The script sets `ALLOW_DEMO_PASSWORD_RESET=true`
only on the dedicated reset job. The job ensures the four fixed demo identities
exist, updates only their password hashes in one database transaction and
invalidates their sessions. It does not seed sample events or alter existing
profile fields.
Ordinary `seed.js` runs remain non-destructive. Disable the old shared-password
Secret version after the reset and verify all four accounts can sign in. Never put
the passphrases in Git, issue comments, workflow logs or deployment docs.

### Deployment workflow and job settings

These inputs are non-secret. The application variables above apply to the web
service, local environment, or the indicated jobs. GitHub environment settings
apply only to `Deploy demo`.

| Variable | Purpose / scope | Value source |
| --- | --- | --- |
| `GCP_PROJECT_ID` / `PROJECT_ID` | GCP project for build and deployment | `cpe334-omega-3` in GitHub `demo` or `PROJECT_ID` in Cloud Shell. Setup defaults to the active `gcloud` project |
| `GCP_REGION` / `REGION` | GCP resource location | `asia-southeast1` in GitHub `demo` or `REGION` in Cloud Shell. Same default in the setup scripts |
| `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT` | Keyless Actions authentication | GitHub `demo` variables described in Episode 6 |
| `SERVICE_NAME`, `MIGRATE_JOB_NAME` | Cloud Run release targets | Workflow and script defaults `gather` and `gather-migrate` |
| `DRY_RUN` | Print the setup or teardown plan | Set to `1` in the shell environment for preview |
| `IMAGE_TAG` | Full 40-character SHA identifying an image | Main push SHA or approved `image_tag` workflow input |
| `ROLLBACK`, `EXPECTED_IMAGE_DIGEST` | Reuse an existing image and require the approved digest | Manual workflow dispatch and its `image_digest` input |
| `IMAGE_DIGEST`, `DEMO_SECRET_VERSION` | Pin the image and Secret Manager version for the dedicated reset job | The reviewed image digest and numeric secret version, entered by the operator |
| `GITHUB_ENV`, `GITHUB_STEP_SUMMARY` | Pass outputs between steps and write the release summary | GitHub Actions runner. The script exports `SERVICE_URL` and `DEPLOYED_IMAGE` for smoke checks and release identity |

## Build, test and local runtime commands

Node 24 and a separate disposable PostgreSQL test database are required for host
tests. Tests clear only the guarded *_test database.

```sh
npm ci
npm run db:migrate
# For local-only seed operations, set DEMO_PASSWORD privately in `.env`.
npm run db:seed
npm run build
npm test -- --reporter=verbose
npx playwright install chromium
npm run test:e2e
```

Run the built app with `npm start` and the configured `PORT` (3000 by default).
For the container path, run these commands from a separate shell after creating
the ignored `.env` from `.env.example`:

```sh
docker compose --env-file .env config --quiet
docker compose --env-file .env up --build -d
docker compose --env-file .env ps -a
node scripts/smoke.mjs http://localhost:3000
```

For Docker, migration runs in the separate `migrate` service; demo seeding is an
explicit command described in the existing Docker procedure. Use `docker compose
down` to retain its named database volume; do not add `-v` when proving data
survival.

### C-03 on the submitted commit

On 22 November 2026, the team tested fresh clone `c7e5a27` with a new `.env`
created from `.env.example` and an empty Compose volume. The isolated project
`lab5-submit-c7e5a27` bound the app to `127.0.0.1:33049` through a port-only
override. Configuration validation and `docker compose build --no-cache`
passed. PostgreSQL was healthy, the migration service exited 0, and
`node scripts/smoke.mjs http://127.0.0.1:33049` verified database readiness,
the built page, and its JavaScript asset.

The browser test published an event, registered a participant, and verified
the owner's roster. After Compose recreated the containers with the same
volume, PostgreSQL returned the original registration and both browser views
still showed it. The [C-03 execution record](https://github.com/PhraewaS/event-system/issues/49#issuecomment-7068414969)
lists the commands and the matching event and registration IDs before and
after recreation.

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

The existing branch protection requires **build-and-test** on both `main` and
`sprint1-staging`. The Episode 6 `protect-main` ruleset also requires
**test-and-docker** on `main`. The C-02 demonstration below records what
GitHub showed when both checks failed.

## Evidence index — version-specific results

| Check | Tested source / evidence | Result / limit |
| --- | --- | --- |
| C-01 existing readiness PR | [PR #39 CI](https://github.com/PhraewaS/event-system/actions/runs/43720996070/job/132832737171), submitted head 1261c11 | Build, 47 tests, 12 browser cases, Compose and Docker passed |
| C-01 existing Docker PR | [PR #40 CI](https://github.com/PhraewaS/event-system/actions/runs/43724811202/job/132844340937), submitted head 14e6a27 | Same regression/config/image checks passed |
| Integrated staging | [push CI](https://github.com/PhraewaS/event-system/actions/runs/44298279587/job/134780937962), c2fd354 | Build, 47 tests, 12 browser cases, Compose and Docker passed |
| C-03 historical staging run | [Isolated fresh clone at `c2fd354`](https://github.com/PhraewaS/event-system/issues/43#issuecomment-6978931016) | Docker build, database, browser, and recreation checks passed |
| C-03 fresh clone of the submitted source | [Execution record at `c7e5a27`](https://github.com/PhraewaS/event-system/issues/49#issuecomment-7068414969) | No-cache build, migration, smoke, browser workflow, and registration persistence after container recreation passed |
| C-01 reusable CI on a normal PR | [PR #50 CI](https://github.com/PhraewaS/event-system/actions/runs/44361853356), head `6610870` | Both CI jobs passed. The suite ran 47 application tests, 12 browser cases, offline regressions, Compose validation and Docker build. [Staging-to-main integration](https://github.com/PhraewaS/event-system/issues/44#issuecomment-7005924561) |
| Historical main release | [PR #29 CI](https://github.com/PhraewaS/event-system/actions/runs/42826991379/job/129866787385) | Historical 43-test/12-browser result; not a new 47-test run or GCP deployment |

The workflow uploads `lab5-ci-evidence`; its source manifest and browser results
identify the tested source. Keep new-head CI distinct from older successful
runs. Starter Kit offline checks are extra script checks, not part of the
47 application tests or 12 existing browser cases.

The PR #50 review follow-up adds fail-closed Secret Manager inventory checks,
JavaScript response MIME validation and truthful teardown failure summaries.
Reproduce its offline regression suite using the commands in
[deploy/README.md](../../../deploy/README.md): 14 deployment/preview scenarios,
5 teardown scenarios, 5 release scenarios and 12 Python smoke tests. These use
local stubs/mocked HTTP only. The revision and hosted result in the C-01 row
above supersede the earlier `40490e9` run for release acceptance.

## Episode 5 — actual first deployment, 19 November 2026

[Operator evidence](https://github.com/PhraewaS/event-system/issues/45#issuecomment-7009398933)
and [guluJa's review](https://github.com/PhraewaS/event-system/issues/45#issuecomment-7009707756)
record the actual execution. Approval of the `--demo` plan is recorded
[separately](https://github.com/PhraewaS/event-system/issues/45#issuecomment-7008337324).
These results identify the deployed application source, not the later parser
fix/documentation commit. No redeployment is implied by this document update.

| Identity | Verified value |
| --- | --- |
| Application source | `4a7819b7b6107b8ae3ea88284c58dd18e1812136`, clean tracked main checkout in Cloud Shell |
| Project / region | `cpe334-omega-3` / `asia-southeast1` |
| Cloud Build | [e1e6835a-7099-46c3-a43e-c861a2ced1e5](https://console.cloud.google.com/cloud-build/builds/e1e6835a-7099-46c3-a43e-c861a2ced1e5?project=297614851283), SUCCESS, 12:31:19–12:32:23 UTC |
| Image | `asia-southeast1-docker.pkg.dev/cpe334-omega-3/gather/gather@sha256:1aa3fc321eb7b581e8f14e41989f6b4b2e6fb7396be28469765a87d9f9bcccec` |
| Cloud Run | `gather`, revision `gather-00001-5s8`, Ready=True, 100% traffic; runtime digest matched the build |
| Public URL | https://gather-75thi3dqbq-as.a.run.app |
| Cloud SQL | `gather-pg`, POSTGRES_17, db-f1-micro, 10 GB SSD, RUNNABLE |
| Database / user / connection | `gather` / `gather` / `cpe334-omega-3:asia-southeast1:gather-pg` |
| Runtime service account | `gather-runner@cpe334-omega-3.iam.gserviceaccount.com` |

### Setup and recovery actually performed

Billing was linked and Free Trial was active before resource creation. The
existing budget alert was checked; it is an alert, not a spending cap. Billing
and budget settings were not changed. Paid resources now exist; no teardown
was performed during this deployment.

After the reviewed dry run, the operator started the initial setup from the
repository root with `PROJECT_ID=cpe334-omega-3`, `REGION=asia-southeast1` and
`bash deploy/deploy.sh --demo` (without `DRY_RUN=1`). The script enabled APIs,
created repository `gather`, the SQL instance/database, runtime identity and
the three app secrets. The runtime received Cloud SQL Client on this project
and Secret Accessor on individual app secrets, not project-wide Secret Accessor.
Generated credentials stayed private in Secret Manager.

This was **not an uninterrupted successful script run**. The first attempt
stopped at newly created runtime identity propagation. After verifying the
identity existed, retrying progressed to a Cloud Build source-read denial.
The actual default build account was the Compute Engine default account, so
the operator applied these scoped build grants:

```sh
gcloud storage buckets add-iam-policy-binding gs://cpe334-omega-3_cloudbuild \
  --member=serviceAccount:297614851283-compute@developer.gserviceaccount.com \
  --role=roles/storage.objectViewer --quiet
gcloud artifacts repositories add-iam-policy-binding gather \
  --location asia-southeast1 --project cpe334-omega-3 \
  --member=serviceAccount:297614851283-compute@developer.gserviceaccount.com \
  --role=roles/artifactregistry.writer --quiet
gcloud projects add-iam-policy-binding cpe334-omega-3 \
  --member=serviceAccount:297614851283-compute@developer.gserviceaccount.com \
  --role=roles/logging.logWriter --condition=None --quiet
```

No Owner, Editor or build-secret access was added. A later full-script retry
stopped safely because `gcloud secrets list --format='value(name)'` returned
short IDs while the original parser expected full resource names. Metadata-only
queries confirmed `gather-database-url`, `gather-session-secret` and
`gather-demo-password`, enabled version `1` of each, and SQL user `gather`.
The operator then resumed the reviewed steps 9–11 manually, without resetting
credentials or changing application source.

The parser fix accepts validated short IDs and full resource names before
normalizing the inventory. Failed listing or any malformed inventory line still
stops before credential changes. Offline rerun tests cover existing full-name
inventories and short-name inventories with and without `--demo`, asserting no password changes, secret
creation or new secret versions. This fix has not been validated by a new live
full-script rerun; the deployed results below are from the original source.

### Build, migrate, seed and serve — executed in order

The following commands reproduce the manual resumed steps, using the resource
identifiers that were already created and verified. They are live commands,
not a preview; review before using them again. `latest` was used for this first
manual deployment; the table above records the immutable digest actually served.

```sh
PROJECT_ID=cpe334-omega-3
REGION=asia-southeast1
IMAGE_URI=asia-southeast1-docker.pkg.dev/cpe334-omega-3/gather/gather:latest
SA_EMAIL=gather-runner@cpe334-omega-3.iam.gserviceaccount.com
SQL_CONN_NAME=cpe334-omega-3:asia-southeast1:gather-pg

gcloud builds submit --tag "$IMAGE_URI" --project "$PROJECT_ID"
gcloud run jobs deploy gather-migrate \
  --image "$IMAGE_URI" --region "$REGION" --service-account "$SA_EMAIL" \
  --set-cloudsql-instances "$SQL_CONN_NAME" \
  --set-secrets DATABASE_URL=gather-database-url:latest \
  --set-env-vars NODE_ENV=production,TZ=Asia/Bangkok,DB_POOL_MAX=3 \
  --command node --args dist/server/migrate.js \
  --max-retries 1 --task-timeout 300s --project "$PROJECT_ID"
gcloud run jobs execute gather-migrate --region "$REGION" --wait --project "$PROJECT_ID"

# Run only after migration succeeds; explicit demo seed, not a routine release.
gcloud run jobs deploy gather-seed \
  --image "$IMAGE_URI" --region "$REGION" --service-account "$SA_EMAIL" \
  --set-cloudsql-instances "$SQL_CONN_NAME" \
  --set-secrets DATABASE_URL=gather-database-url:latest,DEMO_PASSWORDS_JSON=gather-demo-password:latest \
  --set-env-vars NODE_ENV=production,ALLOW_DEMO_SEED=true,DB_POOL_MAX=3 \
  --command node --args dist/server/seed.js \
  --max-retries 0 --task-timeout 300s --project "$PROJECT_ID"
gcloud run jobs execute gather-seed --region "$REGION" --wait --project "$PROJECT_ID"

# Run only after both awaited jobs succeed.
gcloud run deploy gather --image "$IMAGE_URI" --region "$REGION" \
  --platform managed --allow-unauthenticated --service-account "$SA_EMAIL" \
  --add-cloudsql-instances "$SQL_CONN_NAME" \
  --set-secrets DATABASE_URL=gather-database-url:latest,SESSION_SECRET=gather-session-secret:latest \
  --set-env-vars NODE_ENV=production,TZ=Asia/Bangkok,DB_POOL_MAX=3 \
  --min-instances 0 --max-instances 3 --memory 512Mi --cpu 1 --port 8080 \
  --project "$PROJECT_ID"
```

Build exited 0. Migration execution `gather-migrate-l6xpv` completed successfully
at **12:33:26 UTC**; demo seed `gather-seed-rrlqk` completed successfully at
**12:34:26 UTC**. The web revision became ready at **12:34:57 UTC**, after both
jobs. The web environment contains only `NODE_ENV`, `TZ`, `DB_POOL_MAX` and secret
references `DATABASE_URL` / `SESSION_SECRET`. It has neither `ALLOW_DEMO_SEED`
nor `DEMO_PASSWORD`.

### Storage, readiness, smoke and account checks

Storage auto-increase was disabled after the SQL instance became available,
before the resumed deployment, and queried again after web deployment:

```sh
gcloud sql instances patch gather-pg --project cpe334-omega-3 \
  --no-storage-auto-increase --quiet
gcloud sql instances describe gather-pg --project cpe334-omega-3 \
  --format='json(name,state,settings.dataDiskSizeGb,settings.storageAutoResize)'
```

Patch exited 0; final state was RUNNABLE, 10 GB and `storageAutoResize=false`.
Then the operator ran:

```sh
SERVICE_URL="$(gcloud run services describe gather --region asia-southeast1 \
  --project cpe334-omega-3 --format='value(status.url)')"
curl --fail --silent --show-error "$SERVICE_URL/api/health"
curl --fail --silent --show-error "$SERVICE_URL/api/ready"
python3 deploy/smoke_test.py "$SERVICE_URL"
```

Actual results (combined readiness/smoke exit 0):

```text
{"data":{"status":"ok"}}
{"status":"ready","db":"connected"}
PASS /api/health
PASS /api/ready
PASS /
PASS /assets/index-OVSlT5lc.js
PASS /api/events
```

The browser displayed the three seeded public events. A separate operator HTTP
check used cookie jars and CSRF tokens to log in, verify `/api/auth/me` and log
out (HTTP 204) for `organizer@example.test`, `organizer2@example.test`,
`participant@example.test` and `participant2@example.test`; all four passed.
It fetched the existing demo password into process memory and printed only
synthetic account identifiers/results, never credentials or response tokens.
These API session checks were performed during the first deployment.

### Shared Cloud Shell capture

![Cloud Shell verification capture](evidence/2026-11-19/cloud-shell-verification.jpg)

This is the saved **Cloud Shell terminal capture**, showing project, source,
build, revision, public URL, SQL auto-increase setting and check results. It is
not a Cloud SQL/Cloud Run Console overview screenshot or a C-04 screenshot.
The companion [metadata export](evidence/2026-11-19/deployment-metadata.json)
was copied with source SHA-256
`929b1cea1b442f437a1f485b534a6b848e0218f15fc2bc911ffd6326eed2676a`.
Original logs, including failed attempts, remain in Cloud Shell under
`~/event-system/artifacts/episode5-deployment/`. No secret payloads are shared.

### Live C-04 verification

C-04 passed on 20 November 2026 at 14:31 (Asia/Bangkok) on the public Gather
deployment. Cloud Run revision `gather-00001-5s8` served 100% of traffic and
was built from source `4a7819b7b6107b8ae3ea88284c58dd18e1812136`.

- The Organizer signed in and published a synthetic event with capacity 1.
- The Participant signed in and registered. The reservation remained visible
  after reloading, and the owner saw one confirmed registration in the roster.
- A second Participant saw `Fully booked`. The registration API returned
  `409 EVENT_FULL`, and the roster still showed one registration.

The [C-04 evidence in #45](https://github.com/PhraewaS/event-system/issues/45#issuecomment-7033445944)
links four screenshots with their observed browser URLs and the run record.
guluJa verified the [C-04 screenshots and run record](https://github.com/PhraewaS/event-system/issues/45#issuecomment-7033949463)
and the [12 Episode 5.7 Console captures](https://github.com/PhraewaS/event-system/issues/45#issuecomment-7035820963).
Issue #45 was closed as completed on 20 November 2026.

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

## Episode 6 — keyless deployment identity and the C-02 merge gate

The team reviewed the [configuration and C-02 plan](https://github.com/PhraewaS/event-system/issues/46#issuecomment-7040498428)
before applying the settings. [guluJa approved the plan](https://github.com/PhraewaS/event-system/issues/46#issuecomment-7040634579).

### 6.2–6.3 GCP identity and Workload Identity Federation

On 20 November 2026, Cloud Shell readback confirmed that STS and IAM Service
Account Credentials were enabled in `cpe334-omega-3`. The `gather-deployer`
service account had zero user-managed keys and zero roles granted directly at
project level. The service and migration job still used `gather-runner`, and
the ready revision remained `gather-00001-5s8`.

| Resource | Principal | IAM role |
| --- | --- | --- |
| Cloud Run service `gather` | `gather-deployer` | `roles/run.developer` |
| Cloud Run job `gather-migrate` | `gather-deployer` | `roles/run.developer` |
| Artifact Registry repository `gather` in `asia-southeast1` | `gather-deployer` | `roles/artifactregistry.writer` |
| Runtime service account `gather-runner` | `gather-deployer` | `roles/iam.serviceAccountUser` |
| Deployment service account `gather-deployer` | WIF principal set for `attribute.repository_id/1438471476` | `roles/iam.workloadIdentityUser` |

Global pool `github-actions` and provider `github-main` were both `ACTIVE`.
The provider uses issuer `https://token.actions.githubusercontent.com/`, the
default audience, and attribute mappings `google.subject=assertion.sub` and
`attribute.repository_id=assertion.repository_id`. Its condition matched the
approved repository and owner IDs, branch, workflow, immutable subject, and
event:

```cel
assertion.repository_id == '1438471476' &&
assertion.repository_owner_id == '265047184' &&
assertion.ref == 'refs/heads/main' &&
assertion.workflow_ref == 'PhraewaS/event-system/.github/workflows/deploy.yml@refs/heads/main' &&
assertion.sub == 'repo:PhraewaS@265047184/event-system@1438471476:environment:demo' &&
assertion.event_name == 'push'
```

The [WIF and IAM readback in #46](https://github.com/PhraewaS/event-system/issues/46#issuecomment-7040920895)
records the configuration and scope of each binding. The Episode 7 release
below verified token exchange from GitHub Actions and automated deployment.

### 6.4–6.5 GitHub environment and branch protections

GitHub API readback showed that environment `demo` accepts only the branch
`main`. It has four environment variables and zero environment secrets.

| Variable | Verified value |
| --- | --- |
| `GCP_PROJECT_ID` | `cpe334-omega-3` |
| `GCP_REGION` | `asia-southeast1` |
| `WIF_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github-actions/providers/github-main` |
| `WIF_SERVICE_ACCOUNT` | `gather-deployer@cpe334-omega-3.iam.gserviceaccount.com` |

The provider path uses the actual project number in GitHub settings. The
[before/after readback in #46](https://github.com/PhraewaS/event-system/issues/46#issuecomment-7041011222)
confirms the existing protections on `main` and `sprint1-staging` stayed in
place, including strict `build-and-test`, one approval, stale review dismissal,
and resolved conversations. The active [protect-main ruleset](https://github.com/PhraewaS/event-system/rules/27728662)
applies only to `main` and has no bypass actors. It requires an up-to-date
approved PR and the GitHub Actions `test-and-docker` check.

### 6.6 C-02 — failing required check blocks merge

[PR #56](https://github.com/PhraewaS/event-system/pull/56) targeted `main` from
the temporary branch `codex/lab5-c02-prove-gate` at head
`c9769f761675c5b196474fd6a9658a65a16ab87e`. The only change was to expect six
mocked attempts instead of five in `test_network_failure_has_bounded_attempts`.
The 12 offline smoke tests passed locally before the change. The changed suite
reported exactly one failure, `5 != 6`, both locally and in CI.

[PR CI run 44746887772](https://github.com/PhraewaS/event-system/actions/runs/44746887772)
failed at the offline deployment checks in
[`test-and-docker`](https://github.com/PhraewaS/event-system/actions/runs/44746887772/job/136324399433).
The dependent [`build-and-test`](https://github.com/PhraewaS/event-system/actions/runs/44746887772/job/136324685347)
failed as well. The [screenshot and run record in #46](https://github.com/PhraewaS/event-system/issues/46#issuecomment-7041133475)
show both checks as `Required` and failing, and `Merging is blocked`. One
approving review was also outstanding. GitHub reported `mergeable_state=blocked`
before the PR was closed without merging on 20 November 2026.

## Episode 7 — automatic deployment to Cloud Run

[Deploy demo](../../../.github/workflows/deploy.yml) runs on push to `main`.
The reusable [CI workflow](../../../.github/workflows/ci-docker.yml) must
succeed first. The deploy job uses the `demo` environment and WIF as
`gather-deployer`, with the existing Cloud Run service `gather`, migration
job `gather-migrate`, and Artifact Registry repository `gather` in
`asia-southeast1`. Review the four `demo` variables and scoped bindings in
[#46](https://github.com/PhraewaS/event-system/issues/46) before changing the
release configuration.

1. Open a `lab:5` PR into `sprint1-staging` with the related issue reference.
   Have the non-author teammate approve it and verify both CI checks before
   merging. Verify staging push CI for the integrated commit.
2. Open a separate release PR from `sprint1-staging` into `main`. Verify the
   release diff, review and both checks before merging. The merge triggers
   deployment automatically.
3. The deploy job tags the image with the full main commit SHA.
   [`deploy/release.sh`](../../../deploy/release.sh) resolves the tag to a
   digest, updates the migration job, and waits for the execution to succeed
   before updating the service and traffic. A failed migration blocks the
   service update. The normal release path does not run the seed job.
4. Check the deploy log and summary for the SHA, digest, public URL and
   [read-only smoke results](../../../deploy/smoke_test.py). Both Episode 7
   releases recorded `SKIP login` for the optional login smoke.

### First automated release and Console verification

The workflow was approved in [PR #59](https://github.com/PhraewaS/event-system/pull/59)
and released in [PR #60](https://github.com/PhraewaS/event-system/pull/60).
guluJa merged PR #60 after [release CI](https://github.com/PhraewaS/event-system/actions/runs/44765133640)
passed. The [Main CI run](https://github.com/PhraewaS/event-system/actions/runs/44772446053)
and [Deploy demo run](https://github.com/PhraewaS/event-system/actions/runs/44772445764)
passed on `54082e8e667e75188a26a0f58fad6c20bd80e176`.

| Evidence | Verified result |
| --- | --- |
| Artifact Registry tag | `54082e8e667e75188a26a0f58fad6c20bd80e176` |
| Immutable image digest | `sha256:1659c93319cb97c2b9da8e8211bf41f622a3d03ca278dcf05138f9160611e48b` |
| Migration | `gather-migrate-pcxp6` succeeded with exit code 0 before the new service revision was created |
| Cloud Run | `gather-00002-jb7` had `Ready=True`, 100% traffic and the same digest |
| Public URL and smoke | [Gather](https://gather-75thi3dqbq-as.a.run.app/) passed health, database readiness, homepage, JavaScript and events checks, with `SKIP login` |

To identify the running commit, find the revision receiving traffic in
Cloud Run **Revision History**, open its **YAML** tab, and read
`imageDigest`. Match it to the digest and full SHA tag in Artifact Registry
and to the same SHA in the Deploy demo summary. Check the matching Cloud Run
migration execution and its result. The
[Console captures](https://github.com/PhraewaS/event-system/issues/47#issuecomment-7046928898)
and [teammate verification](https://github.com/PhraewaS/event-system/issues/47#issuecomment-7047271504)
record this comparison for the first release.

### C-06 — visible homepage change

PhraewaS opened [PR #61](https://github.com/PhraewaS/event-system/pull/61)
from `codex/episode7-deploy-proof` into `sprint1-staging` and opened
[Release PR #62](https://github.com/PhraewaS/event-system/pull/62) from
`sprint1-staging` into `main`. Both PRs carried the `lab:5` label, and guluJa
approved [the staging change](https://github.com/PhraewaS/event-system/pull/61#pullrequestreview-5997657613)
and [the release](https://github.com/PhraewaS/event-system/pull/62#pullrequestreview-5997911328)
separately. guluJa merged #62 at 02:01:16 on 21 November 2026 (Asia/Bangkok).
The resulting push started Deploy demo automatically.

| Evidence | Observed result |
| --- | --- |
| Main merge SHA and image tag | [`a1f03028e374ddb86b88e9db0734c6e381a380fe`](https://github.com/PhraewaS/event-system/commit/a1f03028e374ddb86b88e9db0734c6e381a380fe) |
| [Release CI](https://github.com/PhraewaS/event-system/actions/runs/44797264583) and [Main CI](https://github.com/PhraewaS/event-system/actions/runs/44798222537) | `test-and-docker` and `build-and-test` passed in both runs |
| [Deploy demo run 44798222919](https://github.com/PhraewaS/event-system/actions/runs/44798222919) | Push to `main` at the merge SHA above. Reusable CI and deploy jobs succeeded |
| Immutable image digest | `sha256:6739745d730d534bd0aa890f9943c0c78b30233f030f1db59e447c7d7dd03557` |
| Migration and serving revision | `gather-migrate-6p2jz` succeeded at 02:04:50 before `gather-00003-q22` began serving 100% of traffic at 02:05:06 (Asia/Bangkok) |
| [Public smoke log](https://github.com/PhraewaS/event-system/actions/runs/44798222919/job/136504377869) | `/api/health`, `/api/ready`, `/`, `/assets/index-CaNBcHcx.js` and `/api/events` passed. The log records `SKIP login` |

The [before screenshot](https://github.com/PhraewaS/event-system/issues/47#issuecomment-7047394622)
shows “Make a little room for what’s next.” on revision `gather-00002-jb7`.
At 02:09 (Asia/Bangkok), the [after screenshot](https://github.com/user-attachments/assets/71de7ca6-6b86-40ed-92a0-8c6c0b561dc1)
shows “Make room for your next campus event.” and the same
[public Gather URL](https://gather-75thi3dqbq-as.a.run.app/).
The [release and image record in #47](https://github.com/PhraewaS/event-system/issues/47#issuecomment-7048316695)
connects the screenshot to the deploy run.
[guluJa’s C-06 verification](https://github.com/PhraewaS/event-system/issues/47#issuecomment-7048464667)
confirms that the before and after captures, migration, serving revision and
smoke results match the reviewed release.

### Release verified for the Lab 5 submission

[Release PR #71](https://github.com/PhraewaS/event-system/pull/71) promoted the
documentation from [PR #70](https://github.com/PhraewaS/event-system/pull/70).
guluJa [approved head `1520f02`](https://github.com/PhraewaS/event-system/pull/71#pullrequestreview-6006415514)
before the merge. The PR records a direct push to sync staging with `main`
using the staging bypass. The sync preserved #70's source tree, and staging
push CI and release PR CI passed. The C-06 change above is the evidence for
the complete feature-PR review path.

| Evidence | Verified result on 21 November 2026 |
| --- | --- |
| Main SHA and image tag | [`c7e5a275e8403406d18ee3f256cc4ff23946d481`](https://github.com/PhraewaS/event-system/commit/c7e5a275e8403406d18ee3f256cc4ff23946d481) |
| [Main CI](https://github.com/PhraewaS/event-system/actions/runs/44922078661) | `test-and-docker` and `build-and-test` passed. [Source and test artifact](https://github.com/PhraewaS/event-system/actions/runs/44922078661/artifacts/14713314712) |
| [Deploy demo](https://github.com/PhraewaS/event-system/actions/runs/44922078616) | Triggered by the push to `main` at the SHA above. `gather-migrate-gv64g` succeeded before the service update. Public health, database readiness, homepage, JavaScript and events passed. Optional login recorded `SKIP login` |
| Image digest | `sha256:5e5960579c7aba7e150296c2c6625423543f4ddea6aa45f5bd2466480b223f5c` |
| Serving revision | [`gather-00010-69h`](https://console.cloud.google.com/run/detail/asia-southeast1/gather/revisions/gather-00010-69h?project=cpe334-omega-3), matching digest, 100% traffic at verification |

[Release record in #49](https://github.com/PhraewaS/event-system/issues/49#issuecomment-7065369867)
links the deploy log and public URL. Keep the public service and repository
accessible until the instructor confirms grading has ended.

## Episode 8 — C-05 cloud persistence

The main release from [PR #66](https://github.com/PhraewaS/event-system/pull/66)
provided the reviewed reset image and deployed revision `gather-00005-f4x`.
The operator ran the dedicated Cloud Run reset job with the same configuration
as [the reset script](../../../deploy/reset-demo-passwords.sh). Execution
`gather-demo-password-reset-sbk4n` used `gather-demo-password` version `3`,
completed successfully at 17:08 ICT on 21 November 2026, and logged that all
four demo passwords rotated and their old sessions were invalidated. The
Participant sign-in was observed during the baseline. The operator separately
confirmed fresh sign-ins for both Organizer accounts and the second
Participant account. [Reset job history](https://console.cloud.google.com/run/jobs/details/asia-southeast1/gather-demo-password-reset/executions?project=cpe334-omega-3)

The baseline used the existing synthetic
[`C05-PERSIST-2026-11-21` event](https://gather-75thi3dqbq-as.a.run.app/events/c75e5db0-9695-40b8-9815-94a6b75ecf36).
After signing in with the new password, the Participant registered through
Gather. The event ID is `c75e5db0-9695-40b8-9815-94a6b75ecf36`. The
registration ID is `644cd4df-b3db-4f7b-b1ad-e50e1aa2d0f3`, created at
`2026-11-21T10:10:53.304Z`. The same registration stayed Confirmed at every
check. [Screenshots and Cloud Logging links in #48](https://github.com/PhraewaS/event-system/issues/48#issuecomment-7061092768)

| Check (21 November 2026, ICT) | Cloud Run evidence | Gather result |
| --- | --- | --- |
| Baseline at 17:10:53 | Revision `gather-00005-f4x`, instance ending `6818b133dce7`, request log `6b016e2d0004cda33087cbbb` | Registration POST returned HTTP 201 and My registrations showed Confirmed |
| Same-revision restart at 17:32:06 | Monitoring showed zero active and idle instances at 17:30. `Starting new instance. Reason: AUTOSCALING` (log `6b01732600019ab670b00e51`) and the follow-up request (log `6b0173270008ca1324afa3f4`) both used the new instance ending `63fd6f7cdc69` on `gather-00005-f4x` | The same signed-in session returned HTTP 200 with the original event ID, registration ID, and creation time |
| After pipeline redeploy at 17:38:18 | Revision `gather-00006-rts` served 100% of traffic, and request log `6b01749a0007bd762c76c17e` confirms it handled the check | The same signed-in session again returned HTTP 200 with the original IDs and creation time |

Both deploy attempts used main SHA
`6b677c5964fee3044c9ab36f3ec22474f153d90c`.
[Attempt 1](https://github.com/PhraewaS/event-system/actions/runs/44883775495/attempts/1)
served digest `sha256:ba7e30c96739aa086d7547852261ed8790aa639038581d4202bcea8fbdd95756`.
[Attempt 2](https://github.com/PhraewaS/event-system/actions/runs/44883775495/attempts/2)
rebuilt the same source and served digest
`sha256:b9e33b641f6c4d5e99516895a67fce5ad1c22b896562c1dd7ecfc56eadc0d254`.
Both CI jobs, migration `gather-migrate-8cxtq`, and the public smoke checks
passed on attempt 2. The workflow skipped optional login smoke. Gather’s
authenticated requests verified the session separately.
[Attempt 2 CI artifact](https://github.com/PhraewaS/event-system/actions/runs/44883775495/artifacts/14703393505)

Cloud SQL PostgreSQL stores events, registrations, and the server-side session
records. Gather checks the signed session cookie with the stable session signing
secret and loads its session from PostgreSQL. The restart and redeploy checks
reused the same login session and read the existing registration without
reseeding or recreating it in Cloud SQL.

Teammate acceptance of C-05 is recorded in
[#48](https://github.com/PhraewaS/event-system/issues/48).

### Digest-verified rollback and roll-forward

Both manual deployments succeeded on 21 November 2026. The workflow
ran from `main` at `44049f53f18ed2ddf2dcc2c1789be14e16a68f41`. Each run
used the specified image tag and digest.

| Check | Deploy demo run | Image tag | Image digest | Cloud Run serving revision |
| --- | --- | --- | --- | --- |
| Rollback to release A | [44916482315](https://github.com/PhraewaS/event-system/actions/runs/44916482315) | `54082e8e667e75188a26a0f58fad6c20bd80e176` | `sha256:1659c93319cb97c2b9da8e8211bf41f622a3d03ca278dcf05138f9160611e48b` | `gather-00008-k4s`, 100% traffic |
| Roll-forward to [release #69](https://github.com/PhraewaS/event-system/pull/69) | [44916630560](https://github.com/PhraewaS/event-system/actions/runs/44916630560) | `44049f53f18ed2ddf2dcc2c1789be14e16a68f41` | `sha256:bc7fa58df55c0044d96ce10a79f4c329520238af548c55705695bc2baf3b126c` | `gather-00009-hxz`, 100% traffic |

The `test` job and **Build and push image** step were skipped in both runs.
The deploy log confirms that the manual image path also skipped migration and
seed. Health, database readiness, homepage, JavaScript, and events smoke
checks passed in both runs. Optional login smoke was skipped. The browser
checks used the original signed-in Participant session.

After rollback, the homepage showed “Make a little room for what’s next.”
Roll-forward restored “Make room for your next campus event.” The same event
and registration IDs and registration creation time from the C-05 baseline
were returned by the authenticated registration API in both rounds. The
registration showed **Confirmed** before rollback, after rollback, and after
roll-forward. File checksum verification is N/A because Gather does not
support event attachments.
[Six comparison screenshots and run logs](https://github.com/PhraewaS/event-system/issues/48#issuecomment-7064545748)
· [Teammate verification](https://github.com/PhraewaS/event-system/issues/48#issuecomment-7064674944)

To repeat the drill, verify the approved older image and the recovery image
in Artifact Registry, then capture the starting revision, visible homepage
copy, and an existing registration from a signed-in session. Run
**Actions → Deploy demo → Run workflow** on `main`, supplying the full
40-character `image_tag` and matching `image_digest`. Verify the digest,
traffic, smoke results, homepage copy, and original registration after each
switch. Use the same workflow with the recovery image to restore service.

The WIF provider accepts both `push` and `workflow_dispatch` with the same
repository, owner, branch, workflow, and `demo` subject restrictions. The
issuer, mapping, and deployer binding match the earlier configuration.
[WIF readback](https://github.com/PhraewaS/event-system/issues/48#issuecomment-7064284452)
· [WIF review](https://github.com/PhraewaS/event-system/issues/48#issuecomment-7064434265)
