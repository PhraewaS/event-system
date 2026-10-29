# Sprint 1 engineering baseline and feature contracts

Baseline: 29 October 2026. Target: 8 November 2026. This single document combines the required SRS, feature inventory/traceability, System SDS, feature SDS, AC and STS to avoid duplicate documents. The supplied course brief is the product authority. Linked official documentation below supplies technical guidance; it does not define business policy.

## SRS: actors, scope and decisions

Actors: Participant and Organizer, exactly one role per account. No administrator bypass. Seeded accounts suffice. Sprint 1 delivers publish → discover → register → view own registration → owner views roster. Cancellation, capacity editing, check-in and attendance reports belong to later sprints; no UI/API pretends these are available.

Working Sprint 1 decisions (proposed to stakeholder; no contrary instruction received): duplicate requests return 409, including when the event is full; registration closes at an explicit deadline no later than the event start; deadline equality is closed; capacity is immutable after publication in Sprint 1. Later capacity reductions must not fall below active registrations. Later cancellation must release a place and allow re-registration. These future rules are planning, not implemented features.

| ID     | Requirement / measurable rule                                                                              | Feature                   | Sprint |
| ------ | ---------------------------------------------------------------------------------------------------------- | ------------------------- | ------ |
| FR-01  | Login, logout, current identity; seeded Participant/Organizer                                              | F-01 Identity             | 1      |
| FR-02  | Organizer publishes title, description, location, start, deadline and capacity                             | F-02 Publication          | 1      |
| FR-03  | Discover published events and remaining places                                                             | F-03 Registration         | 1      |
| FR-04  | Participant registers and views only their own registrations                                               | F-03 Registration         | 1      |
| FR-05  | Organizer lists own events and each owned event's roster                                                   | F-04 Organizer management | 1      |
| FR-06  | Cancellation and editable capacity                                                                         | F-05 Changes              | Later  |
| FR-07  | Check-in and attendance reports                                                                            | F-06 Attendance           | Later  |
| BR-01  | Capacity is an integer 1–1,000,000; never oversubscribe, even concurrently                                 | F-02/F-03                 | 1      |
| BR-02  | One registration per participant/event; duplicates return 409                                              | F-03                      | 1      |
| BR-03  | Start and deadline are future instants; deadline ≤ start; close at deadline                                | F-02/F-03                 | 1      |
| BR-04  | Server derives identity and event ownership; client cannot assign them                                     | All                       | 1      |
| NFR-01 | Committed users/events/registrations/sessions survive app restart                                          | All                       | 1      |
| NFR-02 | Negative auth, role, ownership, input and concurrent-capacity tests run against real PostgreSQL            | All                       | 1      |
| NFR-03 | Browser UI works at 390px and 1440px without horizontal overflow                                           | All                       | 1      |
| NFR-04 | JSON request body ≤16KiB; list responses bounded to 200 rows per page, with offset/nextOffset continuation | All                       | 1      |

## System-level SDS

React/TypeScript/Vite UI → same-origin Express/TypeScript JSON API → PostgreSQL. Modular monolith: transport/auth in `app.ts`, domain transaction in `registrations.ts`, SQL schema in migrations. This preserves the lab's principal stack. Direct `pg` queries replace Prisma for explicit, small SQL migrations and row-lock transactions; all user input uses bound parameters. Vite proxies `/api` locally; production Express serves the built UI, so credentials need no cross-origin CORS policy. No browser-memory persistence.

Database: `users` (UUID, unique lower-case email, display name, Argon2id hash, constrained role); `events` (UUID, owner FK, title/description/location, positive capacity, timestamptz start/deadline, creation time); `registrations` (UUID, participant FK, event FK, created time, unique participant/event); `session` (library-managed persisted sessions with expiry); `schema_migrations` records migration name and SHA-256. Referential deletes are restricted. CHECK constraints enforce lengths, capacity and deadline ≤ start. Indexes support event rosters and owner lists. No stored capacity counter can drift.

| Action                                 | Anonymous | Participant                | Organizer                         |
| -------------------------------------- | --------- | -------------------------- | --------------------------------- |
| Read published event list/detail       | Yes       | Yes                        | Yes                               |
| Login / CSRF bootstrap                 | Yes       | Yes                        | Yes                               |
| Current identity / logout              | 401       | Own                        | Own                               |
| Publish                                | 401       | 403                        | Yes, own identity assigned        |
| Register                               | 401       | Self                       | 403                               |
| My registrations / single registration | 401       | Own only; other's ID → 404 | 403                               |
| Owned events / roster                  | 401       | 403                        | Own events only; other's ID → 404 |

