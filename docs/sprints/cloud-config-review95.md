# PR #95 review corrections

28 November 2026 · Author `guluJa` · reviewer `PhraewaS`

Both requests in the review at 15:28:42 (UTC+7) were accepted. They tighten CP-AC-08 configuration observation and do not change business behavior, database schema or the offline-only release boundary.

| Review request | Correction / verification |
| --- | --- |
| Declared Cloud SQL volume may not be mounted | Require one uniquely named Cloud SQL volume for the intended instance, referenced by the container at exactly `/cloudsql`, in serving revision, service template and migration job. Missing mount, wrong name/path and conflicting mounts reject; correctly renamed volume/mount pair passes. RB-11. |
| Job can start after the first execution list | Repeat the full paginated execution scan near return and compare identities, UIDs and timing/status observations. Reject new running or newly completed executions, unknown reads and changed history. Also compare job executionCount/latestCreatedExecution, including a final job read after the last scan. RB-12. |

Design `e8641c3` preceded RED `eb34726`: 18 behavioral failures / 34 passes, not import or setup errors. Corrective runtime `fbee494` implements the checks. The current [GREEN record](../../evidence/sprint-2/cloud-readback/review95/GREEN.txt) has 54 passes / 0 failures / 0 skips. [RED output](../../evidence/sprint-2/cloud-readback/review95/RED.txt) is retained. Build and 39 existing offline deployment tests also passed. Hosted CI must be checked for the exact submitted PR head.

These are mocked API/transport checks. No real GCP reads, database operations, IAM/variables/SHA changes, deploy or activation took place. `releaseActivationAllowed=false` and the existing CP release hard stop remain unchanged. Repeated reads reduce undetected drift; they are not an atomic fence, do not prove all writer paths are frozen and cannot authorize activation. Separate approved freeze/concurrency controls and actual cloud/SQL evidence remain necessary.

This preserves Deliverable 2 §3.2 versioned test design/TDD/review and §3.4 actual-vs-pending traceability; the helper's tests do not establish Sprint 2 completion or deployed candidate acceptance.

API field references: [Container volumeMounts](https://docs.cloud.google.com/run/docs/reference/rest/v2/Container), [Execution identity/status](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.jobs.executions), [Job executionCount/latestCreatedExecution](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.jobs).
