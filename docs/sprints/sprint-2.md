# Sprint 2 — core expansion

อัปเดต26 พฤศจิกายน 2026 · **F-05A/B ผ่าน review และ staging integration; release #89 เข้า main/GCP ยัง pending** ส่วน proposal25/11และผลรอบก่อนคงไว้เป็นประวัติ ดูสถานะปัจจุบันใน §10

เจ้าของงาน: `guluJa` · ผู้รีวิว: `PhraewaS`

## 1. Baseline และขอบเขต

- เริ่มจาก main `e2b9842edef525b2e72f040c9f64fa99dbe0f2c2` หลัง release PR #84 รวม Lab7 CR-L7-01 แล้ว
- หลักฐานเดิมของ commit นี้: [main CI 45452314277](https://github.com/PhraewaS/event-system/actions/runs/45452314277) ผ่าน 81 unit/API/client tests และ 28 browser executions; [deploy 45452313985](https://github.com/PhraewaS/event-system/actions/runs/45452313985) สำเร็จ revision `gather-00013-zwn` หลักฐานเหล่านี้ไม่ใช่ผลทดสอบ Sprint 2
- F-05 ยังไม่ implement: schema ปัจจุบันไม่มีสถานะ cancellation; ไม่มี cancel/capacity-update endpoint
- [Issue #8](https://github.com/PhraewaS/event-system/issues/8) เป็นงาน F-05 เดิม แยกการส่งมอบเป็นสองส่วนด้านล่าง โดยไม่ย้ายหรือลดขอบเขตเดิม

| ส่วนส่งมอบ | ผลที่ผู้ใช้ทำได้ | สัญญาก่อน code | ลำดับ |
| --- | --- | --- | --- |
| F-05A Registration lifecycle | Participant ยกเลิกและกลับมาลงทะเบียนของตนได้ ที่นั่งและโควต้าปรับตาม ACTIVE state | [F-05A contract](../features/F-05A-registration-lifecycle.md) · FR-06; BR-01–06/10/11; NFR-01–05 | ทำก่อน พร้อม migration/count/UI compatibility |
| F-05B Owner capacity management | Organizer เจ้าของปรับความจุกิจกรรมได้โดยไม่ต่ำกว่ายอด ACTIVE | [F-05B contract](../features/F-05B-event-capacity.md) · FR-06; BR-01/03/04/07/10; NFR-01–05 | หลัง F-05A ยอมรับใน staging |

สองส่วนนี้มี workflow, AC/STS และการทดสอบของตนเอง รองรับ program evidence ของสอง meaningful Sprint 2 features ตาม Deliverable 2 §4.2 โดยคง F-05 เป็นกลุ่มงานเดิม

## 2. Current SRS/System SDS addendum

FR-06 เดิมคงขอบเขต cancellation/reactivation/capacity; ยืนยันรายละเอียด DEC-02/03 ผ่าน review ครั้งนี้ก่อน code รายละเอียดใหม่อยู่ในสอง contract ข้างต้น

| ส่วนที่ต้องปรับ | ข้อกำหนดสำหรับ implementation |
| --- | --- |
| registration state | status NOT NULL DEFAULT ACTIVE; registered_at NOT NULL DEFAULT clock_timestamp() หลัง backfill created_at; cancelled_at NULL; คง ID/created_at/FKs/pair uniqueness |
| counts/read models | ที่นั่ง โควต้า registrationOpen และ owner roster นับเฉพาะ ACTIVE; own-list/detail ยังอ่าน CANCELLED ของตนได้ |
| quota CR-L7-01 | คง limit 2 ต่อวันเริ่มกิจกรรม Asia/Bangkok; เปลี่ยนเป็น ACTIVE-only รวมทุกแถว และตรวจอีกครั้งตอน reactivation |
| concurrency | writers ของ Participant ใช้ Participant → Event ตาม Lab7; capacity writer lock Event เท่านั้นและห้ามไป lock Participant ภายหลัง |
| privacy | derive identity จาก session; ไม่รับ participantId/organizerId; คง 401/403/404, CSRF และ strict validation |
| schema/setup | migration ใหม่ต่อจาก 002; ไม่แก้ 001/002 ไม่ reset shared Cloud SQL; seed คง idempotent |
| deployment/rollback | rollout แบบปิด lifecycle writes จนผ่าน state-aware traffic, actual old-DB-login/session fence และhistorical Deploy rerun identity controlตามrunbook; หลังเปิดใช้ rollback ได้เฉพาะ compatible target ที่ทดสอบ ACTIVE/CANCELLED แล้ว ไม่ down schema; รายละเอียดและ STS ใน F-05A §2.1–2.2 และ deploy/lifecycle-release.md |
| preserved behavior | login/logout/session guards, publish validation, deadline/capacity/duplicate, own-only reads, owner-only roster และ Lab6 Location/Description fixes |

**ข้อขัดกันที่แก้โดย addendum นี้:** ส่วน future model ใน `docs/sprint-1.md` เดิมเสนอ event-first lock order ก่อนมี Lab7; Sprint 2 ต้องใช้ลำดับล่าสุดข้างต้น ห้ามนำ event-first proposal เก่ามาผสมใน writer ที่ต้อง lock Participant ด้วย เอกสารเก่าและผล release เดิมคงไว้เป็น history

ระบบยังเป็น UI → API → PostgreSQL เดิม ไม่เพิ่ม service, provider ภายนอก, payment, waitlist หรือการแก้วันเริ่ม/ปิดรับสมัคร การเช็กอิน/รายงานเป็น F-06 Sprint 3 ตาม #9

## 3. Workflow และ integration gates

1. ใช้ Issue #8 ต่อและแยก Issue F-05B; เพิ่มทั้งสองเข้า Project board สถานะ Backlog/Specified ตามที่ทำจริง
2. สร้าง `sprint2-staging` จาก main e2b9842 ตั้ง protection ให้ต้องมี non-author approval, required CI, up-to-date branch และ resolved conversations เช่นเดียวกับ workflow เดิม ไม่ push feature ตรงเข้า staging/main ผลตรวจ/รายการคงค้างอยู่ใน [DOC-S2-06 gate record](sprint2-gates.md); ห้ามถือว่าการสร้าง branch ทำให้มี protection อัตโนมัติ
3. PR contract นี้มาจาก `codex/sprint2-contract` เข้า `sprint2-staging` แก้เฉพาะเอกสารและ CI branch filter ให้รับ PR เข้า `sprint*-staging`; deploy ยังคงเฉพาะ main
4. PhraewaS ตรวจ DEC-02/03, migration/state, API/errors, quota, locking และ AC/STS; แก้/อธิบายข้อไม่รับ แล้วให้ตรวจ revision ล่าสุดก่อน merge ห้ามเริ่ม feature implementation ก่อน contract acceptance
5. เปิด feature branch F-05A จาก staging ที่รับ contract แล้ว เก็บ meaningful RED → implementation → GREEN/regression → reviewed PR → staging acceptance
6. เปิด feature branch F-05B จาก staging ที่รับ F-05A แล้ว ทำ RED/GREEN/review และ integration แบบเดียวกัน ไม่เตรียม implementation branches ล่วงหน้าที่มีฐานยังไม่ยอมรับ
7. ทดสอบข้าม F-05A/B และ Sprint 1/Lab7 จาก staging ที่รวมจริง จากนั้น reviewed release PR `sprint2-staging` → `main`; บันทึก immutable Sprint 2 release commit/tag, main CI, deploy revision/digest และ post-deploy checks
8. คง Sprint 2 release ให้ระบุได้ ก่อนรวม Sprint 3 progress ลง candidate ต่อไป ไม่ติดป้ายว่าทำ Sprint 2 เสร็จจากเอกสารหรือ feature PR เพียงอันเดียว

## 4. Planned completion/verification matrix

ทุกแถวข้างล่างยัง **planned / not run / not accepted** ณ proposal นี้ ห้ามใส่ PASS จาก baseline แทนผลใหม่

| Requirement / feature | AC | Planned verification | Actual/result/version |
| --- | --- | --- | --- |
| FR-06, BR-05/06, NFR-01/05 / F-05A | S2-A-01–06 | migration/defaults + old/new API coexistence + compatible rollback; lifecycle API/unit/persistence | pending |
| BR-11, FR-03/04/05, BR-01/02 / F-03/F-04/F-05A | S2-A-07/09/11 | quota/count/concurrency API; inherited Lab7/S1 regression | pending |
| BR-04/10, NFR-02/04 / F-05A | S2-A-08 | auth/CSRF/foreign-record/strict-input API | pending |
| NFR-03, FR-06 / F-05A | S2-A-10/12 | real UI 390/1440; preserved tests | pending |
| FR-06, BR-01/03/07 / F-05B | S2-B-01–05 | boundary/unit + locked DB/API mutation | pending |
| BR-04/10, NFR-02 / F-05B | S2-B-06 | backend role/ownership/CSRF API | pending |
| BR-01/07, NFR-01/03/05 / F-05B | S2-B-07–09 | race/persistence + owner/Participant UI | pending |

Implementation evidence ต้องระบุ actual file/test name, command, SHA, passed/failed/skipped, review, integration และ accepted release เพิ่มหลังรันจริง เก็บ RED แยกจาก compile/setup failure

## 5. สิ่งที่ Deliverable 2 ยังต้องมีภายใน 29 พฤศจิกายน

- F-05A/B เสร็จครบ ทดสอบ/รีวิว/รวมและมี Sprint 2 release บน main
- F-06 #9 มี contract ครบของงานที่เหลือ และมี owner check-in/idempotence ที่ทำงานจริงผ่าน UI/API/DB และ tests ใน deployed candidate; กำหนด developer/reviewer ก่อนเริ่ม F-06
- complete current SRS, feature inventory, System SDS และ full FR/BR/important NFR → AC/test/result matrix ไม่ใช่ตาราง F-05 อย่างเดียว
- candidate รวม Sprint 1+2+Sprint 3 ที่ทำแล้ว ผ่าน regression, CI, GCP deploy, critical journey/persistence/access checks และมี remaining-work plan พร้อมเจ้าของ/วันที่ถึง 13 ธันวาคม
- รายงาน Deliverable 2 แยกจาก Lab7; อ้างประวัติ Lab5–7 ตามรุ่นจริง ไม่แทนงาน Sprint 2 ด้วย Lab7 quota feature

## 6. Proposal DoD

Acceptance ของ PR เอกสารนี้แยกจาก feature acceptance: DOC-S2-01 baseline/ขอบเขตสองส่วนถูก; DOC-S2-02 สัญญา A พร้อม 12 AC/STS; DOC-S2-03 สัญญา B พร้อม 9 AC/STS; DOC-S2-04 state/quota/lock/migration สอดคล้องกัน; DOC-S2-05 CI รองรับ staging ใหม่โดย deploy ยัง main เท่านั้น; DOC-S2-06 มี review revision ล่าสุดและ staging gates ตรวจจริง

- [ ] PhraewaS ยืนยัน contract F-05A/B และ DEC-02/03 ก่อน implementation
- [ ] PR linked to Issue #8 และ Issue F-05B ใน Development; Reviewer เป็น PhraewaS
- [ ] CI ของ PR นี้รันจริงกับ base sprint2-staging และผ่าน; ไม่ปล่อย Pending หรือ bypass required checks
- [x] sprint2-staging มี protection/review gates ตรวจจริงก่อนรับ feature work; หลักฐานผู้ดูแล 25/11 14:06:16 และ branch API protected=true อยู่ใน [gate record](sprint2-gates.md)
- [ ] Contract merge SHA และ review date ถูกบันทึก; actual feature tests/results ยัง pending

## 7. Review revision record

Review ของ `PhraewaS` ใน [PR #86](https://github.com/PhraewaS/event-system/pull/86) วันที่ 25/11/2026 04:27:24 น. (UTC+7), บน a74a20f: รับข้อเสนอ defaults/NOT NULL, old-app upgrade test, compatible rollback และ gate evidence ทั้งหมด เนื่องจาก Deliverable 2 §§3.2/3.5/4.2 ต้องคง persistence, setup/migration และ release safety จริง การเพิ่มนี้ยังเป็น contract/test design ก่อน implementation ไม่ใช่ผลรัน feature ใหม่

25/11/2026: `PhraewaS` ตรวจ425c630เวลา04:47:36และยืนยันว่า contract migration/rollback ครบ ก่อนแนบผลตั้ง protection เวลา14:06:16; อัปเดตหลักฐานตามจริงใน gate record แล้ว formal approval/contract acceptance ยังรอ review revision ล่าสุดและ CI ของรอบเพิ่มหลักฐาน

## 8. Accepted contract และ F-05A implementation

PR #86 ได้รับ PhraewaS APPROVED9477808 วันที่25/11/2026 16:13:03น. และ mergeเป็นbb5aeccเวลา16:14:08น. UTC+7 ข้อความ pending ใน proposal/revision records ก่อนหน้านี้คงตามลำดับประวัติ F-05A เริ่มจากฐานที่ยอมรับนี้ ผลปัจจุบันอยู่ใน [implementation/status matrix](F-05A-implementation.md); การรับ feature เข้า staging/main และ F-05B #85 ยัง pending

## 9. Historical integration snapshot after PR #87

วันที่25/11/2026 PhraewaS APPROVED f3c691a ก่อน PR #87 mergeเข้าsprint2-stagingเป็น921ffdcเวลา23:37:45น. UTC+7; integration CI45655949506ผ่าน จึงเริ่ม F-05B branchจาก921ffdc ข้อความ planned/pending ใน proposalเดิมเป็น snapshotประวัติ ไม่ใช่สถานะปัจจุบัน

| Feature / linked requirements | Actual verification/status | Remaining acceptance |
| --- | --- | --- |
| F-05A / FR-06, BR-01–06/10/11, NFR-01–05 | implementation/tests และ independent review acceptedในstaging; [AC→tests/results](F-05A-implementation.md) | Sprint2 main release, real DB cutover/activation และ cloud acceptance ยัง pending |
| F-05B #85 / FR-06, BR-01/03/04/07/10, NFR-01–05 | implementedบนfeaturebranchหลังรับ A; [9AC→actual tests/status](F-05B-implementation.md) | PhraewaS review, staging integration และ release/post-deploy checks |
| F-05 parent #8 | ติดตาม A/B และ releaseร่วมกัน | คงเปิดจนขอบเขต F-05 และ acceptanceครบ |

ตามแผนคงเหลือ **2 PR ของ Sprint2**: F-05B feature→sprint2-staging แล้ว reviewed release sprint2-staging→main (หลังintegrationและเอกสารreleaseพร้อม) ใช้ Issuesเดิม #85/#8 ไม่เปิดเพิ่มเพียงเพื่อแยกขั้นตอน tests/เอกสารในfeaturePRเดียวกัน การแก้ตามreviewใช้PRเดิม; หากพบdefectใหม่ที่ต้องแยกจริงจึงประเมินเพิ่ม ไม่รวม F-06/Sprint3 และรายงาน Deliverable2ในจำนวนนี้ การ release/activation/retestอาจมีหลายขั้นแต่ไม่จำเป็นต้องเป็นPRใหม่ทุกขั้น

## 10. Current status after PR #88 / release review #89

**Current CP-v1 implementation update:** Contract #93 accepted94e99a3→1407833 (27/11/2026 19:21:06UTC+7) ก่อนREDa753e91และruntime5c14d86 ดู [AC→actual local/mocked tests และ remaining cloud gates](cloudsql-credential-retirement-implementation.md) งานนี้ยังรอindependentimplementationreview/stagingCI ไม่เปลี่ยนDBจริง/deploy/lifecycle และไม่ใช้ผลlocalแทนactualcloudacceptance ข้อความproposal/snapshotต่อไปเก็บเป็นประวัติ

**27/11/2026 deployment-contract proposal (ไม่ rewrite snapshot ด้านล่าง):** [CP-v1 contract/AC/STS](../features/F-05A-cloudsql-credential-retirement.md) เสนอ Cloud SQL management-plane credential retirement สำหรับ #8 ฐาน sprint2-staging ee6e679; main ที่ fetch ได้ 50529ea ยังต้องคง cloud fence/activation acceptance เป็น pending CP-v1 ยังไม่ accepted/implemented และไม่ทำให้ F-05A/F-05B หรือ Deliverable 2 complete การเปลี่ยนรอบนี้ไม่มี schema/app/workflow/GCP mutation ใช้ชื่อ GitHub `guluJa`/`PhraewaS` สำหรับ author/reviewer และเก็บ contract review ก่อน implementation ของทางเลือกใหม่

26/11/2026 00:32:07น. UTC+7: PhraewaS APPROVED8c543cf ก่อน PR #88 mergeเข้าsprint2-stagingเป็น86963e3เวลา00:32:15น. [Staging integration CI45665807924](https://github.com/PhraewaS/event-system/actions/runs/45665807924) ผ่าน116 unit/API/DB/client tests,42 browser executions,6 offline lifecycle release testsและ Compose/Docker จากแหล่งรวมจริง มิใช่ใช้ผลfeature branchแทนintegration

| Feature / release | Current accepted source / evidence | Remaining gates |
| --- | --- | --- |
| F-05A #8 | PhraewaS approved f3c691aใน#87; accepted921ffdcและรวมใน86963e3; AC→testsในimplementation record | main/GCP release, actual DB fence/activationและpost-deploy |
| F-05B #85 | PhraewaS approved8c543cfใน#88; accepted86963e3; รวม rendered countsสามมุมมองและ correlated race/6 serial schedules | main/GCP releaseและpost-deploy |
| Release PR #89 | เปิดจากsprint2-stagingเข้าmain; [PR CI45666938844](https://github.com/PhraewaS/event-system/actions/runs/45666938844) ของ86963e3ผ่าน; มีreviewขอแก้ก่อนApprove | review fixes→stagingผ่านPRย่อย→fresh staging/release CI→independent release approval→merge/main CI/deploy |
| F-05 parent #8 / child #85 | ทั้งสองยังเปิดติดตามrelease acceptance | ห้ามใช้merge/CIอย่างเดียวแทนactual cloud result |

Review #89 วันที่26/11/2026 00:44:47น. ขอเพิ่ม historical Deploy rerun control และอัปเดตสถานะเอกสาร รับทั้งสองข้อ: gateปัจจุบันไม่ครอบคลุมworkflowsourceเก่าที่ rerun และต้องระบุaccepted sourceให้ตรงหลักฐาน การแก้ใน `codex/sprint2-release-review-89` เป็นdocs-only ไม่มีapplication/schema/GCP mutation ต้องผ่านPRเข้าสตagingตามworkflowก่อน #89 จะอัปเดตตาม ไม่เปิดrelease PRใหม่หรือIssueใหม่ ใช้ #8/#85 ต่อ

ผล116/42ของ86963e3เป็นhistorical integration baselineของรอบนี้ ไม่ใช้รับรองdocs correction commitโดยอัตโนมัติ เมื่อรวมcorrectionแล้วให้เก็บfresh stagingและrelease-PR CIอีกรอบ mainยังe2b9842และ GCP Sprint2/cutover/activationยังpending อย่าอ้างว่า featureเปิดใช้งานบนเว็บจริงครบแล้ว