Identity lifecycle: Argon2id passwords; express-session with PostgreSQL store. Cookie is HttpOnly, SameSite=Lax, Path=/; Secure in production. Eight-hour fixed lifetime. Session ID and CSRF token rotate on successful login; previous session is destroyed. Logout is POST with CSRF protection and destroys server session and cookie. Expired sessions become anonymous; purge expired rows every 15 minutes with the application cleanup job. Server reads role/identity from database on every protected request. No bearer tokens or credentials in localStorage. Synchronizer CSRF token required on all POSTs, including login. Failed login attempts are rate limited (20/IP/15min per API process); TLS terminates at the deployment proxy. Production requires configured DATABASE_URL, random SESSION_SECRET and valid HTTPS proxy setup.

UI: responsive sidebar/nav, discover/search, event detail, sign-in, private registrations, owned events, publish form and roster. Loading/empty/error states; labels, keyboard controls, focus visibility, polite status messages. Datetimes entered in browser local time and sent as ISO UTC; displayed with timezone. Search filters the bounded event list.

## API/data specifications

JSON envelopes: success `{data: object|array}` (lists also include `page:{offset,limit:200,nextOffset}`; `?offset=` selects the next page); errors `{error:{code,message,fields?}}`. UUID path parameters validated; unknown routes 404. Private responses use `Cache-Control: no-store`. Unauthenticated 401, wrong role 403, missing/foreign private resource 404, malformed body/validation 400, conflicting rule 409, CSRF 403. No hashes or session internals are returned.

| Method/path                        | Request                                                               | Response                                                                  |
| ---------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| GET /api/auth/csrf                 | None                                                                  | 200 `{data:{csrfToken}}` + session cookie                                 |
| POST /api/auth/login               | `{email,password}` + X-CSRF-Token                                     | 200 `{data:{user,csrfToken}}`; invalid credentials 401                    |
| GET /api/auth/me                   | Session cookie                                                        | 200 `{data:{id,email,name,role}}`                                         |
| POST /api/auth/logout              | X-CSRF-Token                                                          | 204                                                                       |
| GET /api/events                    | None                                                                  | 200 event summaries with registeredCount/remainingPlaces/registrationOpen |
| GET /api/events/:id                | UUID                                                                  | 200 event detail, including public organizer name                         |
| POST /api/events                   | `{title,description,location,capacity,startsAt,registrationDeadline}` | 201 created event; unknown fields rejected                                |
| POST /api/events/:id/registrations | Empty object, CSRF                                                    | 201 registration; duplicate/full/closed → 409                             |
| GET /api/registrations/mine        | Session                                                               | 200 caller's registrations with event details                             |
| GET /api/registrations/:id         | UUID                                                                  | 200 caller's registration or 404                                          |
| GET /api/organizer/events          | Session                                                               | 200 caller's events with counts                                           |
| GET /api/events/:id/registrations  | Owned event                                                           | 200 roster with participant name/email and registration timestamp         |
| GET /api/health                    | None                                                                  | 200 if database reachable, otherwise 503                                  |

Field limits: title 3–120 trimmed characters, description 10–4000, location 2–200. API datetimes must be ISO instants with timezone offsets, not ambiguous local timestamps. Client cannot set role, organizerId, participantId, status, or registration ID. Publication is immediate; no draft state in Sprint 1.

## Feature-level SDS, acceptance criteria and STS (written before implementation)

F-01 depends on user/session migrations. Bootstrap CSRF → submit credentials → verify hash → regenerate session → retrieve identity → protected requests → logout/expiry. F-02 depends on F-01 and event migration: validate all inputs and role → insert event owned by caller → return visible published record. F-03 depends on F-01/F-02: acquire event row `FOR UPDATE` in one checked-out connection's transaction → check duplicate → database-clock deadline → count → insert → commit; every rejection rolls back. Independent API instances must honor the same row lock. F-04 depends on these records: server filters owner before exposing roster; never trust a caller-supplied user ID. Error and permission behavior is specified in the matrix/API above.

