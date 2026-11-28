# CP-v1 implementation — operator preparation, not Cloud acceptance

> **Proposed live integration (28/11/2026, independent review pending):** this branch routes CP requests to `live_release_gate.py`. Default is check-only. The reviewed offline validator and #95 metadata collector retain their restricted scope; the coordinator additionally requires live SQL/catalog checks, an approved full-config hash and an accepted clean execution SHA. Actual Cloud acceptance/deployment remains pending. See [current runbook and limitations](../docs/sprints/live-release-gate-implementation.md). The description of unconditional blocking below is retained as the historical #94 boundary, superseded only after independent acceptance of this implementation.

Issue #8 · accepted contract [PR #93](https://github.com/PhraewaS/event-system/pull/93), head94e99a3, merge1407833 (27/11/2026 19:21:06 UTC+7)

## Components and execution boundaries

- `cloudsql-credential-retirement.mjs`: explicit operator library. `retireCredentials` checks approval/window/freeze/inventory/secret isolation/disabled lifecycle, instance+role binding, actual identities and positive control before management calls. Orders reset → completed receipt → membership replacement → completed receipt/readback → terminate all old sessions → password rejection28P01 → replacement and preserved baseline. Failure never restores old credentials or enables lifecycle.
- `cloudSqlUserManagement`: fixed Google SQL Admin API endpoint; injected token/password providers only. No ambient credentials, CLI auto-run, token/password logging or credential files. Imports do not call APIs. It replaces memberships using query parameters and waits for DONE; HTTP/operation errors stop execution. A direct adapter is a capability for the explicitly approved operator, not an authorization grant.
- `credential-fence-postgres.mjs`: `cloudSqlConnectorInspection` binds every SQL connection to one fixed instanceConnectionName through a caller-supplied official Google Cloud SQL Connector. Profiles contain user/password/database only; host/URL/stream/options overrides are rejected. Before reset, fresh Admin API instance metadata must match this connector binding. Plain URL/TCP/proxy inspection cannot assert a Cloud instance and cannot terminate sessions; no boolean override enables it. The caller owns/trusts the official connector/auth lifecycle; tests supply an explicitly labelled local double, not Google authentication evidence.
- SQL preflight reads operator/function/target privileges before reset and rechecks before subsequent mutations: EXECUTE on pg_terminate_backend plus effective pg_signal_backend or target-role privileges, respecting the superuser-target restriction and independent current/session identity. It does not probe by terminating a backend. Zero sessions alone is not authority proof. Snapshots retain owner OIDs/schema/ledger and aggregate hashes/counts without collecting private row content.
- `server/src/migrate.ts`: optional `ownerRole` executes `SET LOCAL ROLE` after BEGIN on the same client before lock/ledger/DDL. CLI reads operator-only `MIGRATION_OWNER_ROLE`; unset preserves existing behavior. It validates the identifier and never grants memberships. Missing SET/schema rights fails with PostgreSQL42501 and rollback; ordinary web runtime does not select this profile.
- `verify_credential_fence.py`: offline proof policy only. Requires independently pinned proof hash/accepted implementation/reviewer/explicit decision approval, fresh reviewed proof/readback, all prerequisite attestations and exact request binding. Reports a gate decision with zero cloud operations, not a deployment result.

## Proof envelope and trust boundary

The envelope contains `proof`, `review`, `readback`, `request`. See `deploy/tests/test_credential_proof.py:fixture` for **synthetic test data only**; never copy its positive checks as real evidence. Proof hashes use SHA256 over UTF-8 JSON with sorted keys, compact separators, ensure_ascii=false and no nonfinite numbers; review/hash fields are outside the hashed proof body.

The approved hash/reviewer/implementation SHA must come from the independent accepted review/approval channel, not be accepted merely because the submitted JSON repeats them. This parser compares attestations; it does **not** authenticate a GitHub reviewer, query live IAM/private SQL or collect cloud evidence. Capture actual facts, review the immutable content, then have the authorized operator supply trusted pins separately. Missing/unknown facts stay blocked.

