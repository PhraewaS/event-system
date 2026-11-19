## Problem and resulting behavior

<!-- Explain the concrete trigger and before/after behavior. -->

## Traceability

- Issue (link the work/acceptance contract, then also select it in GitHub Development):
- FR/BR/NFR and feature IDs:
- Contract/SDS:
- AC IDs → actual test IDs:

## Acceptance Criteria

<!-- Include the complete stable AC checklist directly here, with observable outcomes. Links alone do not replace the criteria. Keep acceptance pending until actual independent review/integration. -->

## Validation and evidence

<!-- Commands, real results, commit/run links, and relevant limits. Include red/green evidence for meaningful rule/defect/change work. -->

## Review and integration

- [ ] The relevant Issue is manually linked in Development. For a non-default target, closing keywords alone do not establish this link.
- [ ] Feature/fix PR targets the current sprint staging branch; release PR targets main. An existing reconstructed dependent Draft must wait for its parent, synchronize/retarget to staging and rerun checks before review/merge.
- [ ] Relevant build/tests pass and permissions/ownership failures are covered.
- [ ] No real secrets or unrelated generated files are committed.
- [ ] Documents and API/data contracts reflect the final behavior.
- [ ] A teammate checks behavior, tests and changes and records a specific finding/question/reason; authors do not approve their own PR.
- [ ] The independent teammate is requested under Reviewers when ready; Assignees alone do not request a review.
- [ ] Reviewed merge and item acceptance evidence are recorded before closing the Issue/moving to Done; linkage and green CI alone are not acceptance.
- [ ] Release PR only: staging integration/acceptance evidence is linked and the accepted release/tag is recorded after approval.

## Cloud Run readiness (Lab 2.5)

<!-- Complete for deployment-related PRs. Leave unchecked when not verified; see docs/cloud-run-readiness.md for source evidence and GCP gates. -->

- [ ] 1. Uploaded files are not saved in a local folder; use database bytes or Cloud Storage (or state that uploads do not exist).
- [ ] 2. Seed passwords come from environment variables, are not displayed, and seed reruns preserve existing data; production UAT seeding is explicit.
- [ ] 3. No development requester/login bypass or displayed default password; admin-created default passwords require first-login change if that feature exists.
- [ ] 4. Sessions are stored in the database, not server memory.
- [ ] 5. Server reads PORT and binds to 0.0.0.0.
- [ ] 6. /api/ready returns ready only after a database query, and 503 on database failure.
- [ ] Additional GCP gates in docs/cloud-run-readiness.md have evidence, or remaining gates are explicitly listed.
