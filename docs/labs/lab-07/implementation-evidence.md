# CR-L7-01: implementation / RED-GREEN evidence

> Subsequent status: [PR #83](https://github.com/PhraewaS/event-system/pull/83) is open, initial hosted [CI 45438700271](https://github.com/PhraewaS/event-system/actions/runs/45438700271) passed at f868800, and PhraewaS requested two UI corrections. See [review83-evidence.md](review83-evidence.md) for accepted requests, additional RED/GREEN, corrected 81/28 local results and current CI/review gates. The initial 76/24 snapshot below remains historical and is not the final corrected revision's result.

Recorded **24 November 2026 (Asia/Bangkok)**. Tracking [Issue #81](https://github.com/PhraewaS/event-system/issues/81). Status: **local implementation and verification complete; awaiting implementation PR / independent teammate review / hosted CI / integration / release / deployment**. No new production deployment is claimed.

## 1. Sequence and versions

| Stage | Exact source / actual evidence |
| --- | --- |
| Accepted post-Lab-6 baseline | main `da02edd0258aed2aaf6847f87577a717e8f533e9`, GCP `gather-00012-7lx` |
| Contract v2 | `d9978c6590f6b3dc0244c856a5cc81479b4d0763`; [PR #82](https://github.com/PhraewaS/event-system/pull/82); PhraewaS APPROVED 24 Nov 23:15:19 +07:00 after substantive review at 23:13:11 |
| Actual pre-change implementation | staging merge `639f67b570b51b8f4e0082601acca794c6961182`, merged 24 Nov 23:15:34 +07:00. Only documentation changed from accepted main; application/test baseline unchanged. |
| Test-first commit / primary RED | `9cdbba98e723ebc79d6e7e07c60b3dd50ae88d26`, 23:19:57 +07:00; test started 23:19:58; third registration returned **201**, expected **409**. |
| Remaining test design and preserved RED record | `56ed2c5`; adds unit/browser test sources before application implementation, preserves primary RED and unchanged-behavior regression output. |
| GREEN implementation | `e8c270f974641c8ac87868163874fd8b213a2d85`. Targeted/full unit/API/build ran on the then-working source and were committed unchanged in this commit; full browser run then executed this committed source. Source hashes are preserved with evidence. |
| Later gates | Not yet completed: implementation teammate review, hosted PR CI (Chromium/Docker), staging integration, reviewed main release, GCP and post-deploy new/preserved workflow checks. #81 remains open. |

The approved contract file retains its reviewed proposal text as a versioned record; this page and README provide subsequent actual status without relabelling the earlier proposal as completed at its original date.

## 2. What changed

- Participant → event row lock order inside a single checked-out PostgreSQL transaction; existing duplicate → deadline → capacity checks remain ahead of quota. DB clock is read after locks.
- Server-authoritative aggregate joins registrations to event start dates in Asia/Bangkok. Reject a third eligible event with 409 DAILY_REGISTRATION_LIMIT before insert. No in-memory quota authority.
- New own-only GET /api/registrations/quota?date=YYYY-MM-DD, placed before /:id; strict Gregorian date/query validation, server session identity and existing no-store response policy.
- Event detail shows the Thai event date and own quota, loading/error/retry, limit state and stale POST conflict. Existing registrations keep their navigation; keyed resource cleanup prevents old private results from painting for another account.
- No migration/backfill/deletion. Current schema counts every existing registration; >2 legacy rows remain readable. Sprint 2 cancellation/reactivation remains #8 work.

## 3. Actual local results

| Verification | Result | Embedded source |
| --- | --- | --- |
| Primary domain RED | 1 selected failure: expected 409, received 201; other 9 tests filtered out, not claimed passing | [red-domain.txt](../../../evidence/lab7/red-domain.txt) |
| Preserved regression before implementation | 64 passed, 0 failures | [preserved-before-code.txt](../../../evidence/lab7/preserved-before-code.txt) |
| Changed-rule API/unit GREEN | 12 passed | [green-quota.txt](../../../evidence/lab7/green-quota.txt) |
| Full unit/API/client regression | 76 passed, 0 failed/skipped | [green-full.txt](../../../evidence/lab7/green-full.txt) |
| Production build | TypeScript and Vite passed | [build.txt](../../../evidence/lab7/build.txt) |
| Full browser regression | 24 passed: 16 existing + 8 new (4 scenarios × 2 viewports), zero retries; local Microsoft Edge 157.0.4341.60 | [browser-full.txt](../../../evidence/lab7/browser-full.txt), [structured results](../../../evidence/lab7/e2e-results.json) |
| Offline deploy / teardown / release | Stub tests passed; no real gcloud calls or cloud mutation | [deploy](../../../evidence/lab7/offline-deploy.txt), [teardown](../../../evidence/lab7/offline-teardown.txt), [release](../../../evidence/lab7/offline-release.txt) |
| Offline smoke contract | 12 Python tests passed | [offline-smoke.txt](../../../evidence/lab7/offline-smoke.txt) |

Environment: Node **24.19.0**, PostgreSQL **17.11**, isolated local `gather_lab7_quota_test`. Tests never reset Cloud SQL or the deployed demo.

The first default browser attempt could not launch because local Playwright Chromium revision 1248 was absent. [Original attempt](../../../evidence/lab7/browser-first.txt) is preserved as an **environment failure, not a domain RED or successful run**. An ignored local config then selected installed Edge and the same existing test server/DB; [first Edge run](../../../evidence/lab7/browser-edge-first.txt) passed 8 new cases, followed by the full 24-case run above. Hosted Chromium and Docker image/Compose checks are still pending PR CI. No assertion was disabled to work around the missing executable.

## 4. AC / test sources and preserved behavior

- [Unit/API tests](../../../tests/daily-quota.test.ts): API-01–10 cover actual publication/registration, unchanged rejection priority, privacy, date boundary, competing independent DB pools with observed real lock waiters, legacy rows, fresh pools and >200-row reads.
- [Unit helpers](../../../tests/daily-quota-unit.test.ts): UNIT-01/02 cover exact Thai day/offset, strict calendar dates and remaining floor.
- [Browser tests](../../../tests/e2e/daily-quota.spec.ts): UI-01–04 cover real publish/reserve UI, read loading/error/retry (explicit injected network failure), stale snapshot, identity switch, legacy description, and UTC-browser Thai-midnight date/query/count checks at 390×844 and 1440×1000.
- Full existing 16 browser cases still verify publish/register/own record/owner roster, last-place contention, pagination, roles/ownership and Lab 6 Location/Description corrections.
- Q14 release/process evidence is only partially complete at this stage; local passing results do not prove a deployed release.

### Legitimate test fixture changes

`tests/sprint1.test.ts` now clears registrations between independent test cases so shared seeded users do not consume another test's daily quota. T-08 still runs five last-place races plus the duplicate race with unchanged capacity/error assertions; each iteration uses a separate event-start day, and the duplicate race a separate day. Existing bulk direct-DB fixtures are historical/read fixtures, not a claim that the new POST permits unlimited same-day registrations.

One new browser selector was corrected from `.registration-card` to the existing `.registration-row`; no domain assertion or expected result was relaxed. Primary RED API-01 assertions are unchanged between RED and GREEN. No production requirement was changed after contract approval.

## 5. Review and handoff

Open implementation PR from `codex/lab7-daily-quota` to `sprint1-staging`, **Refs #81**. Ask PhraewaS to inspect actual code, test assertions and raw evidence, especially participant/event lock ordering, Thai date validation, old rejection priority, privacy/identity state and regression fixture rationale. Wait for substantive review, latest-commit approval and required CI before merge. Preserve final review URL/commit/time.

After staging integration, follow the existing reviewed main release and Lab 5 deployment pipeline. Record exact main SHA/digest/revision and execute synthetic second/third same-day + next-day registration, private role/access and preserved owner/own-record checks on that deployed version. Only then complete release evidence/readiness/metrics/PDF and close #81 when its conditions are met. Do not reuse local results as GCP or independent UAT evidence.

Screenshots: [quota desktop](../../../evidence/lab7/screenshots/lab7-quota-desktop.png), [quota mobile](../../../evidence/lab7/screenshots/lab7-quota-mobile.png), [UTC desktop](../../../evidence/lab7/screenshots/lab7-utc-desktop.png), [UTC mobile](../../../evidence/lab7/screenshots/lab7-utc-mobile.png).
