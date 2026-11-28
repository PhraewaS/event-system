# PR #96 review disposition

Reviewer: `PhraewaS`, review of `cad3381acdeb288030a566bacf4fad18a3ebb3e0`, 28 November 2026. Author: `guluJa`.

Both requests are accepted under CP-AC-07/08; the approved feature contract is unchanged. This specification precedes the review correction implementation.

1. Recheck the actual transaction's six granted SHARE locks after token retrieval immediately before PATCH, and after the final revision read before reporting success. A lost barrier before send must result in zero PATCH requests. A lost barrier after send must never produce activation success; independent external maintenance remains mandatory.
2. Bind recovery to the exact submitted Cloud Run operation. Persist its validated operation name before polling. A pending operation, unreadable result, or missing operation receipt cannot be resolved by observing the old disabled revision. Continue read-only monitoring under the barrier. Only an authoritative terminal outcome for that operation followed by verified compatible disabled service/revision permits recovery to release the barrier. Never retry PATCH automatically. If no operation receipt was obtained, the program cannot prove settlement: keep external maintenance and the barrier; obtain separately approved provider/operator recovery rather than treating elapsed time or unchanged old state as proof.

Tests: R96-01 pre-send lock loss (including loss during token retrieval); R96-02 loss before success; R96-03 pending operation with old disabled service; R96-04 missing receipt; R96-05 terminal operation plus compatible disabled recovery; R96-06 real local transaction lock inspection. All transport fixtures are offline; local PostgreSQL evidence is not Cloud SQL evidence.

This review correction does not deploy, rotate old credentials, terminate real sessions, change IAM/WIF/GitHub variables, or activate lifecycle writes. Issue #8 remains open for actual approved cutover and acceptance evidence.

## Actual verification

Specification/RED commit `0110c51` records five behavioral assertion failures against the reviewed implementation. Correction `a363532` passes 82 Python tests (0 failed/skipped), including nine review-specific offline tests and four actual local PostgreSQL barrier tests. The local DB tests include full and partial lock inspection and loss of the held transaction. The metadata bridge/config collector tests pass 74 tests in two files; shell syntax passes and the offline release stub reports six PASS scenarios. Full commands, outputs, environment scope and file hashes are in [review evidence](../../evidence/sprint-2/live-release-gate/review96/GREEN.txt). Hosted CI and independent re-review must refer to the final pushed revision; old CI results are not reused as new-head proof. The earlier verification table in the implementation record describes the original round, not these corrected results.
