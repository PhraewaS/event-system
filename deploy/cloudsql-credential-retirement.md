# CP-v1 implementation — operator preparation, not Cloud acceptance

Issue #8 · accepted contract [PR #93](https://github.com/PhraewaS/event-system/pull/93), head94e99a3, merge1407833 (27/11/2026 19:21:06 UTC+7)

## Components and execution boundaries

- `cloudsql-credential-retirement.mjs`: explicit operator library. `retireCredentials` checks approval/window/freeze/inventory/secret isolation/disabled lifecycle, instance+role binding, actual identities and positive control before management calls. Orders reset → completed receipt → membership replacement → completed receipt/readback → terminate all old sessions → password rejection28P01 → replacement and preserved baseline. Failure never restores old credentials or enables lifecycle.
- `cloudSqlUserManagement`: fixed Google SQL Admin API endpoint; injected token/password providers only. No ambient credentials, CLI auto-run, token/password logging or credential files. Imports do not call APIs. It replaces memberships using query parameters and waits for DONE; HTTP/operation errors stop execution. A direct adapter is a capability for the explicitly approved operator, not an authorization grant.
- `credential-fence-postgres.mjs`: explicit private profiles on the same DB endpoint, independent operator/old/runtime/migrator identities, owner SET/schema ACL checks, old sessions across all DBs and reconnect checks. Snapshots retain owner OIDs/schema/ledger and aggregate SHA256 hashes/counts of tables; private row contents never leave SQL in the snapshot. It does not authenticate to Google or prove instance provenance from a proxy URL.
- `server/src/migrate.ts`: optional `ownerRole` executes `SET LOCAL ROLE` after BEGIN on the same client before lock/ledger/DDL. CLI reads operator-only `MIGRATION_OWNER_ROLE`; unset preserves existing behavior. It validates the identifier and never grants memberships. Missing SET/schema rights fails with PostgreSQL42501 and rollback; ordinary web runtime does not select this profile.
- `verify_credential_fence.py`: offline proof policy only. Requires independently pinned proof hash/accepted implementation/reviewer/explicit decision approval, fresh reviewed proof/readback, all prerequisite attestations and exact request binding. Reports a gate decision with zero cloud operations, not a deployment result.

## Proof envelope and trust boundary

The envelope contains `proof`, `review`, `readback`, `request`. See `deploy/tests/test_credential_proof.py:fixture` for **synthetic test data only**; never copy its positive checks as real evidence. Proof hashes use SHA256 over UTF-8 JSON with sorted keys, compact separators, ensure_ascii=false and no nonfinite numbers; review/hash fields are outside the hashed proof body.

The approved hash/reviewer/implementation SHA must come from the independent accepted review/approval channel, not be accepted merely because the submitted JSON repeats them. This parser compares attestations; it does **not** authenticate a GitHub reviewer, query live IAM/private SQL or collect cloud evidence. Capture actual facts, review the immutable content, then have the authorized operator supply trusted pins separately. Missing/unknown facts stay blocked.

Proof verifiedAt must be at most15minutes old; readback at most5minutes old, after review; all timestamps include timezones and lie in the active approved maintenance window. A changed target/config/secret version requires new evidence/review. Method/flags remain truthful: credential rejection28P01 does not imply NOLOGIN28000; LOGIN/CREATEROLE/CREATEDB may still be true and the privileged migration path must be reviewed.

## Release integration remains opt-in and blocked by default

Existing strict fence remains the default method. CP validation is selected only by explicit `LIFECYCLE_DB_FENCE_METHOD=CLOUDSQL_CREDENTIAL_RETIREMENT_V1` in a future approved operator release context, with:

| Operator-supplied input | Meaning |
| --- | --- |
| CP_FENCE_BUNDLE_PATH | Private/sanitized reviewed proof envelope; no credentials |
| CP_APPROVED_PROOF_SHA256 | Trusted independently approved content hash |
| CP_ACCEPTED_IMPLEMENTATION_SHA | Reviewed implementation version |
| CP_APPROVED_REVIEWER | Independently verified approved reviewer |
| CP_ACTIVATION_APPROVED | Must explicitly be true for an activation decision |

`verify_lifecycle_release.py` also requires existing image/cutover/DB-fence confirmations and checks the bundle against PROJECT_ID/REGION/service/job/image SHA+digest of the intended release. CP mode without proof cannot use legacy boolean+URL alone. The state-aware candidate revision/roles/identities/secrets must equal fresh readback/intended request; a new post-activation revision is verified separately after a later approved deployment.

The current GitHub Deploy demo workflow is unchanged: no CP artifact downloading, new inputs/variables, SHA approval or activation dispatch is installed automatically. Do not manufacture a strict DB-fence confirmation to substitute for missing CP evidence. Wiring a real reviewed proof and fresh readback into an actual cloud release is a later controlled operator step requiring explicit authorization; this branch does not constitute that authorization.

## Before any real use

Independent implementation review/CI → approved instance/writer inventory and role/secret provisioning → actual window/freeze/backup → approved management/session operations → actual normal journey/persistence/access/migration evidence → independent immutable proof review → approved readback/request binding → separately approved deployment/activation. A merged code PR alone never satisfies these gates.

No real Cloud SQL user, membership, password, session, service, IAM policy, GitHub variable or lifecycle setting was changed during implementation/tests. Only disposable local PostgreSQL and mocked API operations are execution evidence in this branch. Cloud acceptance remains pending in #8.