Proof verifiedAt must be at most15minutes old; readback at most5minutes old, after review; all timestamps include timezones and lie in the active approved maintenance window. A changed target/config/secret version requires new evidence/review. Method/flags remain truthful: credential rejection28P01 does not imply NOLOGIN28000; LOGIN/CREATEROLE/CREATEDB may still be true and the privileged migration path must be reviewed.

## Historical #94 release boundary (before this proposed integration)

Existing strict fence remains the default method. The following CP environment names are reserved evidence inputs from the initial implementation; their presence is **not** a way to enable activation:

| Operator-supplied input | Meaning |
| --- | --- |
| CP_FENCE_BUNDLE_PATH | Private/sanitized reviewed proof envelope; no credentials |
| CP_APPROVED_PROOF_SHA256 | Trusted independently approved content hash |
| CP_ACCEPTED_IMPLEMENTATION_SHA | Reviewed implementation version |
| CP_APPROVED_REVIEWER | Independently verified approved reviewer |
| CP_ACTIVATION_APPROVED | Must explicitly be true for an activation decision |

`release.sh` rejects CP method/evidence inputs before any gcloud call, including requests with ACTIVATE_LIFECYCLE=false; `verify_lifecycle_release.py` separately rejects them too. Omitting the method while supplying CP evidence does not fall back to the legacy strict path. Fully valid/reviewed offline JSON is still insufficient. The standalone verifier retains its proposed positive comparison decision but returns scope=OFFLINE_ATTESTATION_COMPARISON_ONLY, liveConfigurationVerified=false and releaseActivationAllowed=false. It never authenticates to GCP or updates a service.

The current GitHub Deploy demo workflow is unchanged: no CP artifact downloading, new inputs/variables, SHA approval or activation dispatch is installed automatically. Do not manufacture a strict DB-fence confirmation to substitute for missing CP evidence. Wiring a real reviewed proof and fresh readback into an actual cloud release is a later controlled operator step requiring explicit authorization; this branch does not constitute that authorization.

The new branch implements the independent reads/composition described in the current runbook. The preceding paragraphs document the historical restriction, not the new check-only coordinator's interface. Do not interpret passing local/mock tests, merging this branch or collecting metadata as actual cutover/activation approval.

References: [Google Cloud SQL Connector](https://docs.cloud.google.com/sql/docs/postgres/connect-connectors), [PostgreSQL17 backend signaling permissions](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-ADMIN-SIGNAL). No connector dependency or ambient credential discovery is added to the application runtime; the explicit operator integration supplies the trusted connector.

## Before any real use

PR #96 review correction: before PATCH and before activation success, inspect the six granted SHARE locks on the held SQL backend. If the PATCH outcome is uncertain, poll the retained exact operation until it has a valid terminal result, then verify compatible disabled template/ready revision/traffic before releasing the barrier. An unchanged old disabled revision cannot settle a pending request. If no operation receipt was received, automatic settlement is unavailable: keep locks and external maintenance; arrange separately approved authoritative recovery. Do not retry PATCH, terminate the operator, or reopen writes on a timeout. A lost SQL barrier is a critical unknown outcome requiring external maintenance, never success. See [review disposition](../docs/sprints/live-release-gate-review96.md).

Independent implementation review/CI → approved instance/writer inventory and role/secret provisioning → actual window/freeze/backup → approved management/session operations → actual normal journey/persistence/access/migration evidence → independent immutable proof review → approved readback/request binding → separately approved deployment/activation. A merged code PR alone never satisfies these gates.

No real Cloud SQL user, membership, password, session, service, IAM policy, GitHub variable or lifecycle setting was changed during implementation/tests. Only disposable local PostgreSQL and mocked API operations are execution evidence in this branch. Cloud acceptance remains pending in #8.
