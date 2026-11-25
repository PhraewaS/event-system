# F-05A implementation / verification record

25 พฤศจิกายน 2026 · Developer `guluJa` · independent reviewer `PhraewaS`

**Status: implemented / locally verified; NOT YET accepted in staging or released.** F-05B #85 และ F-06 #9 ยังแยกเป็นงานถัดไป งาน F-05 รวมใน #8 ยังไม่ปิด

## Contract → test-first → implementation

| ขั้น | Version / หลักฐาน |
| --- | --- |
| Baseline release | e2b9842; Lab7 quota และ Lab6 fixes คงเป็นฐานเดิม |
| Contract review | [PR #86](https://github.com/PhraewaS/event-system/pull/86): PhraewaS APPROVED9477808 วันที่25/11/2026 16:13:03น. UTC+7 |
| Accepted staging | bb5aecc1a7a12a8c39e915bb390bb4f61759baed; merge16:14:08 ก่อนเริ่ม feature branch |
| API test-first | e5cf5c1; `S2-A-API-01` คาด cancel200 แต่ API เดิมตอบ404; [RED](../../evidence/sprint-2/f05a/red-cancellation.txt) 1 failed/8 filtered |
| Release test-first | 07de0f3; fake gcloud แสดงว่า helper เดิมยอมรับ unverified rollback; [RED](../../evidence/sprint-2/f05a/red-release-gate.txt) ไม่ใช่การเข้าถึง GCP |
| Implementation | a5bed71; migration003, lifecycle API/UI/ACTIVE counts และ guarded manual image reuse; primary API assertions คงเดิม |

Feature branch: `codex/sprint2-registration-lifecycle-8` จาก stagingbb5aecc. Hosted CI/teammate review/merge/release ต้องบันทึกหลังเกิดจริง ไม่ใช้ผลของ #86 แทน

## Actual verification — initial submission 81e28e1

Local runtime: Node24.19.0, PostgreSQL17, Edge157 ผ่าน Playwright ที่390×844 และ1440×1000; ฐานใหม่ `gather_sprint2_lifecycle_test` และ `_upgrade_test` บน127.0.0.1:55462 ไม่ใช้ Cloud SQL

| ชุด | คำสั่ง | ผล / ขอบเขต |
| --- | --- | --- |
| Build | `npm run build` | ผ่าน TypeScript/API/frontend; [output](../../evidence/sprint-2/f05a/build.txt) |
| Full unit/API/DB/client | `npm test -- --reporter=verbose` | 96 passed/0 failed/0 skipped; [output](../../evidence/sprint-2/f05a/full-tests.txt) |
| Browser regression + lifecycle | Playwright ทุก4spec files ด้วย `.local/playwright.config.ts` (managed local server/Edge) | 32 passed/0 failed/0 skipped, retries0; [output](../../evidence/sprint-2/f05a/browser-results.txt); CI ใช้ committed config กับ Chromium |
| Release compatibility gate | `python3 deploy/tests/test_lifecycle_release.py` | 4 passed; fake gcloud ไม่มี cloud mutation; [output](../../evidence/sprint-2/f05a/green-release-gate.txt) |
| Preserved delivery helpers | `bash deploy/tests/test_release_stub.sh`, `test_deploy_stub.sh`, `test_teardown_stub.sh` | ผ่าน checks เดิม; outputs ใน evidence folder; ไม่ใช่ผล deploy/teardown จริง |

Full tests มี15เคสเพิ่มจาก baseline81: lifecycleAPI10, upgrade/compatibility3, boundary/configunit2. Browser มี2scenarioใหม่×2viewport รวมกับ28เดิม; ผล targeted4cases ไม่ใช่ผล full32

## Completion / AC-to-actual-test matrix

| AC | Actual file/test IDs | ผลที่ตรวจ / สถานะการยอมรับ |
| --- | --- | --- |
| S2-A-01 | `registration-lifecycle-upgrade.test.ts`: DB-01a/b/c; `deploy/tests/test_lifecycle_release.py`; lifecycle-unit config test | Local upgrade/defaults/real e2b9842 API coexistence และ state-aware fallback ผ่าน; actual cloud cutover/rollback target ยัง pending |
| S2-A-02 | `registration-lifecycle.test.ts`: API-01 | cancel200 คืนที่นั่ง/quota; own ID/status persist ผ่านต่างpool |
| S2-A-03 | same: API-02 | repeated cancellation หลังdeadline/gatefalseคงค่าเดิม |
| S2-A-04 | lifecycle-unit UNIT-01; API-03/03b | exact equality unit + DB clock หลัง observed event-lock wait |
| S2-A-05 | API-04 | reactivation200 ใช้ID/createdAtเดิม; ACTIVE/cancelledAtNULL; insertใหม่201 |
| S2-A-06 | API-05 | duplicate/closed/full/quota precedence และ no-write rejection |
| S2-A-07 | API-06 + inherited daily-quota suites | ACTIVE-only >200/legacy3, date/person isolation; legacyไม่ลบ |
| S2-A-08 | API-07 | Visitor/role/owner/CSRF/strict-input failures จาก backend พร้อม DB snapshot |
| S2-A-09 | API-08 | independent pools มี participant-lock barrier/observed wait; cancel/cancel, reactivate/reactivate, cross-event quota และ cancel/register |
| S2-A-10 | `tests/e2e/registration-lifecycle.spec.ts`: UI-01/02 สองviewport | cancel/reload/reactivate IDเดิม, owner/public/own checks และ stale deadline rejection |
| S2-A-11 | API-09, DB-01c | public/owner/own/quota ตรงกับstate; CANCELLEDยังอ่านของตนได้ |
| S2-A-12 | inherited Sprint1/Lab6/Lab7 tests + full suites | assertionsเดิมคงอยู่; test login helper เพิ่มการรอ logout จบก่อน hard navigation |

รหัส API/DB/UNIT/UI ในตารางย่อจาก S2-A-*; ตารางนี้เป็น **local verification ไม่ใช่ independent acceptance**

## Selected UI evidence

screenshots สร้างจาก synthetic fixtures; แต่ละ viewport/scenario แยกข้อมูลทดสอบ ไม่ใช่กิจกรรมเดียวกันข้ามภาพ ตัว assertions อ่าน DB ID/state/counts และ backend403 แยกจากภาพ

- UI-01 Mobile, Participant: registerสองงาน → cancelหนึ่ง → reload; เห็น CANCELLED และIDเดิม ส่วนอีกงานยังConfirmed; [ภาพ](../../evidence/sprint-2/f05a/cancelled-mobile.png)
- UI-01 Desktop, owning Organizer หลังParticipant reactivate: rosterมีACTIVE rowหนึ่งและผู้ลงทะเบียนถูกคน; [ภาพ](../../evidence/sprint-2/f05a/reactivated-owner-desktop.png)
- UI-02 Desktop, Participant: DBdeadlineปิดหลังโหลดปุ่ม → cancel; API409, UIแจ้งปิดแล้วและDBยังACTIVE; [ภาพ](../../evidence/sprint-2/f05a/cutoff-rejected-desktop.png)

## Failed checks / corrections / remaining work

- Initial new browser selectors ใช้ exact button name โดยไม่รวมลูกศร↗ จึง timeout4cases (28เดิมผ่าน) แก้ locator ให้ตรง UI; ไม่ใช้ผลนี้เป็น domain RED และไม่ลบ business/DB assertions
- Local Playwright-managed npm server teardown บนWindowsค้าง จึงหยุดเฉพาะtest-serverที่ตรวจPID/portแล้ว และใช้ managed test server แยกกับ config ที่ไม่สร้างwebServerซ้ำ CI Linuxยังใช้ committed configตามปกติ
- Trace ของ CI #86 แสดง hard navigation ขณะ logoutยังค้าง; เพิ่ม wait-for-signed-out ใน helperก่อน page.goto โดยไม่เพิ่ม retries/timeoutsหรือลด assertions
- Local Docker/Compose runtime ไม่ได้รันในเครื่อง; hosted CI ต้องตรวจ config/image ตาม workflow หลังpush/เปิดPR ไม่แทนผลด้วย bash stubs
- ยังไม่สร้าง approved cloud-image entry, ไม่เปลี่ยน GCP config/traffic, ไม่เปิด lifecycle บนเว็บหลัก และไม่อ้าง post-deploy acceptance; ทำตาม [release runbook](../../deploy/lifecycle-release.md) หลัง reviewed main release
- PhraewaS ต้องตรวจ feature diff/tests/permissions และ revisionล่าสุดก่อน mergeเข้าsprint2-staging จากนั้นจึงเริ่ม F-05B จาก stagingที่ยอมรับแล้ว; #8 ยังเปิดรอขอบเขตF-05และreleaseครบ

AI assistance: ใช้ AI ช่วย implementation, tests และการรวบรวมหลักฐาน; `guluJa` เป็นเจ้าของงาน/ดำเนิน Issue และ PR; `PhraewaS` รีวิว contract แล้ว ส่วน implementation review ยัง pending ไม่อ้าง pair programming หรือ manual execution โดยสมาชิกทั้งสอง

## Review #87 — corrections on 25 November 2026

[PhraewaS review ใน PR #87](https://github.com/PhraewaS/event-system/pull/87) เกิดที่ 81e28e1 เวลา22:10:09น. UTC+7; ยอมรับแก้ทั้งสามข้อเพราะเป็น gaps ของ acceptance/STS เดิม ไม่เพิ่มขอบเขต F-05B หรือย้าย release ก่อน review

| ข้อเสนอ | การแก้ / actual tests |
| --- | --- |
| Timeout ไม่ยืนยัน writer เก่าหยุด | เพิ่ม operator script `deploy/fence-legacy-db.mjs`: distinct old/new/admin logins, NOLOGIN old role + terminate sessions + zero sessions + explicit reconnect rejection; DEPLOY-02/03 ใช้ local PostgreSQL จริงและยืนยัน uncommitted old write ไม่ถูก commit; release activation ต้องมี DB-fence confirmation/evidence เพิ่มจาก traffic evidence |
| Server eligibility และ late response | own-list/detail เพิ่ม `canCancel` จาก DB clock/status/gate; API-10 ตรวจ active/cancelled/cutoff/gatefalse; UI-03 ตั้ง client clock ล่วงหน้า; UI-04 hold response แล้วนำทางออก ต้องไม่เปลี่ยน URL กลับหรือแสดงหน้าเก่า ทั้งสอง viewports |
| DB isolation และ coexistence assertions | random `s2_upgrade_*_test` ใหม่ต่อ invocation; reset/drop เฉพาะ DB ที่ run สร้างสำเร็จ พร้อม legacy extraction directory แยก; DB-01b ตรวจ public counts/remaining places/owner roster จาก actual old และ new API หลังแต่ละรุ่นลงทะเบียนใน event เดียวกัน |

### Test-first and executed evidence

- RED commit `59a1a1b`: [API eligibility](../../evidence/sprint-2/f05a/review-red-eligibility.txt) 1 failed/10 filtered, [browser](../../evidence/sprint-2/f05a/review-red-browser.txt) 4 failed จาก clock-skew/URL overwrite, [activation guard](../../evidence/sprint-2/f05a/review-red-fence-gate.txt) 2 failed/4 passed
- เริ่ม local PostgreSQL ใน sandbox ไม่สำเร็จหนึ่งครั้ง (ECONNREFUSED); เก็บ [setup failure](../../evidence/sprint-2/f05a/review-setup-failure.txt) แยก **ไม่นับเป็น meaningful RED** หลังเปิดเฉพาะ test cluster พอร์ต55462 แล้วจึงเก็บ RED จริงด้านบน
- [Build](../../evidence/sprint-2/f05a/review-build.txt) ผ่าน; [targeted API/DB](../../evidence/sprint-2/f05a/review-green-api-db.txt) 16 passed (ก่อนเพิ่ม assertion ยืนยัน persisted rollback); [lifecycle browser](../../evidence/sprint-2/f05a/review-green-browser.txt) 8 passed/0 failed ที่สองviewport รวมเคสเดิมและใหม่ ไม่ใช้ผล8นี้แทน full browser regression
- [Parallel upgrade run 1](../../evidence/sprint-2/f05a/review-upgrade-parallel-1.txt) / [run 2](../../evidence/sprint-2/f05a/review-upgrade-parallel-2.txt) ทำงานพร้อมกัน ใช้คนละ DB จริง 3 passed ต่อรอบ และ cleanup DB ที่ตนสร้างสำเร็จเท่านั้น
- [Offline activation/rollback tests](../../evidence/sprint-2/f05a/review-green-fence-gate.txt) 6 passed; fake gcloud ไม่มี cloud mutations
- [Full unit/API/DB/client regression](../../evidence/sprint-2/f05a/review-full-tests.txt) หลัง corrections ทั้งหมด: 99 passed/0 failed/0 skipped (14 files); เพิ่มจาก96เดิมคือ API-10 และ DEPLOY-02/03; hosted CI ของ PR ต้องผ่าน revision ล่าสุดก่อน review/merge

ข้อจำกัด: PostgreSQL role retirement ทดสอบจริงเฉพาะ local synthetic roles/database; **ยังไม่ได้ retire Cloud SQL credentials, deploy หรือยืนยัน cloud cutover** การเปิด lifecycle จริงยังต้องให้ operator ทำ inventory revisions/jobs → pinned replacement secret version → fence ทุก old login → ตรวจ proof → activation ตาม runbook Workflow ตรวจ flags/URL format แต่ไม่รับรอง private DB state แทน operator; คง #8 เปิดไว้
