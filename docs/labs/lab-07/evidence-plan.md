# CR-L7-01: evidence and submission plan

Prepared 24 November 2026. **Plan only**; numerical results below are not invented or prefilled as passing.

Tracking: [Issue #81](https://github.com/PhraewaS/event-system/issues/81) and documentation [PR #82](https://github.com/PhraewaS/event-system/pull/82) are open. PhraewaS [requested changes on v1 / 758fc35](https://github.com/PhraewaS/event-system/pull/82#pullrequestreview-6042687973) on 24 November 2026 at 22:54:01 +07:00. This revision addresses those requests; final contract review/approval and implementation remain pending. Preserve v1 and this revision, rather than rewriting the initial review as approval.

## A. Preserve the required sequence (25 points)

| Stage | Record before moving on |
| --- | --- |
| Change request | Actual GitHub Issue #81, old/new rule, reason, scope, baseline/pre-change SHA; instructor approval waived according to [announcement source and original screenshot](approval-waiver-source.md) |
| Impact/contract | Versioned SRS/SDS/AC/STS excerpts in this documentation commit; teammate review on its exact SHA before implementation |
| Revisions | If reviewer changes timezone/count/legacy/error policy, revise contract and tests before code and preserve discussion/commit history |

Use the accepted Lab 6 SHA da02edd0258aed2aaf6847f87577a717e8f533e9 as reference. If later Sprint 2 work intervenes, separately record actual pre-change source and migration state; do not overwrite the historical accepted baseline.

## B. Test-first implementation and delivery (50 points)

1. After contract review, create implementation branch from reviewed sprint staging.
2. Commit changed-rule tests and any explained fixture isolation changes while application logic is still old; record domain RED (third same-day registration incorrectly succeeds) and preserved regression outcomes.
3. Commit implementation separately; run the same changed-rule assertions for GREEN, then full relevant regression.
4. Save local/CI commands, source/test IDs, timestamps, SHA, passed/failed/skipped counts, meaningful setup/assertions and selected raw output. Do not include only green icons.
5. Teammate PR review + passing CI → staging integration/checks → reviewed release PR to main → normal Lab 5 pipeline to GCP. No direct feature push to main or exercise branch deployment.
6. Record exact accepted main/revision/digest and post-deployment results. Smoke verifies readiness/assets; also execute changed quota and preserved critical domain/access checks on the deployed version.

Suggested version table: accepted Sprint 1 → actual pre-change → contract reviewed → RED test commit → GREEN code → integration/main release → GCP revision. Explain legitimate merge-SHA differences. Preserve the change separately from Sprint 2/3 features if they share a release.

## C. Five objective metrics (15 points)

Proposed observation window: **24 November 2026 00:00 +07:00 through the actual final snapshot, no later than 29 November 2026 23:59 +07:00**. Write the actual snapshot time, not an assumed future completion time. Scope is **PhraewaS/event-system only**, excluding PopQueue.

| Metric | Definition / source evidence to embed |
| --- | --- |
| M1 completed Issues | Issues completed in the stated window; list IDs and completedAt; separate duplicate/cancelled work from completed engineering tasks. Zero is valid. |
| M2 merged PRs | PRs merged in window; IDs, author/reviewer, mergedAt and base branch. Count each PR once; do not count comments as PRs. |
| M3 automated test result | One named current main suite/run: command, commit, passed/failed/skipped. Keep API/unit/client and browser rows distinguishable; do not add assertions to UAT case counts. |
| M4 known defect status | At snapshot, list defect IDs/subitems, severity, fixed/retested/pending or accepted limitation. #76-D1/D2 and the separate `1 places left` limitation have different dispositions; an Issue can hold multiple findings. |
| M5 CI outcomes | Top-level `CI & Docker Build` (`ci-docker.yml`) runs on main in the window; run IDs, attempt number and terminal success/failure/cancelled. Report in-progress separately. Do not double count reusable nested jobs or mix Deploy demo runs into this count. |

At least two values must be reconcilable from compact lists/output **inside the PDF**, not only external links. Define numerator/denominator if giving a percentage. A previous da02edd test run is baseline evidence, not the future release's run.

Interpret metrics in **at most 100 words**. Select one concrete evidence-based risk/action, with owner and next milestone; even healthy numbers need a specific preservation action, not a fabricated defect or generic “improve quality”. Fill this after observing actual results.

## D. Readiness and retrospective (10 points)

Readiness checklist records maintained Sprint 1 scope, change AC coverage, source/deployed version, failures/skips, known defect severity/status, technical debt, config/secret handling, setup/docs, CI/deploy and smoke/selected user checks. Decide READY/NOT READY from actual evidence. Sprint 2/3 completion is a separate product checkpoint.

Keep defect and technical-debt tables distinct: `1 places left` is a known incorrect UI behavior already accepted as minor, not automatically “technical debt”. Record deferred engineering work only with observed impact/priority/owner/action, or state none identified with the review basis.

Retrospective: answer **what helped / what hurt / what will change for final release**, one or two sentences each, tied to actual work and a concrete next action. Include member contributions, AI-use declaration and known limitations according to actual participation.

## PDF and shared project checkpoint

Submit one self-contained Lab 7 PDF through LEB2 by **29 November 2026 23:59 Thailand time**: members/IDs, repository/theme, baseline/pre-change/submitted main/deployed version; contents mapping Parts A-D to pages/evidence IDs; old/new contract and review; relevant complete test cases; code/test excerpts and actual output; metrics/source lists; readiness/retrospective/contributions.

Deliverable 2 is a **separate assessed PDF** due the same day: complete Sprint 2 plus meaningful tested Sprint 3 progress and integrated GCP candidate. The release may include both, but implementing unchanged backlog #8/#9 alone does not replace Lab 7's rule change. Keep full Sprint 2 acceptance identifiable.

Current status: Issue #81 / PR #82 creation and v1 teammate review are complete; Changes requested is not approval. CI [run 45427250212](https://github.com/PhraewaS/event-system/actions/runs/45427250212) passed for the previous proposal revision, not the new quota behavior. Renewed review/approval and CI for this revision, RED/GREEN, changed release and Lab 7 PDF remain pending; record their actual results as they occur.
