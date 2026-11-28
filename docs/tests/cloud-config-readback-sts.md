# Cloud config readback — test design before implementation

28/11/2026 · #8 · accepted parent contract PR #93 / accepted offline-only boundary PR #94 (173da9f)

Scope: read-only collector for Cloud Run service + serving revision + migration job, SQL instance metadata, executions and Secret Manager version **metadata**. No secret payload access, SQL queries, mutation, dispatch, deploy or activation. CP release hard stop remains unchanged. This implements observation preparation for CP-AC-08, not complete activation integration.

| ID | Input/action | Expected result | Level |
| --- | --- | --- | --- |
| RB-01 | API fixtures match approved cloud target | cloudFieldsMatch=true; releaseActivationAllowed=false; SQL role/database/source-SHA evidence remains unverified | Mocked API |
| RB-02 | Change actual service/serving revision/job digest/identity/instance/DB secret version while expected proof remains unchanged | mismatch reasons, never fill observation from proof | Mocked API |
| RB-03 | split traffic, tag route, latest/serving revision mismatch, unready/reconciling generation | reject unsupported/unstable observation | Mocked API |
| RB-04 | secret latest/missing version/disabled metadata/literal DATABASE_URL | reject and redact all literal/private values | Mocked API |
| RB-05 | API denied/network/malformed/missing data | unavailable/blocked with generic reason; no raw response/error/payload in report | Mocked API |
| RB-06 | Service/job/secret changes during sequential reads | detect with second reads/etag+uid; no automatic retry or activation | Mocked API |
| RB-07 | old/running job execution on a subsequent page | reject; pagination fully exhausted or fail closed at budget | Mocked API |
| RB-08 | Resource names use project number instead of ID | canonicalize only after authoritative Resource Manager project-ID/number binding | Mocked API |
| RB-09 | Unexpected multiple containers/command overrides, wrong migration owner profile | reject unsupported Gather profile | Mocked API |
| RB-10 | Exercise production HTTP adapter with injected fetch/token | GET-only allowlisted endpoints; no :access, no SQL, no body/secret/token logging; no ambient credentials | Offline transport |
| RB-11 / review #95 | SQL volume declared but container mount missing, wrong name/path or ambiguous, in serving revision, service template or migration job | Reject; require unique named Cloud SQL volume bound to container at exactly /cloudsql | Mocked API |
| RB-12 / review #95 | Job starts after initial executions scan, finishes quickly, appears on a later page, or changes latest execution metadata | Repeat full paginated scan near return, compare execution identities/status and final job markers; reject any change or unknown read | Mocked API |

Review #95 additions above were specified before the corrective implementation. Stable completed execution history may pass, including API page order changes; a new completed execution must still fail because work happened during observation. Repeated reads remain non-atomic and never authorize activation.

All API fixtures are synthetic. Tests do not authenticate to Google or establish real GCP readiness. Runtime collection requires a privately supplied authorized token provider; this turn prepares code only. Normal env literals/API response bodies are never persisted or returned; only whitelisted metadata is emitted. Sequential reads are not an atomic cross-service transaction: future activation needs reviewed authoritative readback + mutation binding/concurrency controls and SQL proof, hence current hard stop stays.
