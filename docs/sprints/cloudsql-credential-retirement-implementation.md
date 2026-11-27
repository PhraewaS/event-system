# CP-v1 implementation / acceptance status — Issue #8

27 พฤศจิกายน 2026 · Author `guluJa` · Reviewer `PhraewaS` (implementation review pending)

**Scope:** implemented/tested บน local synthetic PostgreSQL17 และ mocked/offline adapters เท่านั้น ไม่ได้เปลี่ยน Cloud SQL/IAM/secrets/variables/SHA allowlist ไม่ deploy/เปิด lifecycle และยังไม่ปิด #8/#85

## Contract → RED → implementation

- Contract [PR #93](https://github.com/PhraewaS/event-system/pull/93) head94e99a3 ได้ PhraewaS APPROVED27/11/2026 19:20:59น. UTC+7; merge1407833เวลา19:21:06
- Branch `codex/sprint2-cloudsql-fence-implementation` เริ่มจาก1407833
- REDa753e91: existing release verifier ยอมรับ CP method เมื่อมีเพียงlegacy boolean/URL แต่ไม่มีbundle; existing migratorไม่ SET LOCAL ROLE หลัง BEGIN สองtestsรันถึงbehavior assertionsแล้วFAIL ไม่ใช่import/DBsetup failure ดู [RED](../../evidence/sprint-2/cloudsql-implementation/RED.txt)
- Implementation5c14d86: proof validator/release integration, explicit operator management+SQL inspection adapters, optional transaction-local migration owner, tests และ CI wiring สำหรับoffline tests

## AC / actual tests

| AC / STS | Actual implementation and verification | Current result |
| --- | --- | --- |
| CP-AC-01 / CP-01,02 | `retireCredentials` approval/window/freeze/disabled-lifecycle/role+instance checks; `credential-retirement.test.ts` rejects absent gates before calls | Local/mock passed; real permissions/inventory pending |
| CP-AC-02 / CP-03,04 | explicit isolated-role/profile checks; proof policy requires secret isolation/no unknown paths and exact numeric versions; missing isolation rejected | Offline/local passed; live secret/impersonation isolation must be attested/reviewed separately |
| CP-AC-03 / CP-05,06 | ordered reset→DONE→membership replace→DONE/readback; mocked HTTP usesqueryrole params and no password in URL; pending/denied/mismatch stop | Mock passed; no real API mutation |
| CP-AC-04 / CP-07,08,09 | real local old transaction+second DB session; password reset/revoke simulated by localadmin, terminateall, reconnect28P01, same credential before-control; network/unknown rejection blocked | Local PostgreSQL passed; not Cloud SQL proof |
| CP-AC-05 / CP-10,11 | owner OIDs/schema/ledger and SHA256 table fingerprints preserved; actual LOGIN/CREATEROLE/CREATEDB remain true and no falseNOLOGIN claim | Local passed; data/flags on GCP not changed or verified anew |
| CP-AC-06 / CP-12 | replacement-role register/persist/own/roster, visitor401/wrongrole403/foreign404, lifecycle-disabled503; inherited fullAPI/browser regression | Local passed; actual deployed journeys still pending |
| CP-AC-07 / CP-13 | failures never restore old password/privileges/access; operator library has no lifecycle/deploy action; legacy rollback tests still pass | Offline passed; no live rollback performed |
| CP-AC-08 / CP-14,15,19,20,21 | offline `verify_bundle` canonicalhash/pinnedreviewer+implementation, timestamps/window, exact proof/readback/request binding; positive decision, mismatched instances/versions, missingreview/unknown facts rejected; releaseenv binding checked | Offline passed; JSON attestation parser is not independent cloud/reviewer authentication |
| CP-AC-09 / CP-16 | noDeployworkflowchange; newCIstep runs offline tests only, no credentials; existing6fake-gcloud release guards and WIF isolation preserved | Implementation extends CP-aware gate after accepted design; no activation dispatch |
| CP-AC-10 / CP-17,18 | actual003 from001/002, ownerSET withINHERITfalse/true, ownerOID/backfill/ledger/no-op; missingSET/schemaCREATE42501 rollback; runtimeowner/DDLdenied | Local PostgreSQL passed; actual managed grant options/schemaACL still need real evidence |

## Execution evidence

| Check | Result / source |
| --- | --- |
| `npm run build` | Passed; server/clientTypeScript + Vite |
| Full `vitest run --reporter=verbose` |143passed/0failed/0skipped in19files, including27new CP/migrationtests; [output](../../evidence/sprint-2/cloudsql-implementation/full-regression.txt) |
| All Python deploy tests (PyYAML6.0.3 / Git Bash on Windows) |38passed/0failed/0skipped, including14CP-proof/release-context cases; [summary](../../evidence/sprint-2/cloudsql-implementation/GREEN.txt) |
| Browser regression / desktop+mobile |42passed/0failed/0skipped; localhost synthetic DB; [output](../../evidence/sprint-2/cloudsql-implementation/browser-regression.txt) |
| Bash syntax + deploy/teardown/release stubs |Passed; fake gcloud only, no real resources; Docker build awaits hosted CI (Docker not installed here) |
| Setup limitations |[Recorded separately](../../evidence/sprint-2/cloudsql-implementation/SETUP-LIMITS.txt); no weakening assertions/retries |

These counts are test-runner results, not a claim of21actualcloudcasesPASS. Tested runtime source5c14d86; later evidence/docs commits do not change runtime code. Hosted CI and teammate approval must be checked on PR head before merge.

## Remaining controlled steps

1. Independent implementation review/CI into sprint2-staging; keep issue open
2. Authorized managed role/membership/schema ACL and isolated runtime/migrator secret/profile provisioning; actual operator/instance mapping evidence still required
3. Explicit maintenance/mutation approval, actual management/session/data checks and independent immutableproofreview
4. Fresh readback and trusted proofpins; approved release integration and separately approved deploy/activation; selected post-deploy/persistence checks

The current workflow has no CP proof artifact auto-loader or new production inputs/variables. The code accepts only explicit private operator context; do not set legacy boolean/URLtrue to pretend CP readiness. [Operator component guide](../../deploy/cloudsql-credential-retirement.md) describes which external facts/trusted pins are still required. This local implementation does not declare Sprint2/Deliverable2 complete or replace required Sprint3 progress.
