# PR #83 review response: date formatting and obsolete session responses

Tracking [Issue #81](https://github.com/PhraewaS/event-system/issues/81), implementation [PR #83](https://github.com/PhraewaS/event-system/pull/83). This is a review correction to the approved Q04/Q12 contract, not a new business rule or a new change request. It preserves the original contract-before-code and domain RED/GREEN history in [implementation-evidence.md](implementation-evidence.md).

## Review decisions

PhraewaS [requested changes on f868800](https://github.com/PhraewaS/event-system/pull/83#pullrequestreview-6043592208) on 24 November 2026 at 23:50:09 +07:00. All requests are accepted:

| Request | Decision and evidence |
| --- | --- |
| Compose YYYY-MM-DD with formatToParts; assert When in browser | Accepted. Locale presentation is not an API date contract. The helper now uses Gregorian/Latin numeric parts with explicit zero padding; UNIT-01b forces non-ISO locale output and checks year 0001. UI-04 now separately checks the When field, displayed quota date, outgoing API date and returned count. |
| Old account's late quota 401 must not log out the new account | Accepted. React cleanup ignored component state updates but did not stop api.ts from dispatching global expiry or clearing CSRF. Requests now capture a session generation; login/logout/actual expiry change it. Before using data or applying auth side effects, api/collection check that generation. Bootstrap and auth completion are guarded too. |
| Reproduce by switching accounts inside the app | Accepted. UI-02b holds the first account's quota response, signs out/in with app controls, loads the second account's real quota, then releases the old 200/401. A window marker proves the document was not reloaded. It asserts identity, current quota, no expiry alert, real /auth/me and a successful registration with the current CSRF token. |
| Update CI evidence links | Accepted. Previous hosted CI is recorded below with its own SHA and steps, separately from the corrected revision's required checks. |

No request is rejected. Original daily limit, timezone, error precedence, locks, schema and legacy-data policy remain unchanged. Current-session expiry still signs the user out: the existing CLIENT-CSRF-03/04 and real browser UI-REVIEW-04 checks remain passing. Old-account errors are not silently treated as current-session success: they reject locally with STALE_SESSION_RESPONSE and cannot alter the newer account.

## Additional RED → GREEN sequence

| Stage | Actual version/result |
| --- | --- |
| Tests before fix | `b042150`; adds locale-output regression, four old-response client tests, When assertion and two SPA response cases per viewport. |
| Preserved RED before correction | `52ab56e`; [client RED](../../../evidence/lab7/review83/red-client.txt): 5 failed / 7 passed; [desktop browser RED](../../../evidence/lab7/review83/red-browser.txt): late 401 removes the new account's Sign out control, 1 failed / 1 passed. No fixture/compile error is claimed as RED. |
| Correction | `f867d69`; only client/src/api.ts and client/src/event-day.ts change. Server domain/API behavior is untouched. |
| Targeted client GREEN | [12 passed](../../../evidence/lab7/review83/green-client.txt), same regression assertions; the subsequent full run below includes the final auth-completion guards. |
| Full regression / build | [81 unit/API/client tests passed](../../../evidence/lab7/review83/green-full.txt), [production build passed](../../../evidence/lab7/review83/build.txt). These ran on the unchanged working source subsequently committed as f867d69. |
| Browser regression | [28 passed, zero retries](../../../evidence/lab7/review83/browser-full.txt): 16 original + 12 quota browser executions, Microsoft Edge 157.0.4341.60; [structured results](../../../evidence/lab7/review83/e2e-results.json). Ran the committed correction; UTC When and late old 200/401 cases passed on desktop/mobile. |

Pure-client failure conditions are explicitly injected: UNIT-01b changes locale presentation, client tests hold fetch results, and browser UI-02b injects late response status/body. Login/logout, second-account quota and the follow-up registration use the real local API/PostgreSQL. These checks are not independent external UAT or GCP evidence. No test assertions were removed or weakened after RED.

Source hashes and local environment are in [verified-source-sha256.json](../../../evidence/lab7/review83/verified-source-sha256.json). Initial outputs are retained in their original paths; new results live under review83 and do not overwrite the previous 76/24 results.

## Hosted CI and remaining gates

- Initial PR #83 CI **passed** for `f868800bdb94b0729481300213ccfe3bda810dee`: [run 45438700271](https://github.com/PhraewaS/event-system/actions/runs/45438700271). It ran Chromium/browser checks, Compose validation and production Docker build. Preserved [run metadata](../../../evidence/lab7/review83/pr83-initial-ci.json) and [job/step conclusions](../../../evidence/lab7/review83/pr83-initial-ci-jobs.json) identify this source precisely.
- That successful run predates this correction and **must not be used as its CI result**. For the corrected latest PR head, use [PR #83 current checks](https://github.com/PhraewaS/event-system/pull/83/checks), verifying head SHA, workflow run and required check conclusions before approval/merge. Local Edge results alone do not establish hosted Chromium/Docker success.
- PhraewaS must review the corrected head again; the current Changes requested review is not an approval. Keep #81 open. Staging integration, reviewed main release, GCP revision and post-deploy checks remain later work.

## Selected visual evidence

- [Failing old-account 401 before fix](../../../evidence/lab7/review83/red-late-401-desktop.png)
- [Corrected late 401 desktop](../../../evidence/lab7/review83/screenshots/lab7-late-401-desktop.png) / [mobile](../../../evidence/lab7/review83/screenshots/lab7-late-401-mobile.png)
- [Corrected late 200 desktop](../../../evidence/lab7/review83/screenshots/lab7-late-200-desktop.png) / [mobile](../../../evidence/lab7/review83/screenshots/lab7-late-200-mobile.png)
- [UTC When/quota desktop](../../../evidence/lab7/review83/screenshots/lab7-utc-desktop.png) / [mobile](../../../evidence/lab7/review83/screenshots/lab7-utc-mobile.png)
