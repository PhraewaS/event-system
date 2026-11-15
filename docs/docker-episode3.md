# Episode 3 — local Docker verification

Part of [Lab 5 Issue #7](https://github.com/PhraewaS/event-system/issues/7). The handout's Issue #3 is an example; repository Issue #3 is already accepted registration work. This follow-up targets `sprint1-staging` from `build/3-docker`.

## Adaptation to Gather

Episode 2 was merged through PR #39. The existing root `Dockerfile`, `compose.yaml` and `.dockerignore` already implement Gather's container layout, so this follow-up records runtime verification rather than copying TokTickIT's seven files over working configuration.

| Service/file | Gather behavior |
| --- | --- |
| `db` | PostgreSQL 17; named `event-data` volume mounted at `/var/lib/postgresql/data`. No host database port is published. |
| `migrate` | Builds the root image and runs `node dist/server/migrate.js` once after the database is healthy. Success is `Exited (0)`. |
| `app` | Starts only after migration succeeds. Express serves the API and built React application together, listening on `0.0.0.0:8080`; Compose maps host port 3000 to 8080. |
| Root `Dockerfile` | Node 24 multi-stage build, production runtime dependencies, compiled server/client and SQL migrations; runs as user `node`. The same image can run explicit migration/seed jobs. |
| `.dockerignore` | Excludes local `.env` files, dependencies, build outputs and local credential/tool directories. |

Separate `server/Dockerfile`, entrypoint, `client/Dockerfile` and nginx configuration are unnecessary for this combined application image. No separate web service or port 5173 is needed in Compose. Demo seeding remains an explicit local command; it is not part of migration or normal startup.

## Reproduce on Windows PowerShell

Run from the repository root. Docker Desktop must be running in Linux-container mode. If Docker was just installed and `docker` is not found, open a new terminal. For a per-user installation, this session-only PATH update also works when that directory exists:

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;" + $env:Path
docker version
docker compose version
```

Create the ignored root `.env` from `.env.example` if needed. Replace `SESSION_SECRET` with at least 32 random characters, and set your own `DEMO_PASSWORD` of 12–256 characters. Do not overwrite an existing valid environment. Optional `POSTGRES_PASSWORD` must be URL-safe because Compose inserts it into its internal database URL; its fallback is synthetic and local-only. The host's `DATABASE_URL` is not used for the Compose services: they connect to `db:5432` using the configuration in `compose.yaml`.

```powershell
docker compose config --quiet
docker compose up --build -d
docker compose ps -a
curl.exe --fail http://localhost:3000/api/health
curl.exe --fail http://localhost:3000/api/ready
npm run smoke -- http://localhost:3000
```

Expect `db` running/healthy, `app` running and `migrate` exited with code 0. The smoke command requires host Node.js; the application itself runs in Docker.

The app starts without demo users. This command passes only `DEMO_PASSWORD` from the ignored `.env` into an explicit local seed process, without displaying it or putting its value in process arguments:

```powershell
node --input-type=module -e 'import "dotenv/config"; import {execFileSync} from "node:child_process"; if (!process.env.DEMO_PASSWORD) throw new Error("Set DEMO_PASSWORD in .env"); execFileSync("docker", ["compose", "exec", "-T", "-e", "DEMO_PASSWORD", "app", "node", "dist/server/seed.js"], {stdio:"inherit"});'
```

This helper requires the host dependencies (`npm ci`). Alternatively, set `DEMO_PASSWORD` privately in the terminal environment and run `docker compose exec -e DEMO_PASSWORD app node dist/server/seed.js`. Seed reruns preserve existing passwords and records; changing the environment does not change existing account passwords.

Open `http://localhost:3000`, sign in as `organizer@example.test` with your chosen demo password, and publish a future event. Sign out, sign in as `participant@example.test`, reserve a place and confirm it in My registrations. The owning organizer should see the participant in the roster.

```powershell
docker compose down
docker compose up -d
docker compose ps -a
curl.exe --fail http://localhost:3000/api/health
curl.exe --fail http://localhost:3000/api/ready
npm run smoke -- http://localhost:3000
```

Sign in again and confirm the same event, registration and owner roster. Keep the named volume: `docker compose down -v` deliberately deletes this local database. On failure, inspect `docker compose logs migrate` and `docker compose logs app` privately before publishing redacted output.

## Actual execution — 15 November 2026

The assistant operated Docker Desktop's Linux amd64 engine from Windows. Docker Engine 29.9.3 / Compose 5.7.0 built the unmodified application/configuration at commit `a9404bef39dc0f1a1353ed161247d9556840cfd2`. The source working tree was clean at build time. This PR adds documentation and redacted evidence only.

| Check | Observed result |
| --- | --- |
| Configuration and build/start | Both commands exited 0. Database healthy, app running, migration job exited 0. |
| Runtime image | Linux amd64, user `node` / UID 1000. Compiled server, migration/seed entry points, built HTML, SQL migrations and `pg` dependency present. No `.env` file; no database/session/demo secret configured in the image metadata. |
| Health/readiness | Both returned HTTP 200 with the expected database-connected response before and after recreation. |
| Built UI smoke | Readiness, HTML and same-origin JavaScript asset checks passed before and after recreation. |
| Browser creation journey | Real organizer login, publish HTTP 201, participant login, registration HTTP 201, saved participant view and owner roster passed. No API stubs or direct SQL fixture insertion were used. |
| Container recreation | `down` then `up -d` succeeded without deleting the volume. All three container IDs changed; the named database volume remained `event-system_event-data`. |
| SQL persistence | Identical event ID, title, capacity, registration ID and participant ID before/after. Both numbered migrations remained recorded. |
| Fresh browser sessions after recreation | Participant and organizer signed in again. The same registration ID/event was returned by the API and visible in My registrations; owner roster showed one participant, one remaining place, capacity two. |

The browser and database observations were captured around **21:26 Asia/Bangkok** (14:26 UTC). The [machine-readable record](../evidence/docker/episode3-local-2026-11-15.json) includes exact timestamps, build-input hashes, local image ID, container states/IDs, retained row and browser results. Post-restart screenshots show the [participant view](../evidence/docker/episode3-after-participant-2026-11-15.png) and [owner roster](../evidence/docker/episode3-after-organizer-2026-11-15.png). Only synthetic demo identities are included; secrets and session cookies are omitted.

These are operator-invoked Docker/browser checks, separate from the existing 47-test and 12-browser regression suites. No application or test implementation changed; those suites were not rerun locally for this evidence-only follow-up. Initial sandbox restrictions prevented Docker access and Chromium launch; the actual checks above passed after granting process/engine access, without changing the application.

## Review and remaining work

The scoped Episode 3 runtime checks passed. Independent teammate review and staging integration remain pending. Issue #7 stays open for its broader approved GCP pipeline, Cloud SQL/Secret Manager/IAM, actual deployment, rollback and deployed journey/persistence evidence. A local image ID is not an Artifact Registry push or deployed revision. Local HTTP uses development cookies; production HTTPS and Secure cookies remain deployment checks. Existing release/CI/reviewer records retain their original source and results.
