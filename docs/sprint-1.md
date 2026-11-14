# Sprint 1 engineering baseline and feature contracts

> Current accepted product baseline: [v0.1.0](https://github.com/PhraewaS/event-system/releases/tag/v0.1.0) at main `7532716bbe96b8d7d9cea33b3b063ba16bf746d2`, published 10 November 2026. [Issue #6](https://github.com/PhraewaS/event-system/issues/6) is closed/Done after actual main CI and release/tag verification. The active integration branch remains `sprint1-staging`. This documentation correction is tracked in [Issue #30](https://github.com/PhraewaS/event-system/issues/30); its own review/integration state is recorded there and it does not rewrite the original tag/archive. Dated contracts and old pending states below are explicitly historical snapshots, not the current release status.

Baseline: 29 October 2026. Target: 8 November 2026. Whole-product planning supplement: 11 November 2026; 29 November checkpoint plan refined on 14 November after review, [Issue #34](https://github.com/PhraewaS/event-system/issues/34), pending independent review/integration. This single document combines the required SRS, feature inventory/traceability, System SDS, feature SDS, AC and STS to avoid duplicate documents. The supplied course brief is the product authority. Linked official documentation below supplies technical guidance; it does not define business policy.

## Accepted release and actual evidence index

Accepted release #29: guluJa [APPROVED](https://github.com/PhraewaS/event-system/pull/29#pullrequestreview-5842989660) staging `6db75f1544dd648b1818bbcf876f2b9b3daf9490` on 10 November 2026 at 13:55:39 UTC, then merged at 13:55:53 UTC into main `7532716bbe96b8d7d9cea33b3b063ba16bf746d2`. Main tree `941018ed84114dd702d573d8cb53ecbcc87dde47` equals reviewed staging and the tested release integration. Tag `v0.1.0` targets this exact main commit; 59 tracked source hashes match its hosted manifest. Original release #24/main 0fb7e11 remains historical RED and is not relabelled as passing.

| Requirement / AC | Actual tests or evidence | Accepted result and source |
| --- | --- | --- |
| FR-01 / AC-01–03 / BR-04 | T-01–03, AUTH-BOUND-01–06, T-13–15, CLIENT-CSRF-01–05 | Included in 43/43 tests at main 7532716; [raw main output](https://github.com/PhraewaS/event-system/releases/download/v0.1.0/sprint-1-main-ci.log) |
| FR-02/03 / AC-04–05, AC-PUB-01 / BR-01/03/04 | T-04/05, PUB-BOUND-01–03, PUB-UNIT-01 | Valid/invalid publication, Organizer role and server ownership, public discovery; same actual main suite |
| FR-03/04 / AC-06–09 / BR-01–04 | T-06–09, REG-BOUND-01–03, REG-CONC-01 | Persistent own registration, duplicate/full/deadline rejection, independent API instances/last-place race and private ownership; same main suite |
| FR-05 / AC-10–11 / BR-04 / NFR-01/04 | T-10/11, ORG-BOUND-01–04, FOUND-01/02 | Owned events/rosters, schema/seed/persistence and bounded owner-only pagination; same main suite |
| AC-12, AC-12-01–08, AC-UI-EXP-01/02 / NFR-03 | UI-REVIEW-01–04 × desktop/mobile | Eight real-browser cases within current 12/12; UI-REVIEW-04 alone declares injected list responses for loading/empty/503 states |
| AC-VER-02/03 / BR-01/02 / NFR-04 | INT-UI-01/02 × desktop/mobile | Four further browser cases: winner/loser/owner/SQL consistency and complete real pagination; [raw browser results](https://github.com/PhraewaS/event-system/releases/download/v0.1.0/sprint-1-browser-results.json) |
| AC-AUTH-SYNC-01–04 | Actual #28 guluJa approval/merge, exact staging local and hosted validation | Accepted at staging 6db75f1; [fix record #27](https://github.com/PhraewaS/event-system/issues/27), [staging CI](https://github.com/PhraewaS/event-system/actions/runs/42825944757/job/129863142516) |
| AC-REL-01–05 | Separate #29 release review, actual main push CI, tree/file audit and verified tag/assets | Accepted in [closed Issue #6](https://github.com/PhraewaS/event-system/issues/6); original process exceptions below remain exceptions |



[Main CI](https://github.com/PhraewaS/event-system/actions/runs/42829070132/job/129873990822) at `7532716bbe96b8d7d9cea33b3b063ba16bf746d2` passed clean install, production build, **43 unit/API/DB/client tests**, **12 desktop/mobile browser cases**, zero failures/skips/retries, Compose config and Docker image build. Permanent [release evidence JSON](https://github.com/PhraewaS/event-system/releases/download/v0.1.0/sprint-1-release-evidence.json) binds source hashes, review/merge, main execution and file digests. Its two companion assets preserve the actual full CI output and browser results. CI artifact sprint-1-evidence ID 13769664166 records the same checkout; permanent release assets avoid relying only on the 30-day workflow artifact.

Separate actual executions: exact corrected staging 6db75f1 passed local production build/43 tests/12 browser and [hosted staging checks](https://github.com/PhraewaS/event-system/actions/runs/42825944757/job/129863142516); [release PR CI](https://github.com/PhraewaS/event-system/actions/runs/42826991379/job/129866787385) tested its integration with the then-current main; actual main push CI above tested 7532716. The local staging execution is not a new local main run. Earlier d04ed58 assistant/hosted 12/12 and guluJa local 8 passes/4 default timeouts plus a focused two-Desktop-journey 120-second rerun remain separate dated results. The focused rerun is not a full local 12/12 pass.

**Scope and recorded limitations:** the runnable Sprint 1 UI → API → persistent PostgreSQL workflow, schema/migrations/seed, auth/roles/ownership, publication, registration and organizer rosters are accepted at the repository release. Foundation/auth PRs #14/#15 were checked by the same-team developer after merge; this does not satisfy their original pre-merge-review sequence. Initial Git history starts after the original red/green cycle, so no earlier test commit or Issue/PR history is claimed. Their original records remain below. No course grading decision is inferred from repository acceptance.

**Dates and remaining gates:** target 8 November 2026; actual release 10 November 2026 at 14:00:37 UTC. Actual submission time is not established by repository metadata. Docker image/config checks are hosted; local Compose startup/restart/persistence and GCP remain Lab 5 #7, released-version cross-team UAT Lab 6, and cancellation/capacity editing/check-in/attendance later scope. The original v0.1.0 archive retains its old README/SDS; Issue #30 records this supplementary documentation revision and any subsequent reviewed promotion. No tag, asset or recorded result is rewritten.


## SRS: actors, scope and decisions

Revision for [Issue #34](https://github.com/PhraewaS/event-system/issues/34), 11 November 2026. The stakeholder problem is coordinating published events with limited places while keeping registrations private and giving organizers reliable rosters and attendance totals. The context is a small university/community event service using synthetic data. The whole-product baseline covers publication, capacity, registration/cancellation, organizer management, check-in and attendance reporting. It does not claim that later features are in v0.1.0.

| Actor | Responsibilities and record boundaries |
| --- | --- |
| Visitor | Discover public events/details; sign in. No private registrations, rosters or management access. |
| Participant | Sign in/out, discover/register and retrieve own registration. Sprint 2 adds cancellation/re-registration of own record. Cannot publish, edit capacity, inspect another person's private registration or check anyone in. |
| Organizer | Sign in/out, publish and manage own events/rosters. Sprint 2 adds owned-event capacity changes; Sprint 3 adds check-in/reporting for own events. No broader organizer/admin bypass. |
| Development team / cross-team testers | Maintain/review releases and test synthetic data. These are engineering responsibilities, not extra application roles. Cross-team UAT is a separate Lab 6 gate. |

Exactly one application role per account; seeded accounts suffice. Sprint 1 delivers publish → discover → register → retrieve persisted own registration → owner views roster. Exclusions for the complete baseline: payment, messaging/email integrations, self-registration/recovery, multiple roles, administrators, public attendee lists, event deletion/drafts, general title/date editing, QR scanning, check-out and report export. Cancellation/capacity editing and check-in/reports are included in the product but excluded from the Sprint 1 implementation.

| ID | Observable functional requirement | Feature | Establish / verify |
| --- | --- | --- | --- |
| FR-01 | Login, logout and current identity use seeded Participant/Organizer accounts and server-owned sessions. | F-01 Identity | Sprint 1; retain in 2/3 |
| FR-02 | Organizer publishes title, description, location, start, deadline and positive integer capacity; caller becomes owner. | F-02 Publication | Sprint 1 |
| FR-03 | Anyone discovers published events with remaining places and whether registration is open. | F-03 Registration | Sprint 1; active-only counts in 2 |
| FR-04 | Participant registers and retrieves only own persistent registrations; concurrent requests cannot oversubscribe. | F-03 Registration | Sprint 1; re-registration in 2 |
| FR-05 | Organizer lists only owned events and reads each owned event's roster/counts. | F-04 Organizer management | Sprint 1; state/count regressions in 2/3 |
| FR-06 | Participant cancels own active registration and may re-register when eligible; Organizer changes only owned-event capacity without going below active registrations. | F-05 Changes | Sprint 2; Issue #8 |
| FR-07 | Organizer checks in an eligible active registration for an owned event and retrieves deterministic private attendance totals. | F-06 Attendance | Sprint 3; Issue #9 |

### Business rules and planning decisions

BR-01–04 retain their original Sprint 1 meaning. BR-05–10 are explicit future planning assumptions proposed in this revision; they require owner/stakeholder confirmation in the relevant feature contract before coding. A documentation approval does not prove stakeholder confirmation. Until then there is no cancellation, capacity-update or check-in endpoint in v0.1.0.

| ID | Rule / observable boundary | Allocation and current status |
| --- | --- | --- |
| BR-01 | Capacity is an integer 1–1,000,000; active registrations never exceed capacity, including competing requests. | Sprint 1 established; Sprint 2 extends counting to state transitions |
| BR-02 | One registration per participant/event in Sprint 1; repeated active registration returns 409, including when full/closed. In Sprint 2, reactivation must still leave at most one active registration. | Sprint 1 established; Sprint 2 extension |
| BR-03 | On publication start/deadline are future timezone-qualified instants and deadline ≤ start. Registration is closed when database time ≥ deadline, evaluated after acquiring the event lock. | Sprint 1 established; same gate for Sprint 2 re-registration |
| BR-04 | Server derives identity and checks role plus ownership; caller-supplied identities never widen access. | All features; Sprint 1 established, re-verify in 2/3 |
| BR-05 | Proposed: only the participant owning an active registration may cancel before its registration deadline. A cancellation releases exactly one place atomically. For an already CANCELLED owned row return its existing state without another release. An ACTIVE row at/after deadline is rejected without change. | F-05 / Sprint 2; planned, confirmation pending |
| BR-06 | Proposed: cancelled registration can be reactivated only before deadline with an available place. Repeated/reactivated competing requests use the same duplicate/deadline/capacity checks. Cancelled records consume no place. | F-05 / Sprint 2; planned, confirmation pending |
| BR-07 | Proposed: only the event owner may change capacity before deadline; keep integer bounds and reject capacity below current active count. Equal-to-count is valid. Register/cancel/reactivate/capacity change serialize on the same event row; failure preserves prior data. | F-05 / Sprint 2; planned, confirmation pending |
| BR-08 | Proposed: only the owning Organizer may check in an ACTIVE registration at/after event start. Cancelled/nonexistent/foreign records cannot be checked in. Repeating check-in returns the existing result without a second attendance record. | F-06 / Sprint 3; planned, confirmation pending |
| BR-09 | Proposed: private report for one owned event gives activeRegistered, checkedIn, notCheckedIn = activeRegistered − checkedIn, and attendancePercent = 100 × checkedIn / activeRegistered (0 when denominator is 0). Read counts from one consistent DB snapshot; round display to two decimal places. | F-06 / Sprint 3; planned, confirmation pending |
| BR-10 | Proposed: read/edit/report/check-in ownership follows the registration's event owner, never a supplied organizer ID. No public roster/report or Participant check-in; future wrong-role/foreign access follows current 403/404 privacy conventions. | F-05/F-06 / Sprints 2/3; planned, confirmation pending |

### Important NFR targets and verification allocation

| ID | Measurable target | Practical verification | Establish / extend |
| --- | --- | --- | --- |
| NFR-01 | Committed users/events/registrations/sessions survive application stop/restart or a new API/pool using the same DB; future cancellation/check-in states also survive. | FOUND-02/manual M-FOUND checks, T-02/T-06, ORG-BOUND-04; later state persistence checks. Durable DB, not browser/container files. | Sprint 1; regression/extension 2/3; actual container/cloud persistence Lab 5 |
| NFR-02 | Every protected operation has negative authentication/role/ownership checks; no private data on denied requests. Domain/persistence/concurrency tests use real PostgreSQL; important pure boundary logic has unit checks. | T-01–11, T-13–15, AUTH/PUB/REG/ORG boundary suites, rules.test.ts; new mutation/report checks in 2/3. No mock-only persistence claim. | Sprint 1; re-verify 2/3 |
| NFR-03 | Selected critical journeys work at 390px and 1440px without horizontal page overflow; labels and loading/empty/error/status behavior are observable. | UI-REVIEW-01–04 and INT-UI-01/02 at both viewports; later cancellation/check-in/report journeys reuse both sizes. | Sprint 1; extend 2/3 |
| NFR-04 | JSON request bodies ≤16KiB; each list response ≤200 rows with offset/nextOffset continuation and caller-scoped complete retrieval. | T-15, PUB-BOUND-02, REG-BOUND-03, ORG-BOUND-02/03, INT-UI-02; apply limits to future lists and reports. | Sprint 1; re-verify 2/3 |
| NFR-05 | Reproduce setup from committed dependency lockfile, numbered/checksummed migrations and idempotent synthetic seed with no private secrets in Git/client/PDF. Container/app restarts preserve DB storage; accepted main deployment is repeatable through the approved pipeline. | Clean-install/build/setup inspection; hosted config/image checks exist. Actual Compose runtime/restart and GCP pipeline/deployment evidence must be recorded in Lab 5 Issue #7; regression thereafter. | Design in Sprint 1; runtime/cloud verification Lab 5, maintain Sprints 2/3 |

### Assumptions, resolutions and open decisions

| ID | Decision / question | Resolution, owner and evidence |
| --- | --- | --- |
| DEC-01 | Duplicate precedence, deadlines, changing capacity in Sprint 1 | Adopted working Sprint 1 decisions: duplicate → 409 even full/closed; explicit deadline with equality closed; capacity immutable after publication. Retained implementation/tests and original assumptions; no retroactive stakeholder approval claim. |
| DEC-02 | Cancellation/re-registration lifecycle | Proposed BR-05/06; reuse one participant/event row with ACTIVE/CANCELLED state. Confirm cancellation cutoff and repeated-cancel behavior with owner/stakeholder in Issue #8 contract before coding. |
| DEC-03 | Capacity changes and concurrent allocation | Proposed BR-07; owner only, before deadline, never below active count, same event lock as registration. Confirm in Issue #8; no date/title editing added. |
| DEC-04 | Check-in eligibility/window and correction | Proposed BR-08: at/after start, active registrations only, duplicate is idempotent. Closing time, undo and backdating are not defined/implemented; decide explicitly in Issue #9 contract. Baseline proposes no automatic close and no undo/backdating. |
| DEC-05 | Attendance denominator/privacy | Proposed BR-09/10: ACTIVE registrations, one snapshot, zero-denominator 0, private owner-only on-screen summary. Confirm in Issue #9; exports excluded. |
| DEC-06 | Same-team review and AI assistance | PhraewaS/guluJa are developers; the other two accounts are cross-team testers. Follow actual review records and disclose AI assistance and historical review/TDD gaps; no invented pair-work or equal-commit claim. |
| DEC-07 | Submission authority and immutable assessment version | Supplied Deliverable 1 rubric governs Parts A–F and PDF format; supplied master brief governs product/theme. v0.1.0 remains at 7532716; this 11 November supplement is later documentation. Confirm student names/IDs, theme assignment and actual LEB2 submission with the team; not established by GitHub metadata. |

## Feature inventory and requirements traceability

This is the whole-product inventory, not a list of completed features. Verification names beginning PLAN- are reserved planning labels, not executable tests or pass results; full later AC/STS are deliberately deferred until each feature contract is approved.

| Feature / system responsibility | Scope / related requirements | Dependencies | Sprint / verification / state |
| --- | --- | --- | --- |
| F-01 Identity | FR-01, BR-04, NFR-01/02/05; persisted identity/session/CSRF | User/session schema, configuration/seed | Sprint 1 established; AC-01–03 / T-01–03, AUTH-BOUND, T-13–15; accepted |
| F-02 Publication | FR-02, BR-01/03/04, NFR-01/02/03/04 | F-01, event schema | Sprint 1; AC-04/05, AC-PUB-01 / T-04/05, PUB-BOUND, PUB-UNIT, UI-REVIEW; accepted |
| F-03 Registration | FR-03/04, BR-01–04, NFR-01–04 | F-01/F-02, registration schema/transaction | Sprint 1; AC-06–09 / T-06–09, REG-BOUND/CONC, rules.test.ts, UI/INT-UI; accepted |
| F-04 Organizer management | FR-05, BR-04, NFR-01–04 | F-01/F-02/F-03 | Sprint 1; AC-10/11 / T-10/11, ORG-BOUND, UI-REVIEW; accepted |
| F-05 Changes | FR-06, BR-01–07/10, NFR-01–05; own cancellation/reactivation and owner capacity updates | Accepted F-01–04; reviewed Issue #8 state/migration/UI/API contract | Sprint 2; PLAN-CHANGE-01 unit + real-DB/API concurrency/permissions/persistence + desktop/mobile journey; planned, not implemented |
| F-06 Attendance | FR-07, BR-04/08/09/10, NFR-01–05; owner check-in and attendance summary | F-01/F-04 plus F-05 registration state semantics; reviewed Issue #9 contract | Sprint 3; PLAN-ATT-01 unit aggregation + real-DB/API ownership/idempotence/persistence + browser journey; planned, not implemented |
| SYS-DELIVERY (named cross-cutting responsibility) | NFR-05; schema/config/secret/setup, reviewed CI/release/Docker/GCP | F-01–04 runnable product; approved Lab 5 GCP access | Design/Sprint 1 config-image checks; runtime/cloud Lab 5 Issue #7; maintain in 2/3 |
| SYS-QUALITY (named cross-cutting responsibility) | NFR-01–04 across F-01–06; regression, release acceptance, Lab 6 UAT/retest | Each feature's contract/tests/review; actual released version | Sprint 1 verification #13/#6 accepted; extend in 2/3; UAT is a separate Lab 6 gate |

| Requirement | Feature / responsibility | Establish and verify; later re-verification |
| --- | --- | --- |
| FR-01 | F-01 | S1 AC-01–03, auth/session tests; S2/S3 regression |
| FR-02 | F-02 | S1 AC-04/05, publication tests/UI |
| FR-03 | F-03 | S1 AC-PUB-01/AC-06, discovery/API/UI; S2 active-only counts |
| FR-04 | F-03 | S1 AC-06–09, registration/ownership/concurrency; S2 reactivation |
| FR-05 | F-04 | S1 AC-10/11, owner API/UI; S2/S3 state/count consistency |
| FR-06 | F-05 | S2 PLAN-CHANGE-01, cancellation/reactivation/capacity API/DB/UI |
| FR-07 | F-06 | S3 PLAN-ATT-01, check-in/report API/DB/UI |
| BR-01 | F-02/F-03/F-05 | S1 T-05/T-07/T-08; S2 capacity/cancel/register races |
| BR-02 | F-03/F-05 | S1 T-07/T-08; S2 repeated cancellation/reactivation races |
| BR-03 | F-02/F-03/F-05 | S1 T-05/T-07/REG-CONC-01; S2 exact cutoff and lock-wait cases |
| BR-04 | F-01–06 | S1 auth/role/owner tests; S2/S3 every new protected operation |
| BR-05 | F-05 | S2 PLAN-CHANGE-01, own/foreign/repeated/deadline cancellation |
| BR-06 | F-05 | S2 PLAN-CHANGE-01, no-place/closed/reactivation/duplicate races |
| BR-07 | F-05 | S2 PLAN-CHANGE-01, bounds/equal-count/below-count/wrong owner/concurrency |
| BR-08 | F-06 | S3 PLAN-ATT-01, active/cancelled/early/repeated/foreign check-in |
| BR-09 | F-06 | S3 PLAN-ATT-01, zero/mixed/all-present counts and snapshot consistency |
| BR-10 | F-05/F-06 | S2/S3 PLAN-CHANGE-01/PLAN-ATT-01, 401/403/404/no private leak |
| NFR-01 | SYS-QUALITY, F-01–06 | S1 persistence tests/manual evidence; S2/S3 state persistence; Lab 5 durable runtime |
| NFR-02 | SYS-QUALITY, F-01–06 | S1 real-DB/security/unit suites; S2/S3 negative and boundary coverage |
| NFR-03 | SYS-QUALITY, F-01–06 | S1 12 desktop/mobile cases; S2/S3 new critical UI paths |
| NFR-04 | SYS-QUALITY, F-02–06 | S1 body/pagination checks; S2/S3 new collection/mutation bounds |
| NFR-05 | SYS-DELIVERY, F-01–06 | S1 setup/source/config/image evidence; Lab 5 runtime/GCP; S2/S3 clean upgrade/release |

Coverage gaps are explicit: later FR-06/07 and BR-05–10 have a feature, sprint and planned verification but no implementation/executable acceptance evidence yet. NFR-05 runtime/cloud verification remains Issue #7. Proposed decisions DEC-02–05 are not stakeholder-approved changes. Existing accepted S1 behavior/IDs remain stable; document change #34 and feature contracts must record any approved future policy revision.

## Three-sprint plan

Course checkpoints are targets, not backdated completion claims. Scope fits two students by retaining the modular monolith and deferring recovery/admin/payments/export integrations. Implement bounded subfeatures sequentially on branches from that sprint's staging; do not create all future branches/contracts now.

| Sprint / checkpoint | Goal and included features | Dependencies / bounded order | Completion outcome and evidence gate |
| --- | --- | --- | --- |
| Sprint 1 — Deliverable 1, 8 November 2026 | Small deployable publication → registration → persisted retrieval → owned roster. F-01, F-02, F-03, F-04; SYS-QUALITY and delivery design. | Schema/seed → identity → publication → capacity-safe registration → owner APIs → role UI → integration → reviewed staging/main release. | Runnable UI/API/PostgreSQL, real roles/session, rejection/ownership/concurrency tests, setup and accepted main release. Actual v0.1.0 acceptance/publication occurred 10 November; 43/43 tests + 12/12 browser and original process/date exceptions retained. A self-contained PDF/submission is a separate deliverable, not proved by release acceptance. |
| Sprint 2 — Deliverable 2, 29 November 2026 | Complete F-05 cancellation/reactivation and owner-capacity changes, retain F-01–04 regression, and integrate the tested F-06 check-in slice defined below. | Confirm DEC-02/03 in Issue #8; contracts/AC/STS → state migration → cancellation/reactivation → owner-capacity updates under the same lock → UI/count regression. F-06 depends on accepted F-05 state semantics and Issue #9 contract. Issue #7 is a required dependency for the integrated main candidate and actual GCP deployment by this checkpoint. | All Sprint 2 scope complete/reviewed/verified; meaningful F-06 owner-check-in/idempotence path implemented and tested; integrated candidate on main with matching tag/commit/CI/GCP revision and post-deployment journey/persistence evidence. Separate Sprint 2 accepted release remains identifiable. Missing deployment or unexecuted F-06 checks block checkpoint readiness; local work may continue but cannot substitute for this gate. |
| Sprint 3 — progress checkpoint 29 November; complete by 13 December 2026 | F-06 first delivers the real owner-check-in/idempotence workflow by 29 November; finish owner-only attendance reporting, regression/hardening and UAT retests in bounded follow-up work. | Confirm DEC-04/05 and record contracts/AC/STS for all remaining F-06 work before implementation. F-05 state semantics → attendance migration → owner check-in/UI → tested main/GCP checkpoint → bounded report/UI completion and final verification. | By 29 November the check-in slice is implemented/tested in the deployed integrated candidate, not an empty screen or specification alone. The remaining-work register below bounds report completion and defects before 13 December; primary workflows are not reserved for the final two days. |

### 29 November integrated checkpoint and remaining work

Planning refinement requested by [guluJa review of PR #35](https://github.com/PhraewaS/event-system/pull/35#pullrequestreview-5903829498), 14 November 2026. Authority: supplied project_deliverable_2_v1.pdf, section 2 (page 1), sections 3.3/3.5 (pages 2–3), and section 4.2 (page 5). Deliverable 1 requires deployment design, not actual cloud deployment; the later Deliverable 2 requires an integrated main candidate actually deployed on GCP. This is a future checkpoint plan, not implementation, a passing test result or a new deployment claim in this docs PR.

**F-06 minimum working slice by 29 November:** an authenticated Organizer opens an owned event's roster, checks in an eligible ACTIVE registration at/after the event start, sees persisted checked-in state after reload, and repeats the action without a second attendance row. The server derives the acting Organizer/timestamp and rejects anonymous, Participant, foreign-event, cancelled-registration and early check-in requests without writes. Eligibility/start/idempotence follow proposed BR-08/10 and DEC-04; confirm policy in the Issue #9 contract before coding. Exact endpoint/request/error definitions and stable feature AC/test IDs must be recorded there, not invented as implemented routes here. Full contracts/AC/STS must cover the remaining F-06 reporting scope as well, not only this first slice.

| Planned checkpoint verification | Observable expected outcome | Evidence to retain at the actual candidate version |
| --- | --- | --- |
| PLAN-ATT-CHECKIN-UNIT (reserved planning label, not an existing test) | Active/start eligibility and rejection rules exercise before/at-start and cancelled boundaries; expected errors are explicit. | Actual unit file/test names, input/expected/actual, RED/GREEN where meaningful and tested commits |
| PLAN-ATT-CHECKIN-API (planned real API/DB checks) | Owner succeeds; wrong role/owner/CSRF/eligibility fails safely; repeated and competing check-ins leave one attendance row; a fresh API/pool reads the saved result. | Actual AC/test IDs, HTTP/error outcomes, SQL assertions, migration/fixture source and passing/failing/skipped counts |
| PLAN-ATT-CHECKIN-UI (planned selected browser journey) | Organizer's owned roster action calls real API/DB, shows saved check-in after reload and repeat; disallowed access cannot check in. Verify the baseline desktop/mobile sizes. | Captioned UI/API/DB evidence and actual executed browser results tied to the candidate, with no mock-only persistence claim |
| PLAN-D2-REGRESSION (planned integration) | Original S1 publish/register/retrieve/owner-roster journey, both meaningful S2 changes and the F-06 slice still work together with auth/ownership. | Actual build/suite/system/acceptance commands/results on main candidate; AC-to-file/result/version matrix, unresolved defects and skipped tests disclosed |

F-05's cancellation/reactivation and owner-capacity changes must have separately identifiable feature contracts/evidence selections for Deliverable 2's two meaningful Sprint 2 examples; retain the aggregate F-05/FR-06 trace and assign bounded subfeature IDs when those contracts are recorded. Do not move required Sprint 2 work to Sprint 3 to mark completion without an approved scope revision.

**Issue #7 dependency and checkpoint release gate:** [Lab 5 delivery Issue #7](https://github.com/PhraewaS/event-system/issues/7) must provide the approved repeatable main-release deployment process and durable database before the 29 November candidate can be ready. Follow course GCP access instructions; this docs PR creates no resources. Planned chain: reviewed Sprint 2 acceptance → reviewed F-06 check-in integration → actual integrated main build/regression/acceptance → immutable candidate tag/commit and CI run → pipeline deployment to a recorded GCP revision/application URL → post-deployment critical journey and durable-data checks. Keep the separate Sprint 2 accepted version identifiable, and record which later F-06 work is included in the candidate. Preserve v0.1.0 separately.

Required future proof from Issue #7/candidate acceptance: Docker/config/migration execution; repeatable delivery run; candidate tag/commit ↔ CI ↔ deployed revision/URL mapping; safe synthetic S1/S2/check-in journeys after deployment; retrieval of saved data after application/service restart or revision replacement with the same persistent DB; results/counts and known failures. Runtime/deployment proof is additional to image/config validation. An unavailable cloud environment is a tracked blocker with an owner/next action, not permission to call the checkpoint deployed/ready.

The following are **proposed planning assignments and targets**, not commitments accepted by the other student or completed work. Confirm team availability in Issues #7/#8/#9. Pair work, actual AC IDs and tested/accepted versions must be recorded as they occur. Plan around the 1–11 December examination period by completing principal workflow implementation before it and keeping remaining work bounded.

| Target | Bounded work / feature or decision | Proposed owner / dependencies / next action | Planned evidence and status gate |
| --- | --- | --- | --- |
| By 22 November | F-05/F-06 policy and contracts; DEC-02–05, complete remaining F-06 AC/STS | PhraewaS prepares; guluJa reviews; Issues #8/#9 confirm scope, eligibility, cutoff and report denominator | Approved contracts before code; no future test/acceptance claimed now |
| By 26 November | F-05 cancellation/reactivation and owned-capacity changes | PhraewaS implementation; guluJa independent review; requires accepted state migration/lock rules, Issue #8 | All planned Sprint 2 AC verified and reviewed/integrated; separate accepted Sprint 2 tag/commit identified |
| By 27 November | F-06 owned-event check-in/idempotence slice | PhraewaS implementation; guluJa review; requires F-05 states, Issue #9 contract and attendance migration | Real unit/API/DB/selected UI checks, role/ownership/duplicate/persistence results; slice source/AC status recorded |
| By 28 November; ready no later than 29 November | Integrated main candidate and actual GCP delivery | PhraewaS prepares release/deployment; guluJa reviews; Issue #7 pipeline/access/durable DB and accepted F-05/F-06 slice are prerequisites | Main build/regression/acceptance, candidate/deployed version mapping and post-deploy journey/persistence proof; missing gate remains blocked |
| By 3 December | Remaining bounded F-06 report calculation/API/UI and zero/mixed/all-present cases, BR-09 | PhraewaS implementation; guluJa review; Issue #9 check-in data/confirmed denominator; enumerate exact missing AC after checkpoint | Real owner-only report journey/unit/API/DB results and migration persistence; no main workflow first scheduled for 12–13 December |
| By 7 December | Targeted report/access/cross-feature defects and integration | PhraewaS fixes; guluJa reviews; actual defect Issues and candidate retests | Each defect has affected AC, owner, next action, fix/tested version and remaining status |
| By 11 December | Final regression and relevant released-version UAT retests | Both developers coordinate; cross-team testers execute their own UAT; depends on actual released fixes | Source-bound results and unresolved-work register; do not claim UAT from code review |
| 12 December readiness; 13 December final handoff | Freeze accepted final release, documentation/evidence and final video | Both developers; requires completed baseline, review, deployed version and readiness check | Final tag/commit/deployment mapping, readable submission and honestly disclosed remaining limits |

At the actual 29 November checkpoint, replace planning-only status with a remaining-work register naming exact feature/AC or defect, achieved status and tested commit, missing verification, owner, dependency, next action and completion target. Planned, implemented, tested and accepted are distinct states. No current F-06/Issue #7 work is marked done by this plan.

Feasibility/risk treatment: F-05 is bounded to two mutations plus reactivation using the current registration path; F-06 is one attendance entity and on-screen report. Confirm time/denominator decisions before test design; preserve lock order (event before registration) to prevent cross-feature races. If scope or dates change, record decision/owner/reason in the relevant Issue and revise this plan/traceability through review; do not silently drop baseline features. Two-student review remains mandatory; use sequential PRs rather than self-approval. One open later-scope Issue per feature is sufficient until a bounded contract needs sub-Issues.

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

UI: responsive sidebar/nav, discover/search, event detail, sign-in, private registrations, owned events, publish form and roster. Loading/empty/error states; labels, keyboard controls, focus visibility, polite status messages. Datetimes entered in browser local time and sent as ISO UTC; displayed with timezone. Lists consume successive 200-row API pages; search filters the loaded published events.

### Whole-product design extension (planned, not present in v0.1.0)

The current schema above and [001_initial.sql](../server/migrations/001_initial.sql) remain unchanged. Major relationships now are users 1→many owned events, users 1→many registrations, events 1→many registrations; registrations has a unique (participant,event) pair. Sessions reference authenticated identity logically and expire independently. Future model allocation:

| Entity / relationship | Planned fields and constraints | Migration / validation owner |
| --- | --- | --- |
| registrations, Sprint 2 extension | Add constrained ACTIVE/CANCELLED status, registered_at for latest activation and nullable cancelled_at; backfill existing rows ACTIVE without changing IDs/created_at. Retain the existing unique participant/event pair and reuse that row on reactivation. Cancelled rows do not count as places. | F-05 / Issue #8: new numbered/checksummed migration, not an edit to applied 001; seed stays idempotent and preserves existing accounts/bookings. Verify upgrade on populated synthetic data and unchanged S1 retrieval. |
| events, Sprint 2 capacity mutation | Existing positive capacity and owner FK retained. Check new capacity ≥ active count in the same locked transaction, not an unsupported cross-row CHECK. No new stored seat counter. | F-05: server role/owner checks; all register/cancel/reactivate/capacity paths acquire event lock first and use DB clock after lock. |
| attendance, Sprint 3 new entity | UUID, registration_id UNIQUE FK, checked_in_by Organizer user FK, checked_in_at DB timestamp; one registration has zero/one attendance record. No client-supplied identity/time. | F-06 / Issue #9: additive migration; server verifies event ownership, ACTIVE state and start before insert. Duplicate returns existing result; all writers obey same lock order. |
| attendance report, Sprint 3 derived view | Compute BR-09 counts from active registrations and attendance in one consistent query/snapshot, scoped to event owner. No mutable summary counter or extra public report table. | F-06: zero-denominator, foreign records, repeated check-in, persisted counts and role/ownership tests. |

Technical basis: [PostgreSQL row locks](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS) and [constraint limitations](https://www.postgresql.org/docs/17/ddl-constraints.html). SQL locking/constraints are technical mechanisms; cancellation windows/check-in policy remain the proposed product decisions above. The retained pair uniqueness avoids needing a second active row or a partial unique index in this proposed design.

| Planned protected action | Anonymous | Participant | Organizer | Sprint |
| --- | --- | --- | --- | --- |
| Cancel/reactivate registration | 401 | Own only; foreign 404 | 403 | 2 |
| Change event capacity | 401 | 403 | Own event only; foreign 404 | 2 |
| Check in registration | 401 | 403 | Registration of own event only; foreign 404 | 3 |
| View attendance report | 401 | 403 | Own event only; foreign 404 | 3 |

Planned navigation: Sprint 2 adds cancellation status/action/confirmation to My registrations and capacity edit to owned-event management. Refresh public/private counts from successful server responses; rejected conflicts preserve entered values and show the domain error, never optimistic success. Sprint 3 adds eligible-attendee check-in actions and attendance summary within the owned event, including empty/error/loading states and accessible status feedback. Role menus are convenience; backend permissions above are authoritative. Existing event detail/search remain public; attendee/report information remains private.

API planning uses the existing JSON envelopes, 400/401/403/404/409 conventions, session/CSRF on all mutations, body/list bounds and safe errors. Exact later methods/paths, schemas and response fields must be specified in Issue #8/#9 feature contracts before implementation; no planned route is advertised as an implemented endpoint in the API table below. New feature AC/STS must include DB/permission/state/concurrency negatives and selected real UI journeys.

Configuration/delivery allocation: DATABASE_URL, TEST_DATABASE_URL, SESSION_SECRET, DEMO_PASSWORD, PORT and NODE_ENV are described in [README configuration](../README.md#seed-and-configuration) and [.env.example](../.env.example). Keep synthetic credentials local; no secrets in Git/client/PDF. Same-origin UI/API can share one Cloud Run service; Artifact Registry stores its image, Cloud SQL PostgreSQL stores all durable records/sessions, Secret Manager supplies production configuration. Release migration job precedes traffic; runtime/cloud persistence, credentials/IAM and an approved deploy pipeline are Lab 5 Issue #7 evidence, not established by design or image build. Sprints 2/3 re-verify forward migration, durable state and deployment after changes.

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

## Deliverable 1 evidence and submission preparation

This section supplements existing contracts/DoD with a current source index; it is not the required self-contained submission PDF. The supplied CPE 334 Deliverable 1 rubric requires complete Parts A–E and selected execution/process evidence in Part F directly in one PDF, with names/IDs, repository, immutable release and A–F page navigation. Suggested separate Markdown filenames are optional; this combined existing document avoids duplication.

| Rubric part | Existing source in this document | IDs / remaining presentation work |
| --- | --- | --- |
| A SRS (10) | [SRS](#srs-actors-scope-and-decisions), rules/NFR/decisions | FR-01–07, BR-01–10, NFR-01–05, DEC-01–07; include complete baseline in PDF |
| B inventory/traceability (10) | [Inventory and traceability](#feature-inventory-and-requirements-traceability) | F-01–06, SYS-DELIVERY/QUALITY; include both tables and explicit gaps |
| C System SDS (15) | [System SDS](#system-level-sds), [API/data](#apidata-specifications), [delivery](#delivery-and-planned-deployment) | Current model/permissions/session/config and clearly labelled planned S2/S3 extensions |
| D plan (5) | [Three-sprint plan](#three-sprint-plan) | All feature IDs, dates, dependencies and outcomes; future verification is planned |
| E Sprint 1 contracts (20) | Original baseline plus source-specific feature/UI/verification/delivery/fix contracts retained below | Include all relevant SDS/UI/API/data, stable AC/STS and Product DoD; retain revision sequence and original process limits |
| F working product/evidence (20) | Accepted index, tables/excerpts/history/contributions below and source-specific records | Select actual output/screenshots and readable workflow/board evidence; captions/page references and team identities still need final PDF assembly |

### Source-bound results and actual test locations

Submitted application remains v0.1.0 at 7532716bbe96b8d7d9cea33b3b063ba16bf746d2. Main [run 42829070132](https://github.com/PhraewaS/event-system/actions/runs/42829070132/job/129873990822) executed npm ci, npm run build, npm test -- --reporter=verbose and npm run test:e2e: build passed, 43/43 unit/API/DB/client tests and 12/12 browser cases, zero failures/skips/retries. This is the hosted release run. Exact local staging 6db75f1 and separate docs-head CI are not relabelled as local execution at release commit. Existing historical failed runs and reviewer timeouts remain disclosed in README/history.

The following rows resolve planned IDs to actual files/named tests; a shared passing suite is not a separate pass count for each row. Existing contract tables give inputs/actions/expected outcomes and levels. UI-REVIEW/INT-UI each execute at both viewports. Manual/config/review checks are labelled separately.

| Sprint 1 AC | Planned / actual test IDs and actual file | Accepted result / level |
| --- | --- | --- |
| AC-FOUND-01–03 | FOUND-01/02 in [foundation.test.ts](../tests/foundation.test.ts), M-FOUND-01–04 historical acceptance record | Current FOUND tests pass within 43; separate original a7a370c build/2 tests and manual checks retain their own source and UI scope |
| AC-01 | T-01; AUTH-BOUND-02/05 in [sprint1.test.ts](../tests/sprint1.test.ts), [auth-boundaries.test.ts](../tests/auth-boundaries.test.ts) | Pass in 43; API/real DB |
| AC-02 | T-02; AUTH-BOUND-01/04/06 in same API/auth files | Pass in 43; session/DB persistence, expiry/revocation |
| AC-03 | T-03/T-13/T-14/T-15, AUTH-BOUND; [security.test.ts](../tests/security.test.ts), sprint1/auth files | Pass in 43; role/CSRF/server identity/API/DB |
| AC-04 | T-04, PUB-BOUND-01/03 in sprint1.test.ts | Pass in 43; Organizer/owner publication API/DB |
| AC-05 | T-05, PUB-BOUND-03, PUB-UNIT-01 in sprint1.test.ts | Pass in 43; unit validation + API/DB boundaries |
| AC-PUB-01 | PUB-BOUND-02 in sprint1.test.ts | Pass in 43; real persisted discovery/pagination |
| AC-06 | T-06 in sprint1.test.ts | Pass in 43; independent API/pool persistent journey |
| AC-07 | T-07, REG-BOUND-02, REG-CONC-01 in sprint1.test.ts; named T-07 unit boundaries in [rules.test.ts](../tests/rules.test.ts) | Pass in 43; unit/API/DB duplicate/full/deadline |
| AC-08 | T-08, REG-CONC-01 in sprint1.test.ts | Pass in 43; independent instances/DB locks |
| AC-09 | T-09, REG-BOUND-01/03 in sprint1.test.ts | Pass in 43; private owner/pagination API/DB |
| AC-10 | T-10, ORG-BOUND-01–04 in sprint1.test.ts | Pass in 43; independent role and event ownership |
| AC-11 | T-11 in sprint1.test.ts, FOUND-01/02 in [foundation.test.ts](../tests/foundation.test.ts) | Pass in 43; constraints/real DB/setup. Earlier manual foundation checks retain their own source, not a new release manual run |
| AC-12 / AC-12-01 | UI-REVIEW-01/02 in [ui-review.spec.ts](../tests/e2e/ui-review.spec.ts) | Pass within 12; real UI login/logout/current identity/persistence |
| AC-12-02 | UI-REVIEW-02 plus T-03/T-10/ORG-BOUND-01 | Pass; UI and authoritative backend access evidence |
| AC-12-03 | UI-REVIEW-01/03 in ui-review.spec.ts | Pass; discovery/search/full/closed views |
| AC-12-04 | UI-REVIEW-01/03 plus publication API tests | Pass; real publication/invalid input/no write |
| AC-12-05 | UI-REVIEW-01 plus T-06–09/REG checks | Pass; SQL/persisted reload/owner roster |
| AC-12-06 | UI-REVIEW-04; CLIENT-CSRF-03–05 in [client-csrf.test.ts](../tests/client-csrf.test.ts) | Pass; real session expiry/re-login; only declared list loading/empty/503 responses injected |
| AC-12-07 | UI-REVIEW-01–04, INT-UI-01/02 | Pass at 390px/1440px; selected journeys, not all devices |
| AC-12-08 | CLIENT-CSRF-01/02, UI-REVIEW-01/02 | Pass; bootstrap/logout/re-login; historical Issue #22 RED/GREEN retained |
| AC-UI-EXP-01/02 | CLIENT-CSRF-03/04 and invalid-credential control CLIENT-CSRF-05, UI-REVIEW-04 | Pass; historical Issue #23 RED source and merged-staging confirmation remain distinct |
| AC-VER-01 | All inherited 43 tests + UI-REVIEW-01–04 | Pass at release; original assertions preserved |
| AC-VER-02 | INT-UI-01 in [integration.spec.ts](../tests/e2e/integration.spec.ts), T-08/REG-CONC-01 | Pass; last-place winner/loser/SQL/roster |
| AC-VER-03 | INT-UI-02 in integration.spec.ts | Pass; >200 real fixtures and private complete pagination |
| AC-VER-04 | [Recorded merged UI staging checks](../evidence/sprint-1/staging-ui-revalidation-2026-11-06.json) at 484027e | Historical executed build/43 tests/8 browsers before defect closure; separate from release 12 |
| AC-VER-05 | Actual #20/#13 review/integration plus current-source CI | Process/manual acceptance evidence in those records; not an automated product-test count |
| AC-DEL-01–05 | DEL-CONFIG-01 hosted Compose config; DEL-MANUAL-01/REL-PLAN-01 inspection; #21/#5 and #29/#6 | Accepted configuration/review/release gates. Image/config pass; no local container/GCP run claimed |
| AC-AUTH-SYNC-01–04 | AUTH-SYNC-RED/GREEN/DIFF; UI/INT suites and #28/#27, #29/#6 | Actual prior 11/12 RED retained; accepted release 12/12, unchanged budgets/retries/assertions |
| AC-REL-01–05 | #29/#6 and permanent release evidence JSON | Actual reviewed main acceptance/tag/source/CI; process checks, not extra automated cases |

### Two real automated test excerpts

Both excerpts are copied from [tests/sprint1.test.ts at v0.1.0](https://github.com/PhraewaS/event-system/blob/7532716bbe96b8d7d9cea33b3b063ba16bf746d2/tests/sprint1.test.ts); common actor/publish/register helpers create real session/API/PostgreSQL fixtures. T-08 and T-10 are named passing tests in the release output above. Ellipses/excerpt boundaries omit unrelated assertions, not new test code.

Domain rule: T-08 / AC-08. Separate authenticated Participant agents use independent API instances against one real capacity-1 event. Expected HTTP statuses are 201/409 and the persisted row count is exactly one:

~~~ts
const owner = await actor("organizer@example.test");
const a = await actor();
const b = await actor("participant2@example.test", secondApp);
for (let attempt = 0; attempt < 5; attempt++) {
  const event = await publish(owner, { capacity: 1 });
  const results = await Promise.all([
    register(a, event.id),
    register(b, event.id),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(results.find((r) => r.status === 409)?.body.error.code).toBe(
    "EVENT_FULL",
  );
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM registrations WHERE event_id=$1",
        [event.id],
      )
    ).rows[0].n,
  ).toBe(1);
}
~~~

Ownership/role: T-10 / AC-10. Owner gets the saved roster; a different Organizer gets 404 and a Participant gets 403:

~~~ts
const owner = await actor("organizer@example.test");
const other = await actor("organizer2@example.test");
const participant = await actor();
const event = await publish(owner);
await register(participant, event.id).expect(201);
const roster = await owner.agent
  .get(`/api/events/${event.id}/registrations`)
  .expect(200);
expect(roster.body.data).toHaveLength(1);
expect(roster.body.data[0].participant.email).toBe(
  "participant@example.test",
);
await other.agent.get(`/api/events/${event.id}/registrations`).expect(404);
await participant.agent
  .get(`/api/events/${event.id}/registrations`)
  .expect(403);
~~~

### Reviewed workflow samples and honest version sequence

| Completed Issue / PR | Feature/contract and author branch | Actual teammate review and staging integration | Accepted main lineage |
| --- | --- | --- | --- |
| [Issue #3](https://github.com/PhraewaS/event-system/issues/3) / [PR #17](https://github.com/PhraewaS/event-system/pull/17) | F-03, FR-03/04, AC-06–09; Registration review contract. Author PhraewaS; feature/sprint1-registration-3 → sprint1-staging. | guluJa [specific check](https://github.com/PhraewaS/event-system/pull/17#pullrequestreview-5736769754) 2 Nov 12:48:08 UTC inspected locks, cutoff, privacy/pagination and 30 tests; [APPROVED](https://github.com/PhraewaS/event-system/pull/17#pullrequestreview-5737638998) 13:56:54 UTC; staging merge b225e83667b2c443c2a53edcf66c1e75d0ce9b7d at 13:57:03 UTC. | Included through reviewed staging releases into accepted 7532716 / #29; release/main source manifest and tests above |
| [Issue #27](https://github.com/PhraewaS/event-system/issues/27) / [PR #28](https://github.com/PhraewaS/event-system/pull/28) | Browser authentication synchronization contract, AC-AUTH-SYNC-01–04. Author PhraewaS; fix/browser-auth-synchronization-27 → sprint1-staging. | guluJa [specific check](https://github.com/PhraewaS/event-system/pull/28#pullrequestreview-5842541718) 10 Nov 13:22:52 UTC checked logout/identity sequencing, trace and preserved assertions; [APPROVED](https://github.com/PhraewaS/event-system/pull/28#pullrequestreview-5842710053) 13:35:22 UTC; staging merge 6db75f1544dd648b1818bbcf876f2b9b3daf9490 at 13:35:36 UTC. | #29 approved 13:55:39 UTC; merged to main 7532716 at 13:55:53 UTC; actual main CI passed before v0.1.0 publication |

Contract/test-design chronology: initial baseline was on disk on 29 October before implementation, but Git began after its first RED/GREEN; this is a disclosed historical limit, not commit-proven TDD. Issue #3 records its refinement on 2 November before added characterization checks; reviewed implementation/test source 1b913d1 is dated 2 November (12:03:34 UTC). These checks characterized existing behavior; they are not a reconstructed original RED/GREEN cycle.

Actual defect sequence is preserved: first main 0fb7e11 [failed browser run](https://github.com/PhraewaS/event-system/actions/runs/42819320782) → Issue #27 recorded contract/observed RED before correction → fix source a4df49fb926edaca200c535fb3e22145a650e254 (10 November 12:59:34 UTC) and passing fix CI → actual #28 approval → staging 6db75f1 scoped validation → independently approved #29 → main 7532716 CI. The original [RED excerpt](../evidence/sprint-1/main-release-browser-red-20261110.txt) remains. Issue #23 separately retains committed RED 8bb4e2c, focused client 2 failures/3 passes and one failing desktop regression before correction; subsequent merged UI 484027e build/43/8 and accepted main 43/12 are separate GREEN records, not one invented run.

The [Kanban](https://github.com/users/PhraewaS/projects/3/views/2) holds actual item state. Accepted product Issue #6 is closed/Done; later #7/#8/#9 remain open. Supplementary docs Issue #34 stays open until independent approval, staging integration and scoped evidence; PR Review is readiness, not completion. The final PDF must capture a dated board/history screenshot and include its release reference rather than depend solely on live links.

### Team participation and AI-use declaration

| Developer account | Evidence-backed contribution | Boundaries / confirmation |
| --- | --- | --- |
| PhraewaS | Author account for the implementation/test/docs branches and repository workflow, including #17/#28 and docs follow-ups; coordinated scoped staging/release corrections and evidence. Authorship and merges are traceable in Issues/PRs/commits. | AI-assisted work must not be represented as unaided implementation. Student must supply full name/ID and confirm personal activities/understanding before submission. |
| guluJa | Same-team behavior/test/diff review, concrete findings and independent approvals, including #17/#28/#29/#31/#33; local execution report in [#24 review](https://github.com/PhraewaS/event-system/pull/24#pullrequestreview-5826613204). | Local report's 8 passes/4 default timeouts and focused two-case rerun are retained separately from full hosted passes. Student must supply full name/ID and confirm activities/understanding. |

No unverified pair-programming session or equal code-commit split is asserted. If pair work occurred, the students must identify who did what and when in the relevant Issue/PR and update this table with genuine evidence. Both must understand and be able to explain the schema, transaction, permissions, tests and released behavior; approvals/commit totals alone do not demonstrate that understanding.

AI-use declaration: OpenAI Codex assisted with scaffolding, application/test implementation and fixes, online-document consultation, documentation drafting, GitHub workflow operations and execution/evidence inspection under the repository owner's instructions. Actual human reviews/approvals belong to the named GitHub accounts; the assistant did not impersonate approvals. Tests/CI and file/source checks support execution claims; AI statements are not test evidence. Students remain responsible for checking correctness, understanding the work and following course AI-disclosure rules. No full prompt transcript is required by this rubric.

### Remaining PDF and course-handoff work

This docs PR prepares repository content; it does not create or submit the one required PDF. Before LEB2 handoff:

- Confirm both students' full names/IDs and selected theme/context against the master brief; do not invent identities from GitHub handles.
- Put complete Parts A–E and selected Part F directly in the PDF, in A–F order. Add contents plus A–F page-range/ID navigation using final actual pages.
- Include readable normal UI→API→DB journey and persisted retrieval, meaningful rejection, login/logout and backend role/ownership evidence. Caption each with feature/AC, role, preconditions, steps, expected/actual results and source commit; annotate synthetic dates/fault injection.
- Embed actual build/test commands/output with passing/failing/skipped counts, this full AC/results mapping and the two selected test excerpts. Reproduce from the accepted tag if extra local evidence is needed; never relabel staging/hosted results as a local tag run.
- Add readable screenshots/history for the two reviewed samples, final board and release; include contributor confirmation, AI-use and all known process/date/test limits.
- Include a short setup summary from README (Node 24, PostgreSQL 15+, separate dev/test DB, local .env, npm ci, db:migrate, db:seed, dev/build/start/test commands). Deliver synthetic seed access safely; no real secrets.
- The existing ZIP is a supplementary source/evidence package, not a substitute for PDF contents; its earlier export is not silently updated by this docs PR.
- Target deadline is 8 November 2026 23:59; actual release publication is 10 November 14:00:37 UTC. Actual LEB2 submission/any extension is unverified; retain real dates and obtain course guidance, never backdate.

No separate Deliverable 1 demo video, GCP URL or completed Docker/CI/CD deployment is required by this supplied rubric; those delivery gates belong to Lab 5. Cross-team UAT is Lab 6. No guaranteed grade or fully compliant original historical workflow is claimed.

<details><summary>Source-specific feature contracts and refinement history — old workflow states describe their recorded snapshots</summary>

The contracts/AC/STS and original source references below are retained. Their pending/review statements belong to those feature snapshots; current accepted outcomes are in the release index above.

## Authentication review contract — Issue #1 / PR #15

Refinement dated 31 October 2026, recorded in Issue #1 before adding boundary verification. FR-01, BR-04 and NFR-01/02 apply. Existing AC-01–AC-03 retain their original meaning; this section specifies which portions are reviewable in PR #15. It is not a backdated pre-implementation/TDD claim.

| Stable AC | Given / When / Then outcomes for this review unit | Actual/planned API/database test mapping |
| --- | --- | --- |
| AC-01 | Given a seeded Participant or Organizer and valid CSRF bootstrap, when valid credentials are submitted, then login/current identity return that account's server-derived identity without a password hash. Wrong passwords and unknown accounts return equal generic 401 INVALID_CREDENTIALS responses. Stored passwords are Argon2id hashes. Email is syntactically valid, at most 254 characters and normalized to lowercase; password is 1–256 characters. Valid-shaped boundary credentials reach authentication (wrong/unknown credentials → 401); malformed, empty, over-limit and extra identity/role fields return 400 VALIDATION_ERROR without authenticating. | T-01; AUTH-BOUND-02 (both roles, normalization, malformed/password-257/spoofed input); AUTH-BOUND-05 (email 254/255 and password 1/256) |
| AC-02 | Given a bootstrap session, when login succeeds, then cookie and CSRF token rotate and the old session cannot access identity. The old CSRF token cannot log out the authenticated user (403 CSRF_INVALID). A new API instance/pool sharing PostgreSQL and the session secret recognizes the session. Expiry is a fixed eight hours, not renewed by identity/CSRF reads; expired sessions fail with 401. Valid-CSRF logout returns 204, clears the cookie and destroys the stored session; revoked-cookie replay returns 401. | T-02 (rotation, expiry, logout cookie/store clearing/replay); AUTH-BOUND-01 (stale CSRF); AUTH-BOUND-04 (eight-hour cookie and persisted expiry, tolerance <10 seconds); AUTH-BOUND-06 (fresh instance and unchanged expiry) |
| AC-03 | Given no session, when identity/logout is requested, then 401. Missing/wrong CSRF on login or authenticated logout returns 403 CSRF_INVALID without granting or removing identity. Client-supplied role/user identifiers never grant identity; current database role changes take effect and a deleted account loses identity access. Production forwarded-HTTPS cookies are Secure/HttpOnly/SameSite=Lax and private responses are no-store. Twenty failed attempts from one IP trigger 429 LOGIN_RATE_LIMIT on the next attempt within 15 minutes on that API process; after the window, valid credentials work again. | AUTH-BOUND-01/02/03; T-13 (throttling and window recovery); T-14 (production cookies/cache); T-01/02 |

Inputs/preconditions: four synthetic seeded accounts in a dedicated disposable `*_test` PostgreSQL database, application instances sharing that DB and the synthetic test session secret, and valid or deliberately missing/incorrect synchronizer tokens. Tests assert HTTP codes, error codes, identity fields, password-hash exclusion, cookie rotation/flags, logout store deletion and persisted session expiry. AUTH-BOUND-06 advances only JavaScript Date by one minute; T-13 advances Date beyond the 15-minute limiter window. HTTP, timers and PostgreSQL remain real, and Date is restored in finally blocks. The cumulative suite retains FOUND-01/02, for twelve tests total. Hosted CI reruns the actual files on the reviewed head; its result, local logs and source identity are linked from Issue #1. See [Vitest controlled Date](https://vitest.dev/api/vi.html#vi-setsystemtime).

Expiry verification interprets the session table's timestamp in the PostgreSQL connection's timezone, matching the store's comparison with `to_timestamp(...)`; directly parsing that timezone-free value in a differently configured Node process gives a misleading offset. Local verification encountered Asia/Bangkok (Node) and America/Los_Angeles (PostgreSQL). The test still requires eight hours within ten seconds; no session behavior or tolerance was relaxed. See [node-postgres timestamp semantics](https://node-postgres.com/features/types) and [connect-pg-simple session expiry](https://github.com/voxpelli/node-connect-pg-simple).

The previously pending foundation checks M-FOUND-01–04 were executed on 31 October against the exact reviewed `a7a370c` source, exported separately with `git archive`. [Sanitized results](../evidence/sprint-1/foundation-acceptance-2026-10-31.json) record rejected constraints, unchanged seeded values/hashes/dates, restart persistence, connected/unavailable UI/API and configuration inspection. Controlled outage tests terminated only a disposable TCP proxy, leaving shared PostgreSQL running. [Connected](../evidence/sprint-1/foundation-connected-2026-10-31.png) and [unavailable](../evidence/sprint-1/foundation-unavailable-2026-10-31.png) screenshots support those execution results. The local snapshot build reused installed dependencies; clean install and Docker image build remain supported by the original hosted foundation check. This is follow-up evidence for the already reviewed foundation, not a claim of authentication-browser coverage or local Docker/GCP execution.

PR #15 exposes authentication APIs while its UI remains the foundation health page. A role returned by `/auth/me` is identity evidence; business-route authorization must be verified separately. These remaining course requirements are mandatory before Issue #6 accepts Sprint 1:

| Remaining acceptance outcome | Requirement / AC | Owning Issue / PR and planned tests |
| --- | --- | --- |
| Only Organizer publishes; ownership assigned by server | FR-02 / BR-04 / AC-04 | Issue #2 / PR #16; T-04 |
| Participant cannot read another participant's private registration | FR-04 / AC-09 | Issue #3 / PR #17; T-09 |
| Organizer can inspect only owned events/rosters; wrong role rejected | FR-05 / AC-10 | Issue #4 / PR #18; T-10 |
| Domain routes require authentication and mutation CSRF | AC-03, domain portion | Issues #2–#4 / PRs #16–#18; T-03 |
| Valid publication, persisted registration, duplicate/full/deadline rejection and competing last-place safety | BR-01–03 / AC-05–08 | Issues #2/#3 / PRs #16/#17; T-05–08 |
| Real role UI and selected desktop/mobile browser journeys | AC-12 / NFR-03 | Issues #12/#13 / PRs #19/#20; T-12 |

These outcomes are not counted as passed by this authentication-only snapshot. Seeded accounts suffice: self-registration, password recovery, email verification and multiple roles per account are not required for Sprint 1. Cancellation/capacity editing and attendance remain later-sprint work; GCP/completed delivery setup remain Lab 5 gates.

Authentication PR #15 received a [specific approval from poom2548](https://github.com/PhraewaS/event-system/pull/15#pullrequestreview-5727362625) at `21ea1c043178f17246978147182a0eb54649b49f` and was merged into staging at `f7ed362cd5c7eba07d8d7eba56bbf6aa50c8fe29` on 1 November 2026. Its exact-head twelve-test/build/Docker check and subsequent staging CI passed. The stakeholder confirmed that reviewer belongs to the other UAT group. Same-team reviewer guluJa subsequently recorded [authentication checks](https://github.com/PhraewaS/event-system/issues/1#issuecomment-6571670219) and [foundation checks](https://github.com/PhraewaS/event-system/issues/11#issuecomment-6571607308); Issues #1/#11 are retrospectively accepted/closed as of 2 November. The teammate reviewed recorded execution evidence and did not claim an independent rerun. Preserve both actual merges/reviews and the original process deviations: retrospective checks cannot recreate pre-merge review. Source references: [Express sessions](https://expressjs.com/en/resources/middleware/session/), [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), and the existing SRS/API/permission contract above.

## Publication review contract — Issue #2 / PR #16

Refined 1 November 2026 in Issue #2 before adding the publication acceptance checks. F-02, FR-02/03, BR-01/03/04 and NFR-01/02/04 apply. Existing implementation is retained; the new tests characterize its behavior rather than inventing an earlier implementation/TDD sequence. The feature branch incorporates the authentication staging merge above; same-team review remediation remains separately tracked in Issues #1/#11. No additional migration is needed: the existing event owner FK, capacity/text/deadline constraints and indexes apply.

| Stable AC | Given / When / Then outcomes | Actual API/DB/unit test mapping |
| --- | --- | --- |
| AC-04; AC-03 publication portion | Given no session, publication returns 401 UNAUTHENTICATED. Participant with valid CSRF gets 403 FORBIDDEN; Organizer with missing/wrong CSRF gets 403 CSRF_INVALID, with no event writes. Given a valid Organizer request, POST /api/events returns 201 and persists the server-derived owner. Forged role/owner fields return 400 VALIDATION_ERROR. Published capacity has no edit route (PATCH → 404) in Sprint 1. | T-04; PUB-BOUND-01; PUB-BOUND-03 |
| AC-05 | Given publication input, capacity must be a JSON integer 1–1,000,000; trimmed title/description/location lengths are 3–120 / 10–4000 / 2–200. Invalid/extra fields return 400 without inserts. Start/deadline are timezone-qualified ISO instants strictly in the future according to PostgreSQL; deadline ≤ start. Equal future start/deadline, exact text/capacity bounds and explicit timezone offsets are accepted and persisted as normalized values/instants. | T-05; PUB-BOUND-03; PUB-UNIT-01 |
| AC-PUB-01 (FR-03 discovery portion) | Given a published event, anonymous GET /api/events and /api/events/:id expose public event fields, organizer name, counts/remaining places and registrationOpen. A newly created API/pool reads the same PostgreSQL record; no private participant/password/session data appears. Malformed UUID/offset → 400 VALIDATION_ERROR; valid missing UUID → 404 NOT_FOUND. Lists contain at most 200 entries with offset/limit/nextOffset; following continuation covers the unchanged fixture without omissions/duplicates. | PUB-BOUND-02 |

Test preconditions: four synthetic demo accounts in the guarded disposable `*_test` database; seeded events plus valid/invalid requests; >200 synthetic events for pagination; one directly inserted registration fixture to verify public aggregate counts (this does not implement or claim a registration API). PUB-BOUND-02 creates a new API/pool after publication and closes that pool in finally. PUB-UNIT-01 tests the actual pure schema with no persistence mocks. Original T-04/T-05 and all twelve accepted foundation/authentication tests remain: eighteen tests total. Exact-head local/hosted results and source identity are recorded in Issue #2 / PR Checks.

The publication UI remains the foundation health page. Registration/last-place concurrency and private registration access remain PR #17; owned-event/roster authorization remains PR #18; role UI/browser journeys remain PRs #19/#20. They are mandatory before full Sprint 1 acceptance in Issue #6 and are not passed by this partial increment. Cancellation/capacity editing and attendance are later-sprint work; completed delivery setup/GCP are Lab 5 gates.

Definition of Done for this review unit: inspect the bounded publication diff; keep AC/tests traceable; local build and complete current suite pass; no configured secrets committed; required exact-head CI/build/Docker/evidence pass; independent Write-access teammate reviews the current head; reviewed staging merge and item acceptance are recorded before both Issue/PR cards become Done. While verification runs, both cards are Started and PR is Draft; ready checks move both to PR Review; findings move both to Fixing. Source references: [Zod validation](https://zod.dev/api), [PostgreSQL constraints](https://www.postgresql.org/docs/17/ddl-constraints.html), [node-postgres dates](https://node-postgres.com/features/types).

## Registration review contract — Issue #3 / PR #17

Refined 2 November 2026 in Issue #3 before adding acceptance checks. F-03 / FR-03–04 / BR-01–04 and NFR-01/02/04 apply. Same-team reviewer guluJa's specific publication review and subsequent APPROVED decision at `a81289c` preceded staging merge `466b6d1ef0da956c0eb60e6c9039ebffcc24663c`; Issue #2 is accepted/Done. This registration branch incorporates that source and retains all 18 prior tests. Additional checks characterize existing implementation; they do not recreate an earlier Issue-first/TDD sequence.

| Stable AC | Observable outcome and validation | Actual API/DB/unit tests |
| --- | --- | --- |
| AC-06 | Logged-in Participant + current CSRF + valid event UUID + empty JSON object → POST /api/events/:id/registrations returns 201 `{data:{id,eventId,participantId,createdAt}}`, with server-derived participant ownership and persisted counts. Own list/detail survive a fresh API/pool sharing PostgreSQL. Malformed UUID/body/extra identity fields → 400 VALIDATION_ERROR; valid missing event/record → 404 NOT_FOUND without inserts. | T-06/T-07; REG-BOUND-01 |
| AC-07 | One registration per participant/event in Sprint 1 (cancellation is deferred, so all records remain active). Duplicate → 409 DUPLICATE_REGISTRATION even when full/closed; new requests at/after deadline → 409 REGISTRATION_CLOSED; otherwise at capacity → 409 EVENT_FULL. Database time is checked after acquiring the event lock. Every rejection rolls back and releases the client; subsequent valid requests work. | T-07; four T-07 unit cases (before/equal/after, duplicate precedence, full boundary); REG-BOUND-02; REG-CONC-01 |
| AC-08 | Independent API instances/pools competing for one place → exactly one 201, one 409 EVENT_FULL and one row; simultaneous requests from the same participant → one 201, one 409 DUPLICATE_REGISTRATION and one row. A real blocked lock-wait request is rejected if the deadline closes before lock release. | T-08 (five distinct-participant races and one same-participant race); REG-CONC-01 |
| AC-09; AC-03 registration portion | Anonymous mutation/private reads → 401 UNAUTHENTICATED; Organizer registration/private participant reads → 403 FORBIDDEN. Participant with missing/wrong CSRF → 403 CSRF_INVALID; spoofed body fields → 400 without writes. Own detail → 200; foreign/missing IDs → equal generic 404 responses. Mine contains actual own rows only, at most 200/page with correct continuation and no duplicate/omitted IDs; private responses are no-store. | T-09 (both participants have own records); REG-BOUND-01/03 |

Workflow/data: Express authentication → Participant role → CSRF → UUID/strict empty-body validation → `registerParticipant`. A single checked-out `pg` client executes BEGIN; SELECT event FOR UPDATE; PostgreSQL clock/count/duplicate query; domain rejection or INSERT; COMMIT/ROLLBACK; release in finally. Existing UUID/FK and unique(participant_id,event_id) constraints remain; no new migration or mutable capacity counter is needed. Private SQL includes participant_id from the server identity. Event lock serialization covers calls through different API pools as well as one process.

STS inputs/preconditions: real disposable `*_test` PostgreSQL DB, synthetic accounts/events/registrations, independent API/pool instances and valid/invalid sessions/tokens. REG-BOUND-02 uses a pool with max=1 and proves recovery after rejection. REG-CONC-01 uses a separate transaction to hold the event row; a dedicated one-connection API pool's backend is observed in pg_stat_activity with wait_event_type=Lock and FOR UPDATE. Only then does the fixture close the deadline and release the lock; expected outcome is 409/no insert. It uses real I/O/database time and no fixed sleep or DB mock, and cleans up transaction, pending request and pool in finally. REG-BOUND-03 inserts >200 own fixtures plus another participant's registration and checks every page against actual caller-owned DB IDs. All 30 tests and the exact submitted source are verified through local/hosted evidence linked in Issue #3; the integrated full AC-11 constraint suite remains a separate release gate.

Scope exclusions: organizer-owned management/rosters (PR #18), role UI (PR #19), selected desktop/mobile browser journeys (PR #20), later cancellation/capacity edits/attendance, and Lab 5 GCP setup. The current UI remains the foundation health page. AC/API/database tests passing do not accept the full Sprint 1 product or cross-team UAT. Definition of Done: updated existing contracts, bounded diff/configuration inspection, passing production build/current suite and exact-head required CI/Docker/evidence, same-team guluJa review of the current head, reviewed staging merge and scoped item acceptance before Issue/PR cards move to Done. Ready work moves both cards to PR Review; findings return both to Fixing.

Technical references consulted for these checks: [PostgreSQL row locks](https://www.postgresql.org/docs/17/explicit-locking.html), [same-client node-postgres transactions](https://node-postgres.com/features/transactions), [PostgreSQL activity/wait monitoring](https://www.postgresql.org/docs/17/monitoring-stats.html), [Vitest waitFor](https://vitest.dev/api/vi.html#vi-waitfor). These references explain mechanisms; the supplied course brief and versioned SRS define the product rules.

## Organizer review contract — Issue #4 / PR #18

F-04 / FR-05 / BR-04; AC-10/11 and organizer AC-03; NFR-01/02/04. The plan was recorded in Issue #4 on 2 November before the test changes. Registration PR #17 received guluJa's [specific source/test review](https://github.com/PhraewaS/event-system/pull/17#pullrequestreview-5736769754) and subsequent [APPROVED decision](https://github.com/PhraewaS/event-system/pull/17#pullrequestreview-5737638998) at `1b913d1`, preceding staging merge `b225e83667b2c443c2a53edcf66c1e75d0ce9b7d`; Issue #3 is accepted/Done. This organizer branch incorporates that source and all 30 inherited tests.

Sprint 1 management comprises **listing owned events and inspecting their registrations**. It does not provide edit/delete/cancellation/capacity-change, ownership-transfer, check-in or attendance endpoints. The UI remains the foundation health page; actual role screens/browser journeys follow in PRs #19/#20.

| Stable AC | Observable API/database outcome | Actual tests |
| --- | --- | --- |
| AC-10, owned list | GET /api/organizer/events returns only the authenticated Organizer's events, with correct registeredCount/remainingPlaces. Both Organizers may have actual own data. A forged organizer/role query cannot change the server-derived owner filter. Lists are bounded to 200 with stable continuation, no missing/duplicate own IDs and no-store. | T-10; ORG-BOUND-01/02 |
| AC-10, roster ownership | Owner GET /api/events/:id/registrations → 200 with that event's registration ID/timestamp and participant ID/name/email only; own empty roster → empty 200 page. Empty/populated foreign event and valid missing event → equal generic 404 NOT_FOUND, with no roster exposure. Malformed UUID or invalid pagination → 400 VALIDATION_ERROR. Roster pages are bounded/complete, no-store and exclude other events/password/session fields. | T-10; ORG-BOUND-01/03 |
| AC-10, persisted/current permissions | A fresh API/pool reads the same owned events and roster from PostgreSQL. Role downgrade removes Organizer access (403); changed event ownership removes old-owner roster access (404) and permits the new owner. Fixture changes are restored and the pool is closed; no transfer API is implemented. | T-15; ORG-BOUND-04 |
| AC-03, organizer portion | Anonymous owned-list/roster requests → 401 UNAUTHENTICATED; Participant requests → 403 FORBIDDEN. Organizers cannot register or read private Participant registration views (403). Existing authentication and CSRF restrictions remain enforced. | T-03/T-10; ORG-BOUND-01; inherited registration denials |
| AC-11 | Capacity/role/deadline CHECK violations → SQLSTATE 23514; missing owner FK → 23503; duplicate participant/event → 23505. Invalid statements preserve the valid row and a later valid registration works. Migration/seed reruns preserve users/hashes, events/values/dates and registrations exactly, without duplicate setup. | Strengthened T-11; inherited foundation/setup tests |

Data/API: existing schema/migrations and indexes are reused. Authentication reads current identity/role from PostgreSQL; the private event list includes organizer_id from that identity. Roster handling checks the requested event ID **and** authenticated organizer_id before selecting registrations for that event. Parameterized queries are used throughout. Roster response is `{data:[{id,createdAt,participant:{id,name,email}}],page:{offset,limit:200,nextOffset}}`; list responses retain the existing event summaries. `offset` must be an integer 0–10,000,000; unknown ownership query fields cannot change the caller filter. No new migration or broad Organizer/admin bypass is introduced.

STS: real guarded disposable `*_test` PostgreSQL, two Organizer accounts plus synthetic Participants/registrations, owned and foreign empty/populated events, malformed/missing IDs, >200 owned events and >200 roster rows. ORG-BOUND-02/03 compare paginated results with actual fixture IDs and verify absence of foreign data; ORG-BOUND-04 creates a new API/pool after publication/registration and uses controlled role/owner DB fixtures with finally cleanup. T-11 now asserts specific SQLSTATEs and snapshots actual stored records/hashes before/after repeat setup, rather than accepting any database failure.

The synchronized baseline at `4af5ca0d09c017b883f8c0858ef6d47791b7a18b` ran 34 tests: 33 passed and T-10 failed because it expected the second Organizer's list to be empty, while accepted PUB-BOUND-03 creates two legitimate events for that account. [Source-linked execution evidence](../evidence/sprint-1/organizer-integration-baseline-2026-11-02.json) retains the actual command/output and source hash. T-10 now creates positive own data and checks exact owner-isolated IDs, excludes the foreign event and retains role/foreign-roster denials. This corrects an integration-test fixture assumption; it is not a claimed production authorization defect or invented domain TDD cycle. Four new cases characterize existing API behavior. The resulting suite has 38 tests; exact-head local/hosted evidence is linked in Issue #4 / PR Checks.

Definition of Done: existing contracts updated, bounded diff/configuration inspected, baseline and final execution retained, production build/current suite and exact-head required CI/Docker/evidence pass, same-team guluJa reviews/approves the current head, and reviewed staging merge/scoped acceptance are recorded before both cards move Done. Ready work moves both Issue/PR cards to PR Review; findings move both to Fixing. Full role UI/E2E, integrated release acceptance (Issue #6), Lab 5 deployment and Lab 6 cross-team UAT remain separate gates. Technical references consulted: [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [node-postgres parameters](https://node-postgres.com/features/queries), [PostgreSQL constraints](https://www.postgresql.org/docs/17/ddl-constraints.html).

## UI review contract — Issue #12 / PR #19

This unit connects accepted API workflows to React screens: public discovery/search/details, login/logout/current identity, Participant personal registrations/reservation, and Organizer publication/owned-event list/roster. It incorporates actual organizer staging merge `c414678f86c87a88e37b52b6971377a51febc37e`. Issue #12 recorded the refined AC/STS plan on 4 November before new acceptance checks. Selected browser journeys originally prepared for PR #20 are brought forward so UI review has actual screen execution; broader integrated verification/release evidence remain Issues #13/#6 / PR #20.

Architecture/data/API: React uses same-origin fetch with persisted session cookies. Mutations attach the current CSRF token, rotated after login and cleared after logout/CSRF rejection. Concurrent bootstrap shares one in-flight promise and releases it after success/failure. `collection` follows bounded offset/nextOffset pages. Screens use the server-returned role; the accepted backend independently enforces identity, role and ownership. No new API/schema/migration is introduced. Forms convert browser-local dates to ISO UTC; displayed times include a timezone. React renders text rather than injected HTML.

Routes/conventions: `/events` and `/events/:id` are public, `/login` signs in; `/my-registrations` requires Participant; `/organizer`, `/publish` and `/organizer/events/:id` require Organizer. Navigation follows the role; a direct disallowed route displays an access message. Anonymous private routes offer sign-in. Event login can return to the selected event. Resources show loading/empty/alert states; publication/reservation show confirmation. Invalid credentials retain the generic backend message; validation/409 errors are displayed without claiming success. A private 401 dispatches session expiry, removes identity/private navigation and replaces protected content. Anonymous startup `/auth/me` 401 is normal. Main content receives focus on navigation; inputs have labels, notices have status/alert roles, tables scroll within their container and styles adapt to 390px/1440px.

Stable AC-12 sub-IDs refine original AC-12 without changing accepted backend AC:

| AC | Observable outcome | Actual tests |
| --- | --- | --- |
| AC-12-01 | Valid login shows server identity/role; invalid login stays anonymous with generic error; logout removes identity and server identity returns 401; anonymous private route offers sign-in. | UI-REVIEW-01/02 |
| AC-12-02 | Participant navigation/direct routes exclude Organizer actions; Organizer can publish/manage; foreign roster has generic not-found and API rejects wrong role/owner. | UI-REVIEW-02; inherited T-03/T-10, ORG-BOUND-01 |
| AC-12-03 | Public discovery/search/detail show event/date/timezone/location/deadline/capacity/remaining places; no-match search is empty; full/closed actions disabled. | UI-REVIEW-01/03 |
| AC-12-04 | Positive-capacity publication persists and opens owned roster with confirmation; invalid deadline alerts and creates no event. Server remains authoritative. | UI-REVIEW-01/03; publication API/schema tests |
| AC-12-05 | Reservation confirms and survives reload; owner roster shows same participant/counts; second Participant cannot reserve full event. | UI-REVIEW-01 with SQL record comparison; inherited T-06–09 and REG-BOUND/CONC tests |
| AC-12-06 | Loading/empty/error feedback visible. A real expired stored session causes protected 401, clears identity/navigation/private content and obsolete CSRF token; in-app first-attempt re-login succeeds without reload. | UI-REVIEW-04; CLIENT-CSRF-03/04/05; defect #23 |
| AC-12-07 / NFR-03 | Selected journeys work at 1440×1000 and 390×844 without page overflow; labels/status/alert semantics and main focus observable. | UI-REVIEW-01–04 at both viewports |
| AC-12-08 / defect #22 | Concurrent bootstrap uses current token; failure retryable; login/logout/re-login works. Original assertions/red-green provenance retained. | CLIENT-CSRF-01/02; UI-REVIEW-01/02; [original failure](../evidence/sprint-1/csrf-red.txt)/[passing run](../evidence/sprint-1/csrf-green.txt) |

STS: UI-REVIEW-01 uses separate Organizer/Participant/second-Participant contexts, creates capacity-1 event, compares exact saved owner/participant via SQL, reloads personal list and inspects roster/full state. UI-REVIEW-02 checks invalid login, anonymous route, Participant direct route/API denial, logout revocation and second Organizer's foreign roster. UI-REVIEW-03 checks discovery/search empty state, invalid deadline/no insert, and a closed-event fixture. UI-REVIEW-04 holds a list request to observe loading, then explicitly injects empty/503 responses for UI state only; it expires a real PostgreSQL session and verifies 401 clears identity and first-attempt in-app re-login succeeds. Response mocks are not persistence evidence. Each case runs once per viewport, retries zero, using real API/DB except declared faults. All 38 accepted backend tests plus CLIENT-CSRF-01–05 remain: 43 unit/API/DB tests plus 8 selected browser cases.

Setup/evidence: production build first, `npm test -- --reporter=verbose`, then `npx playwright install chromium` and `npm run test:e2e`. Config starts built same-origin app on 127.0.0.1:3100, refuses server reuse and accepts only disposable `TEST_DATABASE_URL` ending `_test`. Run DB/browser suites sequentially; seed synthetic fixtures only in that database. JSON/HTML results, screenshots and failure traces live in ignored `artifacts/`, uploaded by existing CI with source hashes/submitted commit. No local Docker/Compose or GCP execution is claimed. Synchronized `6ce3539` baseline passed 40 tests. Most new browser checks characterize existing screens; the actual new session-expiry failure and fix are recorded separately below.

Defect #23 / AC-UI-EXP-01/02: UI-REVIEW-04 found that after a real stored session expires, following the SPA Sign in link submits the stale CSRF token and the first valid login fails. The initial browser run only reloaded pages; strengthening it to exercise the actual in-app path exposed the defect. At committed source `8bb4e2c7a742acedc1e89875de8e15040b0c948b`, focused client tests had 2 failures/3 passes and the desktop browser regression had 1 failure. [Actual red output/source hashes](../evidence/sprint-1/ui-expiry-red-2026-11-04.json) preserve that evidence before production changes. Issue #23 was recorded before the fix and natively linked to PR #19; both UI cards moved to Fixing. The correction clears the obsolete token in both private API/collection 401 paths before dispatching expiry. The next user-submitted mutation bootstraps the current session; no request is automatically retried and backend CSRF validation is unchanged. CLIENT-CSRF-03/04 require one successful login with a fresh token after each expired-read path; CLIENT-CSRF-05 ensures invalid credentials remain one failure without a false expiry event. These assertions and real browser first-attempt re-login pass after the correction. Defect #22's original concurrent-bootstrap evidence remains separate. This is a real new red/green change, not a claim about the reconstructed original implementation timeline.

Definition of Done: bounded diff/configuration inspection, existing contracts updated, green production build/43 tests/8 browser cases, exact-head required CI/Docker/evidence, full AC directly in PR, native links #12/#22/#23, actual same-team guluJa approval, resolved conversations and reviewed staging merge before scoped acceptance. Both Issue/PR cards become PR Review after checks pass; findings return both to Fixing. Defects #22/#23 stay open until reviewed integration and staging sign-in revalidation. PR #20/#21 stay Draft pending their parents. Event edit/delete, cancellation/capacity changes, check-in/attendance, full-sprint release, Lab 5 GCP and Lab 6 UAT are excluded. Sources: [React effects](https://react.dev/learn/synchronizing-with-effects), [Playwright web server](https://playwright.dev/docs/test-webserver), [network fault injection](https://playwright.dev/docs/network), [retrying assertions](https://playwright.dev/docs/test-assertions), [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [GitHub reviews](https://docs.github.com/en/pull-requests/reference/pull-request-reviews).

## Verification review contract — Issue #13 / PR #20

This unit verifies integration after accepted UI staging merge `484027edcaa3f4849b1f999fc0b3e1052be6a328`. The Issue #13 AC/STS plan was recorded on 6 November before new test changes. No application/API/schema behavior is changed. It preserves the 43 accepted unit/API/DB/client tests and eight UI-REVIEW cases, adds two distinct real browser integration journeys at both viewports (12 browser cases total), and carries genuine historical/post-merge evidence. The unaccepted older six-case `sprint1.spec.ts` duplicated UI-REVIEW-01–03, whose assertions were strengthened in accepted UI PR #19; it is superseded while accepted `ui-review.spec.ts` and all backend/client tests remain unchanged.

| AC | Observable acceptance outcome | Actual tests / evidence |
| --- | --- | --- |
| AC-VER-01 | Inherited 43 tests and eight UI cases remain passing: publication, persisted personal registration/owned roster, rule/permission/ownership denials, bootstrap/expiry/re-login. | Original test files unchanged from staging; UI-REVIEW-01–04; CLIENT-CSRF-01–05 |
| AC-VER-02 | Two separately authenticated Participants viewing an open capacity-1 event submit reservations → exactly one real API 201 and one 409 EVENT_FULL; one SQL row. Winner sees saved registration after reload, loser sees full/error/disabled with no false confirmation, owner roster shows winner and counts 1/0/1. | INT-UI-01 at desktop/mobile; inherited T-08/REG-CONC-01 still cover independent API locks |
| AC-VER-03 | 201 real owned-event fixtures plus foreign data → public discovery follows offset 0/200 and finds known page-two event; owned UI follows continuation and contains exact own IDs with no duplicates/foreign IDs. No page overflow at 1440×1000/390×844. | INT-UI-02 at desktop/mobile; SQL expected IDs and actual successful API response observation |
| AC-VER-04 | Record actual build/43 tests/eight browser cases on unedited merged UI staging before closing defects. Current execution records its own source/commit; older red/green/browser/manifest files retain original identities/counts and limitations. | [Staging revalidation](../evidence/sprint-1/staging-ui-revalidation-2026-11-06.json); required CI and generated source manifest |
| AC-VER-05 | Full scope/AC/STS/evidence/reproduction directly reviewable; required current-source build/tests/browser/Docker pass; native Issue #13 link, same-team guluJa review, resolved threads and reviewed staging merge before scoped acceptance. | PR #20 / Issue #13 / required build-and-test; no review or release acceptance inferred from tests |

STS/fixtures: INT-UI-01 inserts a capacity-1 event for the seeded Organizer, authenticates each Participant in its own browser context, loads the open action on both screens, then submits both. It waits for each actual POST response, determines winner/loser by status rather than a fixed account, compares the sole SQL row, checks personal reload and error/disabled state, and logs in as owner to verify the actual roster. It uses no route mocking or sleeps; browser actions overlap, while inherited independent-API tests remain the authoritative backend locking stress checks. INT-UI-02 inserts 201 synthetic events for the second Organizer with explicitly ordered old created_at fixtures so a known target is beyond page one, and keeps actual first-Organizer events as foreign data. It observes successful public/owned offset responses, searches the page-two event and compares all rendered private IDs to SQL. Each case runs on desktop/mobile, workers one and retries zero; pools and extra contexts close in teardown/finally. Separate files seed/reset only a guarded disposable *_test database, run sequentially and never modify the development database.

Evidence/provenance: on 6 November the assistant checked out actual staging `484027e` without edits and executed production build, all 43 tests including Client-CSRF and all eight selected browser cases (including real stored-session expiry and first-attempt SPA re-login), before recording UI/defect acceptance. The committed JSON includes that exact commit, source hashes, actual commands/output and raw-log hashes; the matching [staging CI](https://github.com/PhraewaS/event-system/actions/runs/42028856565) supports clean install/Docker. Local dependencies were reused; no local Docker/Compose/GCP or UAT execution is claimed. Legacy `test-results.txt` records 18 tests, `browser-results.txt` six cases, and `source-manifest.json` the original `305444a` snapshot; `tdd-red.txt` retains the original 501-before-implementation output. These are historical records, not this branch's results; the old red text is not assigned a new source identity. The newer CSRF defect evidence retains its separate original source references. These integration checks characterize accepted behavior; no new failing domain TDD cycle is fabricated.

Workflow/DoD: actual same-team current-source approval and staging merge of PR #19, followed by the recorded Client-CSRF/Login/Re-login staging revalidation, precede scoped acceptance/closure of Issues #12/#22/#23. This branch synchronizes accepted staging, resolves README-only conflict, retains accepted assertions, implements the recorded test plan, updates this existing SDS/README and inspects its bounded diff/configuration. Production build, 43 tests and 12 browser cases plus current required hosted Docker/source evidence must pass before PR #20/Issue #13 move to PR Review with guluJa requested and full AC directly in the description. Findings return both cards to Fixing; actual approval/reviewed staging merge and scoped acceptance precede Done/closure. Delivery PR #21 stays Draft while its parent awaits acceptance. Full staging/release acceptance remains Issue #6; completed GCP delivery Lab 5 and released-version cross-team UAT Lab 6. No new publication/registration/cancellation/capacity-change/attendance feature is introduced. Sources consulted: [Playwright assertions](https://playwright.dev/docs/test-assertions), [real response observation](https://playwright.dev/docs/api/class-page#page-wait-for-response), [local server lifecycle](https://playwright.dev/docs/test-webserver), [node-postgres transactions](https://node-postgres.com/features/transactions), [GitHub reviews](https://docs.github.com/en/pull-requests/reference/pull-request-reviews).


</details>

## Foundation review contract — Issue #11 / PR #14 (historical source)

This consolidates the original [Issue #11 contract](https://github.com/PhraewaS/event-system/issues/11) for complete repository/PDF contract coverage; it is not a new feature, execution or backdated pre-code contract. Scope: schema/migrations/seed and the initial UI→health API→PostgreSQL page at a7a370cd55e61cac012b89f1bc0114c8ab85aa58; supports F-01–04, BR-01/02 and NFR-01/02/05. Domain screens/auth flows were excluded at that stage and added later. The initial health-only UI has since been replaced by the accepted product screens.

| AC | Observable original foundation outcome | STS: level; preconditions/action → expected result; actual evidence |
| --- | --- | --- |
| AC-FOUND-01 | Fresh/repeatable DB schema, positive capacity/FKs/unique registration; seed twice gives four hashed users/three events and preserves IDs/values/hashes/dates; records remain after new app/connection. | FOUND-02 API/DB: disposable migrated DB, repeat migration/seed and fresh connection → same records. M-FOUND-01/02/04 manual/scripted inspection additionally checks SQL negatives, preserved field values and actual application restart; do not attribute all of these assertions to FOUND-02. |
| AC-FOUND-02 | With DB available health API gives 200/data.status=ok and original foundation UI says connected. After isolated DB outage API gives 503 DATABASE_UNAVAILABLE and original UI says unavailable without raw SQL/credentials. | FOUND-01 API/real DB covers 200. M-FOUND-03 separately exercises connected/outage API/UI using an isolated disposable proxy; screenshots/results recorded. No foundation automated browser suite existed. |
| AC-FOUND-03 | README/local configuration reproduces setup/build/health and two foundation tests; exact-head hosted build/tests/image/source upload pass; no real configured credentials committed. | M-FOUND-04 setup/config inspection; [foundation hosted run](https://github.com/PhraewaS/event-system/actions/runs/40909030366/job/123571616163) proves two tests/build/image at a7a370c. Local dependencies were reused; image build does not prove container runtime/GCP. |

UI/API/data: the historical health screen called GET /api/health and displayed connected/unavailable states; successful JSON and safe 503 errors follow the existing envelopes. Initial migration establishes users/events/registrations/session/schema_migrations and constraints described above. No login/domain UI was claimed for this partial foundation snapshot. Preconditions use a separate disposable *_test DB and synthetic accounts; never interrupt shared PostgreSQL to simulate failure.

Actual additional [foundation acceptance record](../evidence/sprint-1/foundation-acceptance-2026-10-31.json) and connected/unavailable screenshots retain their original source. DoD required documented setup, real persistence/constraints, no secrets, meaningful tests/build and independent review/integration. PR #14 missed pre-merge same-team review; guluJa's [retrospective assessment](https://github.com/PhraewaS/event-system/issues/11#issuecomment-6571607308) closed the scoped follow-up but cannot satisfy the original pre-merge sequence. Current release's 43 tests include FOUND-01/02; historical two-test/manual UI results remain separate.

## Feature-level SDS, acceptance criteria and STS (original implementation baseline)

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
| AC-12 | Complete browser journey works at desktop/mobile sizes       | UI-REVIEW-01–04 refine original T-12: publish/register/persisted view/roster, invalid login, forbidden routes, closed/full state, loading/empty/error/session expiry; no horizontal overflow |

Definition of Done for F-01–F-04: contracts precede code; meaningful failing tests are captured before implementation; linked tests pass against disposable real PostgreSQL; production build/browser critical journeys/migration/seed/setup pass; no real secrets are committed; the diff is inspected. GitHub Issue/board links, feature/fix PRs, actual independent teammate review, scoped staging integration and submitted-source evidence remain delivery gates; authors cannot self-approve. Current product acceptance is recorded in the release index and closed Issue #6. This definition does not erase the documented initial Git/TDD-history and #14/#15 pre-merge-review deviations or claim every historical step happened in the required order.

## Delivery and planned deployment

Sprint 1 must run locally; completed Docker/CI/CD and GCP deployment are due in Lab 5. Container definition and local Compose are provided for reproducibility. Planned GCP: built Node image in Artifact Registry → Cloud Run with Cloud SQL PostgreSQL and Secret Manager; migrations run once as a release job before traffic shifts. Persist all domain/session data in Cloud SQL, never container files. Lab 5 pipeline: build + real PostgreSQL API tests + selected Playwright tests; require passing checks and teammate review before staging/main merge; deploy accepted main releases via pipeline with explicit environment approval. GitHub branch protections are now configured for main and sprint1-staging as recorded below. Cloud pipeline/resources remain Lab 5 work; a workflow file alone does not establish a deployment.

Course workflow after repo creation: issues referencing FR/F/AC and this contract → feature/fix branches from `sprint1-staging` → reviewed PR into staging → integration tests → independently reviewed release PR to main → tag accepted commit. Record genuine local results tied to submitted commit; preserve red/green evidence. No invented issues, reviews, approvals or deployment claims.

Reviewer roles clarified by the stakeholder on 1 November 2026: PhraewaS/guluJa are the development team; poom2548/meebotsompurin-stack belong to the cross-team UAT group. The other developer reviews behavior, tests and changes against AC/current source and records actual checks/results/findings before approving new work. Accepted feature/fix/release records are linked in closed Issue #6. PRs #14/#15 retain real original merges and retrospective same-team checks in closed Issues #11/#1; those checks do not recreate the missing pre-merge sequence. Historical source-specific contracts preserve the earlier workflow states in their dated sections.

Cross-team UAT starts in Lab 6 on an actual released version. Record the release/tag or commit, tester, test/AC IDs, inputs and observable results; link defect Issues to fixes and rerun relevant cases against the subsequent released version. Cross-team UAT does not replace development PR review. Prior cross-team code approvals are historical feedback, not released-version UAT evidence. No cross-team UAT execution or acceptance is claimed at this stage.

## Official technical references consulted

- [React UI/state](https://react.dev/learn), [Vite](https://vite.dev/guide/)
- [Express security](https://expressjs.com/en/advanced/best-practice-security/), [Express sessions](https://expressjs.com/en/resources/middleware/session/), [PostgreSQL session store](https://github.com/voxpelli/node-connect-pg-simple)
- [Argon2 implementation](https://github.com/ranisalt/node-argon2), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [PostgreSQL locks](https://www.postgresql.org/docs/current/explicit-locking.html), [pg transactions](https://node-postgres.com/features/transactions), [parameterized queries](https://node-postgres.com/features/queries)
- [Playwright webServer](https://playwright.dev/docs/test-webserver), [Cloud Run persistence](https://docs.cloud.google.com/run/docs/container-contract#filesystem), [Cloud SQL from Cloud Run](https://docs.cloud.google.com/sql/docs/postgres/connect-run)

<details><summary>Original implementation, Git bootstrap and reconstructed review-series records — historical states and counts</summary>

These are dated provenance records, including the initial Git-after-red/green limitation. Their old pending gates, branch pointers and test counts are not current release claims. The accepted 7532716 results and remaining assessment limits are indexed above.

## Actual execution evidence

The original red run executed 15 tests against the transport/rule skeleton: 15 failed for the intended missing behavior, captured in `artifacts/tdd-red.log`. The first complete green run passed all 15 tests (`artifacts/tdd-green.log`). Six desktop/mobile browser scenarios also passed (`artifacts/e2e.log`, HTML/JSON reports and screenshots). Final additional security tests and the exact 390px viewport are verified below after execution. T-13 covers failed-login throttling (AC-01/03), T-14 production secure cookies (AC-02/03), and T-15 current-role enforcement and bounded input/pagination (AC-03/04/10). Source hashes and the real local commit are recorded by `node scripts/evidence.mjs` in `artifacts/source-manifest.json`.

Process limitation: the workspace had no Git repository or project remote. Local Git was initialized after the initial red/green cycle; the actual red log is retained, but no pre-implementation test commit or prior Issue/PR history is claimed. Contracts were written on disk before implementation. Remote issue/board setup, independent review and release acceptance must be completed with the team; do not represent the local history as a completed course delivery workflow.

Final verification, 29 October 2026: `npm run build` succeeded; `npm test -- --reporter=verbose` passed 18/18 tests across three files against real PostgreSQL; `npm run test:e2e` passed 6/6 Chromium scenarios at 1440px desktop and 390px mobile. No horizontal overflow was observed in the tested screens. Screenshots were visually inspected. The compiled `node dist/server/migrate.js` and `node dist/server/seed.js` commands were also exercised for local setup. This local verification did not validate Docker or GCP. Subsequent hosted validation is tracked in the GitHub Actions runs linked below; GCP remains Lab 5 work. The local feature commit is implementation work awaiting team review, not an accepted release.

The original increment supplied this combined engineering baseline and README as human-authored design/setup documents. GitHub bootstrap adds operational issue/PR templates and preserved execution evidence; it does not introduce duplicate design documents.

## Original GitHub bootstrap snapshot and release gates

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

Remote branches retain the real local history: main and sprint1-staging start at the contract baseline; feat/sprint-1 contains the implementation and bootstrap work. Both protected branches require GitHub Actions build-and-test (app ID 15368), up-to-date status, one independent approval, stale review dismissal and resolved review conversations; administrator enforcement, force-push and deletion restrictions are enabled. Authors cannot self-approve. Merge commits preserve the branch history; no administrative merge bypass is part of this setup.

The stakeholder requested Write access for guluJa. A repository invitation and project Writer access were issued; acceptance and an actual independent review remain separate events. Initial local TDD/build/browser evidence and a source manifest naming 305444a are preserved in [evidence/sprint-1](../evidence/sprint-1/). Hosted CI evidence identifies the later head commit. Existing source history was not rewritten to invent pre-implementation issues or tests.

Operational templates live in .github/ISSUE_TEMPLATE and .github/pull_request_template.md. They collect requirement/feature links, stable AC/STS IDs, scope/permissions and red/green evidence. They become the default repository templates after the reviewed release reaches main.

Bootstrap followed the official [repository CLI](https://cli.github.com/manual/gh_repo_create), [branch-protection API](https://docs.github.com/en/rest/branches/branch-protection), [Projects API](https://docs.github.com/en/graphql/reference/projects), [issue-form schema](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema), and [PR-template guidance](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository).

## Current review order

The stakeholder requested the separation used in [toktickit](https://github.com/PhraewaS/toktickit). Its [Issue #49](https://github.com/PhraewaS/toktickit/issues/49) / [PR #56](https://github.com/PhraewaS/toktickit/pull/56) demonstrate a bounded feature branch and dependency on an accepted contract; [verification PR #60](https://github.com/PhraewaS/toktickit/pull/60) and [release PR #63](https://github.com/PhraewaS/toktickit/pull/63) keep verification and release work separate. The table below replaces the old all-in-one review path; the bootstrap snapshot above is historical.

| Order | Issue / scope                                                          | Feature branch                             | PR                                                      | Initial reconstruction tests |
| ----- | ---------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------- | ---------------------------- |
| 1     | [#11](https://github.com/PhraewaS/event-system/issues/11) foundation   | `feature/sprint1-project-foundation-11`    | [#14](https://github.com/PhraewaS/event-system/pull/14) | Tests 2 passed (2)           |
| 2     | [#1](https://github.com/PhraewaS/event-system/issues/1) authentication | `feature/sprint1-authentication-1`         | [#15](https://github.com/PhraewaS/event-system/pull/15) | Tests 7 passed (7)           |
| 3     | [#2](https://github.com/PhraewaS/event-system/issues/2) publication    | `feature/sprint1-event-publication-2`      | [#16](https://github.com/PhraewaS/event-system/pull/16) | Tests 9 passed (9)           |
| 4     | [#3](https://github.com/PhraewaS/event-system/issues/3) registration   | `feature/sprint1-registration-3`           | [#17](https://github.com/PhraewaS/event-system/pull/17) | Tests 17 passed (17)         |
| 5     | [#4](https://github.com/PhraewaS/event-system/issues/4) organizer      | `feature/sprint1-organizer-management-4`   | [#18](https://github.com/PhraewaS/event-system/pull/18) | Tests 21 passed (21)         |
| 6     | [#12](https://github.com/PhraewaS/event-system/issues/12) ui           | `feature/sprint1-role-ui-12`               | [#19](https://github.com/PhraewaS/event-system/pull/19) | Tests 21 passed (21)         |
| 7     | [#13](https://github.com/PhraewaS/event-system/issues/13) verification | `feature/sprint1-verification-evidence-13` | [#20](https://github.com/PhraewaS/event-system/pull/20) | Tests 21 passed (21)         |
| 8     | [#5](https://github.com/PhraewaS/event-system/issues/5) delivery       | `feature/sprint1-github-delivery-5`        | [#21](https://github.com/PhraewaS/event-system/pull/21) | Tests 21 passed (21)         |

All eight local builds and their real PostgreSQL/unit suites passed. The verification snapshot also ran the six original desktop/mobile browser scenarios successfully. Tests introduced with later APIs/UI are not claimed for earlier partial snapshots. The initial reconstruction retained the original full API/security/rule/browser test sources and added FOUND-01/02 (real DB health/idempotent persistence, NFR-01/02) and AUTH-BOUND-01 (authentication/CSRF boundaries, AC-01/03): 21 tests plus six browser scenarios. The subsequent Issue #22 correction adds CLIENT-CSRF-01/02, so the current UI and downstream cumulative suites contain 23 tests plus the same six browser scenarios. The table records the initial per-unit runs, not later correction results. The original red/green evidence remains labelled with its original 305444a implementation source; this decomposition is not new historical TDD.

Staging was renamed to `sprint1-staging` without moving its commit or weakening review/check requirements. Only the first unit targets staging immediately. Subsequent PRs are dependent Drafts whose temporary base is the previous feature branch, so each diff contains its own bounded change. This is preparation for the serial workflow, not a claim that the dependency has been accepted. Once the parent PR is independently reviewed and merged into staging: update the child from staging, change its base to sprint1-staging, rerun checks at the resulting head and obtain independent approval. Do not merge dependent Drafts into feature branches or bypass protections to accelerate the sequence. After all units are accepted, Issue #6 covers actual staging integration/acceptance, a separate release PR into main and the accepted tag.

The original `feat/sprint-1` and PR #10 preserve the earlier combined implementation and hosted runs. PR #10 is superseded by the scoped series and is not an accepted/merged release. No original branch or review history was rewritten. Each PR in the table is now manually linked to its dedicated Issue through GitHub Development; PR #19 also links defect #22. Each Issue records its branch, scope, dependency and eventual staging target. Foundation moves to PR Review when its hosted check passes and an independent teammate is requested under Reviewers. Dependent units remain Draft/Started with blocked:dependency until their parent is accepted. Release acceptance remains Specified; Lab 5/later features remain Backlog. Done requires actual independent review, reviewed staging merge and acceptance for the item's scope, with evidence; inspect linked Issue state after merge rather than treating linkage or CI as completion.


### Historical demonstration pointer

Current complete source for local demonstrations: `feature/sprint1-github-delivery-5`. API/UI business behavior is preserved; only the API file's formatting differs, with an equivalent parsed syntax tree. Build/real-DB/browser results remain execution evidence, not assumed from this statement.

</details>

#### Repository workflow and project views

New work starts with an Issue and feature contract before creating a feature/fix branch from the current `sprint1-staging` head. The prepared dependency stack above is an explicitly reconstructed exception for existing implementation, not evidence of already accepted dependencies. A normal feature/fix PR targets staging. A release PR targets main only after actual staging integration/system/acceptance checks and independent review. Preserve real red/green execution evidence for meaningful rule/defect changes; do not invent earlier process history.

Manually link an Issue using Development; closing keywords alone do not establish the link when a PR targets a non-default branch. The Issue is the work/acceptance contract; the PR is its proposed change. Request the independent teammate in Reviewers; Assignees identify work ownership and do not replace review. A review must contain a specific check, question, finding or reason. Current main and sprint1-staging protection, verified 10 November 2026: one non-author approval, stale-review dismissal, strict required build-and-test, resolved conversations and admin enforcement; force pushes/deletions remain disabled. The owner-authorized `require_last_push_approval` option is false on both branches.

Policy chronology: on 10 November at 12:48 UTC, only main last-push approval was disabled to resolve the two-person-team deadlock after guluJa both merged the latest staging fix and approved release #24; staging was unchanged at that first action. At 13:12 UTC the owner separately authorized the same one-field adjustment on sprint1-staging. Before/after audits verified every other protection field unchanged. [Issue #6](https://github.com/PhraewaS/event-system/issues/6) retains both records. This optional GitHub setting is not the course requirement for independent teammate review; that requirement remains enforced.

All work retains every project item, including separately added PR cards. Development Kanban filters to `is:issue` and shows linked pull requests on Issue cards. Sprint 1 Kanban filters to `is:issue label:sprint:1`; Lab 5/later Issues remain visible in the broader backlog. Separate PR cards must use a status consistent with their linked Issue; they are not duplicate feature contracts.

| Status | Observable condition |
| --- | --- |
| Backlog | Later work or no committed/ready contract |
| Specified | Behavior, permissions, AC and tests specified; ready to start |
| Started | Implementation, dependency acceptance or integration work remains |
| PR Review | Reviewable scope, passing current checks and an independent review request |
| Fixing | Review findings or failed checks are being corrected and re-tested |
| Done | Specific independent review, reviewed staging merge and item acceptance recorded |

[Issue #6](https://github.com/PhraewaS/event-system/issues/6) is the closed acceptance record for product release v0.1.0; its final main checks/tag and evidence are complete. For new work, use its own Issue, feature/fix/docs branch and independent review; record actual scoped integration before Done. Issue #30 is this post-release documentation correction and remains separately tracked. Do not reopen the completed product milestone merely to imply these later docs are already in the original archive. Lab 5 delivery remains Issue #7.

Official workflow references: [manual Issue/PR linking](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue), [changing a PR base](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/changing-the-base-branch-of-a-pull-request), [project filters](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/filtering-projects), and [built-in project workflows](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations).

Accepted runnable application source: `v0.1.0` / main `7532716bbe96b8d7d9cea33b3b063ba16bf746d2`. Use the README setup for that release. Issue #30 records this documentation correction independently of product acceptance; subsequent staged docs or main updates require their own recorded review/integration.

<details><summary>Historical defect and delivery review contracts — original RED/GREEN sources and then-pending gates retained</summary>

The following records describe their original correction/review stages. #22/#23, delivery #21 and synchronization #28 are accepted through the recorded integration/release sequence; their old pending statements do not reopen them. Original failed outputs, assertions, identities and limitations stay unchanged.

### CSRF regression found during hosted review validation

[Issue #22](https://github.com/PhraewaS/event-system/issues/22) records a real intermittent sign-in failure in [delivery run 40902389931](https://github.com/PhraewaS/event-system/actions/runs/40902389931). Its trace showed pairs of GET /auth/csrf and GET /auth/me, followed by a 403 login and a visible security-token error. The CI job supplied NODE_ENV=test to the Vite build, enabling development behavior; React StrictMode repeats startup effects in development. Overlapping anonymous-session bootstrap responses could leave the client holding the token for an obsolete session.

CLIENT-CSRF-01 deterministically reproduced the failure using out-of-order session/token responses and a protected mutation; it failed with CSRF_INVALID before the fix. CLIENT-CSRF-02 checks recovery after initialization fails. UI commit 78d0dae shares one in-flight bootstrap Promise and clears it after success/failure; both regression cases and all existing tests then passed (23 total). Red/green outputs are preserved in evidence/sprint-1/csrf-red.txt and csrf-green.txt. Foundation commit a5aae66 sets NODE_ENV=production for the CI build step while retaining test mode for the test steps. Parent updates were synchronized through the Draft stack without merging a PR into protected staging or main. This is an explicit corrective change beyond the original preserved snapshot; no API business rule or original browser assertion was removed.

Official guidance: [React StrictMode startup effects](https://react.dev/reference/react/StrictMode), [Vite environment/mode semantics](https://vite.dev/guide/env-and-mode), and [OWASP session-bound CSRF tokens](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). Teammate approval and final staging/main acceptance remain pending.


## Delivery review contract — Issue #5 / PR #21

Plan recorded in Issue #5 on 9 November before these delivery changes. AC-DEL-01: named persistent PostgreSQL Compose storage, health → migration → app dependencies, required session secret and hosted Compose config validation. AC-DEL-02: current README setup/seed/configuration and 43-test/12-browser instructions explain main vs staging. AC-DEL-03: required Issue traceability/full PR Acceptance Criteria and ignored Windows folder metadata; no configured secrets committed. AC-DEL-04: accepted app/schema/tests unchanged; current build/tests/browser/config/image/evidence and actual same-team review/merge before scoped acceptance. AC-DEL-05: separate staging-to-main release PR remains Draft until accepted delivery integration and final staging evidence; default branch/main protections remain intact.

STS: DEL-CONFIG-01 is the hosted docker compose --env-file .env.example config --quiet check. DEL-MANUAL-01 inspects volume/dependencies/local seed commands, template AC/required fields, ignored paths and absence of configured secrets. REL-PLAN-01 verifies release base/main, head/staging, native Issue #6 link and pending independent approval. Existing 43 unit/API/DB/client and 12 browser tests stay unchanged. These config/docs checks do not invent a product TDD cycle. Docker is unavailable locally; image/config checks are hosted, and actual Compose runtime/restart persistence and GCP remain Lab 5 Issue #7.

GitHub homepage diagnosis: main still points to initial baseline cbbc70b while accepted application source is on staging. This is a missing release integration, not lost files. Update main through the reviewed release PR; do not force-push, upload private/generated local folders or change default branch merely to hide the release gap. Templates activate after main integration. Issue #6 records actual release acceptance/tag and pending course process deviations; no completed release/UAT/GCP claim is made by preparation.


## Browser authentication synchronization defect — Issue #27

The contract was recorded in Issue #27 before implementation, after first main CI at 0fb7e11408d86f33d97724c0830fd5f53eee7e1b passed build/43 tests but failed mobile INT-UI-01 (11/12 browser cases). The trace shows POST logout interrupted by immediate document navigation, old identity still visible and subsequent login rejected with 403; owner-roster assertions correctly failed. The bounded test-harness fix waits for successful logout, signed-out UI and me=401 before navigating, and checks the current login response email plus authenticated destination before returning from signIn. Both suites share that behavioral contract; app/API/schema are unchanged.

AC-AUTH-SYNC-01: server/UI account switch completes before private navigation. AC-AUTH-SYNC-02: preserve every original capacity/winner/loser/roster/security assertion, zero retries and default budgets. AC-AUTH-SYNC-03: retain actual main red execution, then source-specific build/43 tests/full 12 browser and hosted config/image evidence. AC-AUTH-SYNC-04: actual same-team review, staging integration, follow-up main release and main CI before Issue #6 release/tag acceptance. STS AUTH-SYNC-RED maps observed mobile INT-UI-01 to AC-01/02/03; AUTH-SYNC-GREEN runs both INT-UI-01 viewports and the complete inherited suite against real PostgreSQL; AUTH-SYNC-DIFF verifies only synchronization/docs/evidence changes. The original failure is saved in evidence/sprint-1/main-release-browser-red-20261110.txt. A fix readiness pass is not independent acceptance or a successful main release.

Official references: [Playwright authentication](https://playwright.dev/docs/auth), [async assertions](https://playwright.dev/docs/test-assertions) and [trace viewer](https://playwright.dev/docs/trace-viewer).


</details>

## Documentation correction contract — Issue #30

The [pre-implementation contract](https://github.com/PhraewaS/event-system/issues/30) defines AC-DOC-01–05: current README/release index, current SDS/history/policy separation, preserved provenance and date/Lab limits, two-document-only scope with unchanged v0.1.0 tag/assets, and independent reviewed staging integration. STS DOC-STATUS-01, DOC-PROVENANCE-01, DOC-SCOPE-01 and DOC-RELEASE-01 inspect those outcomes; DOC-CI-01 records current docs-head hosted checks plus Issue/PR/reviewer/project state. This wording-only correction adds no product tests or artificial TDD cycle. Actual validation/review/integration evidence belongs to that Issue and its linked docs PR; product acceptance remains the earlier v0.1.0 record.


## Deliverable baseline refinement contract — Issue #34

The [pre-edit contract](https://github.com/PhraewaS/event-system/issues/34) defines AC-BASELINE-01–07 and BASELINE-SRS-01, BASELINE-SDS-01, BASELINE-PLAN-01, BASELINE-EVIDENCE-01, BASELINE-SCOPE-01, BASELINE-RELEASE-01 and BASELINE-CI-01. It covers the whole-product SRS/trace/SDS, explicit three-sprint plan and repository evidence/handoff index in these two existing documents. Reviewer-requested AC-BASELINE-08 / BASELINE-CHECKPOINT-01 adds a concrete 29 November F-06 working slice and Issue #7 integrated main/GCP/evidence dependency, checked against Deliverable 2 sections 2, 3.3, 3.5 and 4.2; all outcomes are future plans, not new implementation or acceptance. This is a post-release documentation supplement, not a new product test cycle or completed submission PDF. Actual docs-head CI, independent guluJa approval, staging integration and unchanged v0.1.0 proof belong to that Issue/linked PR; main promotion remains separate.