| AC    | Observable acceptance outcome                                | Planned test ID(s), level and inputs → result                                                                                                                                              |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-01 | Correct login gives identity; wrong credentials do not       | T-01 API/DB: seeded valid vs invalid/unknown credentials → 200/401; hash differs from password                                                                                             |
| AC-02 | Session rotates, expires and is revoked at logout            | T-02 API/DB: replay old/logged-out/expired cookie → 401; current cookie survives app recreation                                                                                            |
| AC-03 | Protected requests require authentication/CSRF               | T-03 API/DB: anonymous requests → 401; missing/wrong CSRF on login and authenticated mutations → 403                                                                                       |
| AC-04 | Only Organizer publishes with server-assigned ownership      | T-04 API/DB: Participant → 403; Organizer → 201; forged owner/role → 400                                                                                                                   |
| AC-05 | Invalid publication is rejected without data writes          | T-05 unit + API/DB: zero/negative/fractional/overlimit capacity, blank/overlength text, past start/deadline, deadline > start, missing timezone → 400                                      |
| AC-06 | Participant discovers/registers/views persisted registration | T-06 API/DB: publish, list, detail, register, mine, own detail, recreate API/pool → same data                                                                                              |
| AC-07 | Duplicate and closed/full requests leave database unchanged  | T-07 API/DB: repeated registration → DUPLICATE_REGISTRATION; last place filled → EVENT_FULL; exact/past deadline → REGISTRATION_CLOSED                                                     |
| AC-08 | Simultaneous requests never oversubscribe or duplicate       | T-08 API/DB: independent API pools, simultaneous last-place requests → one 201 and all others 409; same participant twice → one record                                                     |
| AC-09 | Participants cannot inspect another's private registration   | T-09 API/DB: own/foreign/missing IDs → 200/404/404; mine contains only self                                                                                                                |
| AC-10 | Organizers see only owned events and rosters                 | T-10 API/DB: own roster → 200, other organizer/participant → 404/403; organizer cannot register                                                                                            |
| AC-11 | Database constraints reject invalid persistent records       | T-11 DB: duplicate key, invalid role/capacity/deadline, broken FK → SQL constraint errors                                                                                                  |
| AC-12 | Complete browser journey works at desktop/mobile sizes       | T-12 UI E2E: Organizer logs in/publishes, Participant logs in/registers/views, owner views roster; invalid login, forbidden UI route and closed/full state visible; no horizontal overflow |

Definition of Done for F-01–F-04: contracts precede code; meaningful failing tests captured before implementation; linked tests pass against disposable real PostgreSQL; production build passes; browser critical journeys pass; migrations/seed/setup reproduce; no real secrets committed; diff inspected. GitHub issue/board links, branch/PR, independent teammate review and submitted-commit evidence are required delivery gates. The repository/board/issues and protections are now configured; teammate review and release acceptance remain pending. Authors cannot self-approve. Do not claim these external gates are complete locally.

## Delivery and planned deployment

Sprint 1 must run locally; completed Docker/CI/CD and GCP deployment are due in Lab 5. Container definition and local Compose are provided for reproducibility. Planned GCP: built Node image in Artifact Registry → Cloud Run with Cloud SQL PostgreSQL and Secret Manager; migrations run once as a release job before traffic shifts. Persist all domain/session data in Cloud SQL, never container files. Lab 5 pipeline: build + real PostgreSQL API tests + selected Playwright tests; require passing checks and teammate review before staging/main merge; deploy accepted main releases via pipeline with explicit environment approval. GitHub branch protections are now configured for main and sprint/1 as recorded below. Cloud pipeline/resources remain Lab 5 work; a workflow file alone does not establish a deployment.

Course workflow after repo creation: issues referencing FR/F/AC and this contract → feature/fix branches from `sprint/1` → reviewed PR into staging → integration tests → independently reviewed release PR to main → tag accepted commit. Record genuine local results tied to submitted commit; preserve red/green evidence. No invented issues, reviews, approvals or deployment claims.

## Official technical references consulted

