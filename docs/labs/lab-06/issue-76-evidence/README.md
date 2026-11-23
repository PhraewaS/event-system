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

| Finding | Requirement | Disposition | Impact and priority |
| --- | --- | --- | --- |
| #76-D1 blank/whitespace location returns 500 | AC-05: trimmed location 2-200 chars; invalid input returns 400 without inserts | Accepted defect; controlled exercise validation rule restored with field message | UAT proposed Major; fix before exercise acceptance. Valid publication still works and invalid rows are not persisted; 500 alone is not a universal severity rule. |
| #76-D2 long accepted description overflows | NFR-03 / AC-12-07: readable desktop/mobile layout without horizontal overflow | Accepted additional defect; wrap text without truncating stored/rendered content | Minor; included in the correction and independent retest scope. |

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

Teammate review, integration/release, successful deployment and independent retest of the deployed correction remain required. This fix PR must use `Refs #76`, not auto-close the UAT report before that retest. For this isolated staging target, the current CI workflow does not run on pull_request automatically; dispatch `ci-docker.yml` at the exact fix-branch SHA and inspect its completed result. Do not dispatch `deploy.yml` here.
