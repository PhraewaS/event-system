# CP-v1 live release gate - implementation plan / Issue #8

28 November 2026. Author `guluJa`; independent review pending. Parent: accepted PR #93 contract sections 3.1/3.2, CP-AC-08 and PR #95 metadata reader. This document versions the test design before the implementation. It does not approve any Cloud operation.

The current metadata reader and offline proof parser remain separate components. A new operator-only coordinator composes them with instance-bound, read-only SQL observations, an authoritative image-tag/digest lookup, and independently pinned execution-source/configuration identities. JSON proof or a saved successful readback alone must never authorize a service mutation.

## Scope and trust

- Default operation is check-only. The existing GitHub workflow gains no inputs, variables, SHA permissions or automatic CP activation. Normal/legacy release behavior remains unchanged.
- Trusted proof hash, accepted implementation, reviewer and explicit decision approval keep their existing semantics. Additionally pin the independently reviewed release-gate Git SHA and a SHA256 of the complete observed service/revision/job templates and traffic. These pins come from independent review, never from the proof's own assertions. A clean matching checkout is required.
- Fresh cloud reads reuse #95: ready gate=false serving revision, same image/identity/instance/pinned secret references, exclusive traffic, inactive and unchanged execution history, enabled secret metadata, etags and stable configuration.
- SQL uses the official Cloud SQL Connector bound to the target instance and only the two target replacement secret versions. Verify database, login identities, role names/OIDs/direct flags, runtime isolation, controlled migrator owner path, owner schema access and old sessions/attributes/memberships. No old password is read. Normal journey, backup, inventory and historical authentication proofs remain independently reviewed attestations; they are not manufactured by the coordinator.
- The registry lookup verifies the approved SHA tag resolves to the approved immutable digest. It is a version mapping, not a claim of signed build provenance.
- Check-only never acquires write-blocking locks, patches a service, executes a job or changes SQL/IAM/credentials.
- A future separately approved execution holds SQL SHARE locks over the six existing application/ledger tables to prevent writes during the final recheck and conditional service update. Require the declared freeze/window, repeat all live checks, and update only the existing service's lifecycle flag and latest traffic using its observed etag. Preserve image, identities, volumes, other environment and secret versions. No build/migration/seed/job mutation, password reset or session termination capability exists in this client. Verify the resulting revision; unknown outcomes do not pass or silently retry.
- If a PATCH may have started and its result/post-check is uncertain, retain the SQL barrier and retry reads only until the same compatible service is observably lifecycle-disabled. Never automatically release the barrier on an unknown mutation. Keep the transaction alive and verify its six locks. Process/SQL loss still requires independently maintained external maintenance; it is not safe recovery. An operator must perform any recovery mutation under its separate approval.

## Test design

| ID | Input / condition | Expected result |
| --- | --- | --- |
| LG-01 | Valid reviewed proof, exact trusted pins and authoritative observations; check-only | Verified decision; zero mutation/freeze calls |
| LG-02 | Missing proof/trust, method or request mismatch | Reject before live calls |
| LG-03 | Cloud mismatch, incomplete reader result, different complete-config hash | Reject; no mutation |
| LG-04 | Wrong DB/OID/role, direct or indirect runtime authority, invalid migrator profile, old sessions/attributes/memberships mismatch | Reject; no mutation |
| LG-05 | SHA tag maps to another digest, dirty/unaccepted execution source | Reject |
| LG-06 | Explicit execution with enforceable freeze and unchanged final observations | One conditional service activation; no job/data/credential changes |
| LG-07 | Freeze absent, config/SQL/source drift, expired proof during read | Reject before service update |
| LG-08 | Etag conflict/API failure/unknown or mismatched post-deploy revision | Stop; no retry, traffic fallback or success claim |
| LG-09 | Metadata reader serialization | Full-template changes affect review hash; plaintext environment values/tokens are absent from output |
| LG-10 | Existing default release, rollback, strict fence and WIF-only workflow | Existing regression retained; no new hosted activation path |

RED must exercise behavioral assertions against the old offline-only decision, not fail because a module/import/dependency is missing. GREEN is local/mock execution, not real fence/deploy evidence. Keep Issue #8 open and actual Cloud acceptance pending. Deliverable 2 sections 3.2/3.4/3.5 still require accepted integration and actual deployed feature verification; this code does not establish them.