- [React UI/state](https://react.dev/learn), [Vite](https://vite.dev/guide/)
- [Express security](https://expressjs.com/en/advanced/best-practice-security/), [Express sessions](https://expressjs.com/en/resources/middleware/session/), [PostgreSQL session store](https://github.com/voxpelli/node-connect-pg-simple)
- [Argon2 implementation](https://github.com/ranisalt/node-argon2), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [PostgreSQL locks](https://www.postgresql.org/docs/current/explicit-locking.html), [pg transactions](https://node-postgres.com/features/transactions), [parameterized queries](https://node-postgres.com/features/queries)
- [Playwright webServer](https://playwright.dev/docs/test-webserver), [Cloud Run persistence](https://docs.cloud.google.com/run/docs/container-contract#filesystem), [Cloud SQL from Cloud Run](https://docs.cloud.google.com/sql/docs/postgres/connect-run)

## Actual execution evidence

The original red run executed 15 tests against the transport/rule skeleton: 15 failed for the intended missing behavior, captured in `artifacts/tdd-red.log`. The first complete green run passed all 15 tests (`artifacts/tdd-green.log`). Six desktop/mobile browser scenarios also passed (`artifacts/e2e.log`, HTML/JSON reports and screenshots). Final additional security tests and the exact 390px viewport are verified below after execution. T-13 covers failed-login throttling (AC-01/03), T-14 production secure cookies (AC-02/03), and T-15 current-role enforcement and bounded input/pagination (AC-03/04/10). Source hashes and the real local commit are recorded by `node scripts/evidence.mjs` in `artifacts/source-manifest.json`.

Process limitation: the workspace had no Git repository or project remote. Local Git was initialized after the initial red/green cycle; the actual red log is retained, but no pre-implementation test commit or prior Issue/PR history is claimed. Contracts were written on disk before implementation. Remote issue/board setup, independent review and release acceptance must be completed with the team; do not represent the local history as a completed course delivery workflow.

Final verification, 29 October 2026: `npm run build` succeeded; `npm test -- --reporter=verbose` passed 18/18 tests across three files against real PostgreSQL; `npm run test:e2e` passed 6/6 Chromium scenarios at 1440px desktop and 390px mobile. No horizontal overflow was observed in the tested screens. Screenshots were visually inspected. The compiled `node dist/server/migrate.js` and `node dist/server/seed.js` commands were also exercised for local setup. This local verification did not validate Docker or GCP. Subsequent hosted validation is tracked in the GitHub Actions runs linked below; GCP remains Lab 5 work. The local feature commit is implementation work awaiting team review, not an accepted release.

The original increment supplied this combined engineering baseline and README as human-authored design/setup documents. GitHub bootstrap adds operational issue/PR templates and preserved execution evidence; it does not introduce duplicate design documents.

## GitHub bootstrap and remaining release gates

Repository: [PhraewaS/event-system](https://github.com/PhraewaS/event-system); [Sprint 1 milestone](https://github.com/PhraewaS/event-system/milestone/1) due 8 November 2026 (end of day Asia/Bangkok); [project board](https://github.com/users/PhraewaS/projects/3); [CI runs](https://github.com/PhraewaS/event-system/actions). The public repository was selected explicitly by the stakeholder.

| Feature / delivery item                                 | Tracking                                                | State at bootstrap                               |
| ------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| F-01 identity, FR-01                                    | [#1](https://github.com/PhraewaS/event-system/issues/1) | Implemented; independent review pending          |
| F-02 publication, FR-02                                 | [#2](https://github.com/PhraewaS/event-system/issues/2) | Implemented; independent review pending          |
| F-03 discovery/registration, FR-03/04                   | [#3](https://github.com/PhraewaS/event-system/issues/3) | Implemented; independent review pending          |
| F-04 organizer ownership/rosters, FR-05                 | [#4](https://github.com/PhraewaS/event-system/issues/4) | Implemented; independent review pending          |
| Repository/CI bootstrap                                 | [#5](https://github.com/PhraewaS/event-system/issues/5) | Configured; hosted validation tracked in Actions |
| Independent review, staging acceptance, release to main | [#6](https://github.com/PhraewaS/event-system/issues/6) | Pending team review/acceptance                   |
| Lab 5 Docker/GCP release delivery                       | [#7](https://github.com/PhraewaS/event-system/issues/7) | Planned; no cloud deployment claimed             |
| F-05 cancellation/capacity changes, FR-06               | [#8](https://github.com/PhraewaS/event-system/issues/8) | Later sprint; contract required before coding    |
| F-06 check-in/attendance, FR-07                         | [#9](https://github.com/PhraewaS/event-system/issues/9) | Later sprint; contract required before coding    |

Remote branches retain the real local history: main and sprint/1 start at the contract baseline; feat/sprint-1 contains the implementation and bootstrap work. Both protected branches require GitHub Actions build-and-test (app ID 15368), up-to-date status, one independent approval, stale review dismissal and resolved review conversations; administrator enforcement, force-push and deletion restrictions are enabled. Authors cannot self-approve. Merge commits preserve the branch history; no administrative merge bypass is part of this setup.

The stakeholder requested Write access for guluJa. A repository invitation and project Writer access were issued; acceptance and an actual independent review remain separate events. Initial local TDD/build/browser evidence and a source manifest naming 305444a are preserved in [evidence/sprint-1](../evidence/sprint-1/). Hosted CI evidence identifies the later head commit. Existing source history was not rewritten to invent pre-implementation issues or tests.

Operational templates live in .github/ISSUE_TEMPLATE and .github/pull_request_template.md. They collect requirement/feature links, stable AC/STS IDs, scope/permissions and red/green evidence. They become the default repository templates after the reviewed release reaches main.

Bootstrap followed the official [repository CLI](https://cli.github.com/manual/gh_repo_create), [branch-protection API](https://docs.github.com/en/rest/branches/branch-protection), [Projects API](https://docs.github.com/en/graphql/reference/projects), [issue-form schema](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema), and [PR-template guidance](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository).
