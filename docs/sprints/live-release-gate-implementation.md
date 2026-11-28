# Live release gate / Issue #8

28 November 2026. Author `guluJa`; reviewer `PhraewaS` pending. Base `9b804f6359fccbb779aeea89aa0493b9909c9f15` (merged #95). This is proposed implementation under accepted #93 sections 3.1/3.2, not actual Cloud acceptance or approval to operate.

## What changes

`release.sh` detects any CP context and dispatches to `live_release_gate.py`, then exits without falling into the ordinary migration/service-update path. The existing strict/legacy path and GitHub Deploy demo inputs/variables/WIF-only route are unchanged. The legacy Python validator still cannot independently accept CP booleans.

The coordinator validates reviewed proof and independently supplied trust, calls the #95 cloud collector through a metadata-only Node bridge, checks the full configuration review hash, verifies the approved SHA tag maps to the pinned image digest, and queries the actual role/database state through the official instance-bound Cloud SQL Connector. The SHA tag/digest lookup is not signed build provenance. Historical journey/backup/inventory/old-authentication facts remain reviewed attestations; the program never fabricates or independently replays those past events.

The SQL client reads only the two replacement secret versions over fixed Google endpoints into memory. URLs must contain the expected role/database and the exact Cloud SQL socket; host/option overrides reject. It authenticates both replacement DB identities, compares OIDs/direct attributes/membership graph, runtime isolation, owner schema access, old attributes/memberships and zero old sessions across databases. It has no old credential, user-management, session-termination, IAM or job-mutation operation.

## Trusted inputs and execution boundary

All existing `CP_FENCE_BUNDLE_PATH`, `CP_APPROVED_PROOF_SHA256`, `CP_ACCEPTED_IMPLEMENTATION_SHA`, `CP_APPROVED_REVIEWER` and `CP_ACTIVATION_APPROVED` requirements remain. Pins must be supplied through the independent approval channel, never copied from an unapproved proof to make it pass.

| Additional input | Requirement |
| --- | --- |
| `CP_ACCEPTED_RELEASE_GATE_SHA` | Exact independently accepted Git SHA of this execution checkout; tracked/staged/untracked non-ignored changes reject |
| `CP_APPROVED_CONFIG_SHA256` | Independently approved hash of complete service/revision/job templates and traffic; includes other environment/secret settings without logging their literal values |
| `CP_CHECK_ONLY` | Defaults `true`; observes only, does not acquire write barriers or patch resources |
| `CP_EXECUTE_APPROVED_ACTIVATION` | Defaults `false`; only the explicit pair `CP_CHECK_ONLY=false` and this flag `true` selects the future execution path |

The proposed request must already be manual image reuse (`ROLLBACK=true`, `ACTIVATE_LIFECYCLE=true`) with a valid proof. Those inputs describe the proposed action, not permission to execute: default check-only still performs zero mutations. Project/region/service/job/SHA/digest must equal the reviewed target before client construction. Omitted CP method with CP evidence never falls back to legacy booleans. A saved readback JSON cannot replace in-process capabilities.

For separately approved execution, the migrator holds SHARE locks over the six fixed existing tables in a transaction, re-reads all observations and validates freshness/source again. The coordinator sends one lifecycle-only service PATCH with the observed etag, preserving image, identities, secrets, volumes and all other environment settings. It clears the old generated revision name so Cloud Run creates a new one and requests latest traffic 100%. It waits for completion and checks the actual new ready revision/configuration/traffic. A pre-mutation rejection releases the barrier with the original gate=false unchanged. If PATCH may have started and its outcome/post-check is uncertain, **do not release the DB barrier automatically**: the client keeps the transaction alive, checks all six locks and polls metadata until the same compatible serving/template state is demonstrably lifecycle-disabled. It retries reads only; no automatic mutation retry, rollback traffic change, migration, seed or restoration of old credentials. An operator must arrange any separately approved recovery. Normal interrupt during polling does not release the barrier. Do not terminate the process while the outcome is unknown. A lost SQL connection/process cannot preserve session locks; retain independent external maintenance, report a critical unknown outcome and never claim safe recovery or success. This external maintenance requirement is mandatory, not replaced by the program's locks.

## Operator sequence after review (not performed now)

1. Independent PR review and exact-head CI, merge to `sprint2-staging`; retain feature/review/release history. No automatic merge/deploy to main is authorized by this document.
2. Obtain separate approval for the gate=false candidate deployment using replacement runtime/migrator identities and numeric secrets. The current live service still uses the old identity; merely provisioning new roles does not make this candidate observation pass.
3. Under a separately approved window, complete enforceable maintenance/freeze, backup, inventory, original credential positive control, fence/session actions and actual replacement application/migration/persistence/access verification. Follow the existing accepted runbook; no positive fixture may be used as real proof.
4. Collect the complete configuration hash with `python deploy/inspect_live_release.py --target /private/path/expected-target.json`, then review the configuration privately alongside the immutable proof. The target uses the existing exact `request` target schema; it is a proposed expected target, not a saved successful observation. This metadata-only command does not need a fictional completed fence proof, read DB secret payloads, acquire locks or mutate resources. Approve both content hashes, implementation and execution SHA through the independent channel. Keep literal environment values, passwords and tokens out of Git/PDF/logs. The Node bridge accepts its token only through a private stdin pipe and returns safe metadata/hash.
5. Install operator-only requirements with `python -m pip install -r deploy/requirements-live-release.txt`; provide Node24, gcloud and the authorized private operator login. Use a clean accepted checkout; keep private proof outside it. Do not install the connector in the application image.
6. Run the proposed request with check-only defaults. A verified result is fresh preflight evidence, not an executable receipt or approval for deployment. If the candidate/proof/window changes, obtain the required new review.
7. Only after explicit approval of actual activation, select the separate execution flags. The same process repeats observations under its barrier and conditionally updates the service. Retain actual results and complete independent post-deploy feature/persistence checks before closing #8.

No positive production example or fabricated approval values are provided here. The real proof still lacks completed old-credential fence/deployment and cannot currently authorize execution. No GitHub variables, workflow dispatch inputs, IAM/WIF settings or SHA allowlist were changed by this PR. Operator secret-read access is temporary and remains a recorded privileged path until its approved removal; this code does not prove all possible impersonation paths are closed.

## Verification / assessment mapping

Design `5df7cfb` preceded meaningful RED `45e1f13`: four failed behavioral assertions (two tests including subcases) against the existing offline-only decision. An earlier scaffold signature error was corrected before this RED and is not claimed as TDD evidence.

| Verification | Actual local result |
| --- | --- |
| LG-01–08/10 Python coordinator/transport/catalog/metadata-entry tests plus existing deployment tests | 70 passed, 0 failed, 0 skipped, including two actual local PostgreSQL barrier tests |
| LG-09 complete-config hashing/redaction + existing Node/API/DB tests | 223 passed, 0 failed, 0 skipped in 21 files |
| Server/client TypeScript and Vite production build | Passed |
| Shell syntax and offline deployment stubs | Recorded in GREEN evidence |
| Hosted CI/Docker / independent PR review | Pending exact pushed head |
| Real Google authentication/read/activation through this new coordinator | Not run; pending separately approved use |

Local PostgreSQL databases and roles are disposable synthetic fixtures on loopback. They are not Cloud SQL evidence. The 17 earlier real replacement-profile checks are operational preparation evidence in #8, not results of this new gate or permission to fence the old account.

CP-AC-08 maps to LG-01–10; section3.1 profile checks map to LG-04; unchanged contracts/AC and historical tests remain intact. Deliverable2 sections3.2/3.4 require versioned test design, meaningful RED/GREEN, independent review and honest traceability. Section3.5 still requires the actual integrated candidate and deployment evidence, including real Sprint2 acceptance and Sprint3 progress. Neither this PR nor its green tests establish full Sprint2/Deliverable2 completion.

References: [Cloud Run conditional service update](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.services/patch), [Service etag](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.services), [Cloud SQL Python Connector](https://github.com/GoogleCloudPlatform/cloud-sql-python-connector), [PostgreSQL explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html).
