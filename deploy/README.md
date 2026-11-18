# Gather deployment scripts — Lab 5 Episodes 4–8

Adapted from `02_lab5-starter-kit.zip` (the supplied TokTickIT Lab 5 Starter Kit).
The complete original `deploy/` folder was imported, then its project assumptions
were changed for Gather: Node 24, PostgreSQL 17, the root Dockerfile, compiled
migration/seed entry points, PostgreSQL sessions and the real Gather API shapes.

## Episode 4: offline checks only

CI runs:

```sh
bash -n deploy/deploy.sh deploy/teardown.sh deploy/release.sh
bash deploy/tests/test_deploy_stub.sh
bash deploy/tests/test_release_stub.sh
python3 -m unittest discover -s deploy/tests -p 'test_smoke.py' -v
```

The shell tests replace `gcloud` and random generation with local stubs. They
exercise first setup, idempotent reruns, missing database credentials, failed
migration, explicit demo seeding and dry-run behavior. Release tests cover normal
release, rollback, missing image, failed migration and an invalid image tag.
The eight Python tests mock HTTP and check Gather's readiness/response contracts,
built UI, empty event lists, external assets, credential URLs and bounded errors.
Local validation can run in a read-only Python container with `--network none`.

None of these checks authenticates to GCP, provisions resources, pushes an image
or deploys the application. Passing stubs validate script behavior, not cloud
permissions, connectivity, pricing or an actual deployment.

## Gather changes from the example

- Resources use the consistent `gather` prefix; PostgreSQL uses `POSTGRES_17`.
- The web service binds to port 8080 and receives `DATABASE_URL` and
  `SESSION_SECRET`; its database pool defaults to the explicitly configured 3.
- The migration job executes `node dist/server/migrate.js` and is awaited before
  service deployment. It does not seed or receive demo credentials.
- `--demo` creates a separate explicit `gather-seed` job running
  `node dist/server/seed.js` with `ALLOW_DEMO_SEED=true` and `DEMO_PASSWORD`.
  These settings are never attached to the web service.
- The PostgreSQL URL uses node-pg's Cloud SQL socket form, with no Prisma query
  parameters. `SESSION_SECRET` replaces TokTickIT's administrator-password flow;
  Gather has no administrator/first-password-change feature.
- The Python smoke client is read-only: health, database readiness, built HTML,
  same-origin UI script and the public events endpoint. It accepts empty events
  and does not require demo accounts or perform login/logout.

## Later episode execution

`deploy.sh` performs initial setup; `release.sh` updates already-provisioned
resources from an image tagged with a full source SHA and resolved by digest.
`teardown.sh` deletes the matching cloud resources and prompts for the project
ID. Review proposed commands, actual project/region, IAM, secret versions,
database/connection budgets and migration compatibility before any live use.

Actual first deployment belongs to Issue #45, identity/required-check proof to
#46 and the main-only release workflow to #47. Episode 4 does not add or run
`.github/workflows/deploy.yml`. Offline results do not close those work items.
