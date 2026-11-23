# Issue #76: regression evidence

Source report: https://github.com/PhraewaS/event-system/issues/76

This is developer regression evidence, not the external team's independent retest or acceptance.

## Version chain

| Stage | Commit | Meaning |
| --- | --- | --- |
| External blind-test snapshot | `3b2b7c3cbfef18753c3494ad7e8e6e9566ea85e3` | Two reported findings in #76 |
| RED | `a3fbb342345e8ba995abf685568b23f2bc95b357` | Adds reproducing tests; application remains defective |
| GREEN implementation | `8b9a2c3e1f30181ec772a8d1a7b5cc35ef9e142f` | Fixes validation and description wrapping; the regression assertions are unchanged |

Later evidence-only commits do not change the implementation or regression tests. Exact CI submitted SHA/run is recorded by GitHub Actions, separately from these local execution commits.

## Findings and disposition

| Finding / requirement | Classification and severity | Fix owner | Teammate reviewer | Fix status | Independent retest / final disposition |
| --- | --- | --- | --- | --- | --- |
| #76-D1 blank/whitespace location returns 500; AC-05 requires trimmed location 2-200 chars and invalid input to return 400 without inserts | Accepted defect; **Major** retained from the UAT report for team confirmation in this documentation review | **guluJa** | **PhraewaS** | Implemented; regression passed; reviewed and merged in #77, integrated into sprint1-staging by #78 | **Pending release/deployment and CrustCraft retest; keep #76 open** |
| #76-D2 long accepted description overflows; NFR-03 / AC-12-07 require readable desktop/mobile layout without horizontal overflow | Accepted additional defect; **Minor** retained from the UAT report for team confirmation in this documentation review | **guluJa** | **PhraewaS** | Implemented; desktop/mobile regression passed; reviewed and merged in #77, integrated into sprint1-staging by #78 | **Pending release/deployment and CrustCraft retest; keep #76 open** |

Severity rationale and priority are separate. D1 breaks the validation/error contract on the core publication form using ordinary whitespace input; the correction is required before accepting the exercise release. Valid inputs still publish successfully and database constraints prevent invalid rows; these facts limit its impact. D2 affects readability/layout for valid descriptions while stored data and access control remain intact; it is included in the same corrected release. Teammate review of this documentation follow-up will confirm the retained Major/Minor classifications.

## Integration record and current status

- [Fix PR #77](https://github.com/PhraewaS/event-system/pull/77): PhraewaS approved `a5721157d63bfa83f0a8970fb94f200849527fd0`; merged into the isolated exercise staging at `5b506e00bfbf84d052d3843d599612a1534c9b05`.
- [Integration PR #78](https://github.com/PhraewaS/event-system/pull/78): PhraewaS reviewed/approved the integration and requested explicit severity/owner/status records; merged into sprint1-staging at `34971cfaa62ebb4edf1c7daa02514bd674d84e30`. This documentation follow-up addresses that request without rewriting either merged PR.
- [Post-merge staging CI](https://github.com/PhraewaS/event-system/actions/runs/45123562628) passed at `34971cfaa62ebb4edf1c7daa02514bd674d84e30`. A later documentation commit/PR has its own CI identity and must not be represented as this already-tested SHA.
- **Pending evidence:** corrected main release SHA, corrected Cloud Run revision, post-deployment smoke result, and independent retest/acceptance. Fill these fields from actual release/deployment and UAT evidence later.

The second finding was not intentionally introduced: the stylesheet was unchanged between healthy main and the exercise snapshot. The normal-round report #75 remains a record of the cases that were actually tested. Its separate pluralization UI note (`1 places left`) is outside this correction and must remain recorded rather than claimed fixed.

## Commands and actual local results

Prerequisites: Node 24.19.0, PostgreSQL 17, a disposable `gather_lab6_fix76_test` database on 127.0.0.1:55461, and TEST_DATABASE_URL/DATABASE_URL pointing only to that database. Test suites truncate this disposable database. Never use the live application or Cloud SQL database here.

| Stage | Command | Result |
| --- | --- | --- |
| RED API | `npm test -- tests/sprint1.test.ts -t LAB6-76 --reporter=verbose` | 5 failed, 23 unselected/skipped; every new API case saw 500 rather than required 400; no inserts |
| RED browser | `npx playwright test --config .local/playwright.local.config.ts --grep LAB6-76` | 4 failed, 0 skipped: location status 500 and actual horizontal overflow at both widths |
| GREEN build | `npm run build` | passed |
| GREEN API/client/unit regression | `npm test -- --reporter=verbose` | 64 passed, 0 failed |
| GREEN browser regression | `npx playwright test --config .local/playwright.local.config.ts` | 16 passed, 0 failed, 0 skipped |
| Offline deployment checks | shell syntax + test_deploy_stub.sh, test_teardown_stub.sh, test_release_stub.sh | passed; no GCP access |
| Offline smoke unit tests | `python -m unittest discover -s deploy/tests -p test_smoke.py -v` | 12 passed |

Local Playwright uses the same checked-in tests and project viewports, with Edge's Chromium executable and a prestarted test server on 3116. The ignored local config changes only paths/reporter/browser executable/test-server lifecycle to work around Windows process teardown; no application routes, request responses or test assertions are mocked. CI uses the repository's normal Chromium runner and config on Linux.

## Assertions that demonstrate the correction

- API: `""`, `" "`, `"   "`, `"\t\n"`, and one-character `"x"` must return 400 / VALIDATION_ERROR with a location field error and leave the event count unchanged.
- UI: submit whitespace through the real publish form, require the location-specific error and no saved event, then correct the same form and require a successful persisted publication.
- Layout: publish a real 3,000-character unbroken description through the real UI/API; open it as an anonymous visitor; require exact text, multiple rendered lines, no text clipping, no document/text horizontal overflow, and unchanged stored description. Execute at 1440 and 390px.
- The fix uses `overflow-wrap: anywhere`; it does not shorten the description or hide horizontal content.

See [browser-summary.json](browser-summary.json) for measured widths and test outcomes; other files contain selected raw local runner output. No browser traces, cookies, account passphrases or local .env files are committed.

## Remaining gates

The fix review and staging integration in #77/#78 are complete. Obtain review of this triage-record follow-up and passing CI, then a reviewed release from sprint1-staging to main, successful deployment, post-deployment smoke checks, and CrustCraft's independent retest/acceptance of the exact deployed revision. Use `Refs #76`, not an auto-closing keyword, until that independent retest is recorded.

Historical CI detail: the isolated fix PR #77 targeted an exercise branch outside the repository's pull_request trigger, so its CI was dispatched manually at its exact SHA. PRs targeting sprint1-staging/main use the normal automatic CI trigger. Do not dispatch a production deployment from an exercise or documentation branch.
