# Cloud configuration readback — Issue #8

28 November 2026 · Author `guluJa` · reviewer requested: `PhraewaS`

PR #94 was approved at 14:57:00 and merged at 14:57:08 (UTC+7) on 28 November 2026. Accepted staging base: `173da9f021a7a39e733df934472cd9962f9d41e8`. [Staging CI 46123530365](https://github.com/PhraewaS/event-system/actions/runs/46123530365) succeeded. This branch prepares the deferred configuration observation component; it does not remove the release hard stop accepted in #94.

## Implemented scope

`deploy/read-cloud-configuration.mjs` compares Cloud Run service, actual serving revision, migration job, Cloud SQL instance attachment metadata and pinned Secret Manager version metadata with an explicitly supplied target. It checks project identity, digest, service accounts, exclusive traffic, instance connection, disabled lifecycle and migration owner profile. Reconciliation, active/unknown executions, metadata drift and unavailable reads fail closed. Only selected metadata is returned; environment literals, tokens, raw API responses and error bodies are not returned.

The HTTP adapter exposes GET metadata operations only. It has no CLI, ambient credential lookup, SQL, Secret Manager payload access, deploy or mutation capability. Calling it requires an authorized token provider supplied privately by a future reviewed operator integration. This branch has not authenticated to or read the real GCP configuration.

`cloudFieldsMatch=true` means only that the compared cloud metadata matched during those reads. `releaseActivationAllowed=false` is unconditional. SQL database/role OIDs, source SHA, all writer paths/permissions and other environment settings remain explicitly unverified. Sequential reads are not an atomic fence and do not establish production readiness. `release.sh` and `verify_lifecycle_release.py` are unchanged and still reject CP activation.

## Evidence and traceability

| Stage | Source / result |
| --- | --- |
| Test design before implementation | `62ae79b`, [RB-01–RB-10](../tests/cloud-config-readback-sts.md) |
| RED | `8ed511c`; matching synthetic API data reached an assertion: expected true, received false because the initial reader was unimplemented; [record](../../evidence/sprint-2/cloud-readback/RED.txt) |
| GREEN | 34 mocked-API/transport tests passed; [record](../../evidence/sprint-2/cloud-readback/GREEN.txt) |
| Existing deployment regression | 39 offline Python tests passed, including rejection of valid CP proof before any gcloud call |
| Build | Server/client TypeScript and Vite passed |
| Hosted regression / Docker | Check the CI result for the exact submitted head; prior staging CI does not certify this branch |

No real database, GCP settings, IAM, WIF SHA allowlist, GitHub variables, deployment or lifecycle state was changed. No issue is closed by this work. Full CP integration and actual cloud cutover/acceptance remain pending and need separate review and authorization before system changes.

## Review before merge

Review the scope/unknowns, GET-only adapter, redaction, mismatched serving config, pagination and drift cases. Confirm existing CP release rejection tests still pass. Target `sprint2-staging`, relate to #8, and do not use a closing keyword for #8. This PR is not a release request.
