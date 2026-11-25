# F-05B — implementation / verification record

Developer `guluJa`; independent reviewer `PhraewaS` · Issue #85, parent F-05 #8

**Status: implementation / local verification; feature review, staging acceptance และ main/GCP release ยัง pending.** ไม่ปิด #8/#85 จากผล local หรือ CI เพียงอย่างเดียว

## Contract และ test-first

| ขั้น | Version / actual evidence |
| --- | --- |
| Reviewed contract | PR #86: PhraewaS APPROVED9477808 ก่อน mergebb5aecc |
| Accepted dependency | PR #87: PhraewaS approvedf3c691a, merge921ffdc เข้า sprint2-staging25/11/2026 23:37:45น. UTC+7; [integration CI](https://github.com/PhraewaS/event-system/actions/runs/45655949506) ผ่าน |
| Feature branch | `codex/sprint2-event-capacity-85` จาก921ffdc ไม่พัฒนาใน staging/main โดยตรง |
| Meaningful RED | 5b3d180: test S2-B-API-02 สร้าง event/ลงทะเบียนจริงก่อน PATCH capacity; คาด200แต่ได้404จากฐาน921ffdc; [log](../../evidence/sprint-2/f05b/red-capacity.txt) 1 failed |
| Initial implementation | a615921: transaction/API/UI/unit+DB+browser tests; primary RED assertions คงเดิม |
| Corrected implementation | 33908f7: แยก owner eligibility ออกจาก public snapshot พร้อม new GET authorization checks; full unit/API110 และ targeted browser6ผ่าน |

## Behavior และ data

- PATCH ของเจ้าของเท่านั้น: strict integer1–1,000,000; DB timeหลัง Event lock ต้องก่อน deadline และ capacity≥ACTIVE count; deadlineมี precedence ก่อน lower bound
- Count/state/quota ใช้ F-05A เดิม CANCELLED ไม่นับ; ไม่แก้/ลบ registrations ไม่เพิ่มโควต้า ไม่เพิ่ม migration เพราะใช้ capacity column เดิม
- Event-only capacity writer อยู่ร่วมกับ Participant→Event allocation writers; ตรวจจริงผ่าน independent pools และ observed event-lock waits ไม่ใช้ sleep แทน synchronization
- Owner UI ใช้ private GET `/api/organizer/events/:id` พร้อม server-computed capacityChangeOpen; public Event shape เดิมคงอยู่ มี backend authorization ของ GET ใหม่ด้วย

## AC → actual verification

| AC | Actual tests | Observable evidence |
| --- | --- | --- |
| S2-B-01 | event-capacity-unit.test.ts UNIT-01; event-capacity.test.ts API-01 | valid1/1,000,000; malformed JSON/UUID/strict field/type/bounds ปฏิเสธและ DB snapshot คงเดิม |
| S2-B-02 | API-02 | increase/decrease200, saved capacity; IDs/history/quota เดิม |
| S2-B-03 | API-03 | 3ACTIVE+2CANCELLED ลดเหลือ3ได้; equality/no-op/minimum1 |
| S2-B-04 | API-04 | below ACTIVE409 CAPACITY_BELOW_ACTIVE_COUNT และ exact no-write snapshot |
| S2-B-05 | UNIT-02; API-05/05b | exact equality unit; closed/no-op และ DB clock หลัง observed lock wait ได้409 |
| S2-B-06 | API-06; UI-01 | PATCH/owner GET role/ownership/UUID/CSRF checks และ foreign404ตรง absent; Participant direct PATCH403 |
| S2-B-07 | API-07 | reduce/register, increase/register, cancel/reduce/reactivate → legal serial statuses, active≤capacity, row uniqueness และ no deadlock |
| S2-B-08 | tests/e2e/event-capacity.spec.ts UI-01/02/03 | owner form/reload/public/Participant counts, quotaยังเต็มหลังcapacityเพิ่ม, lower-bound/cutoff rejection, server clock, delayed-response protection สองviewports |
| S2-B-09 | REG-01 + inherited full suites | fresh app/poolอ่าน saved capacity/ACTIVE-only roster โดย cancellation dataคงเดิม; S1/Lab6/Lab7/F-05A regression |

Test IDs ย่อจาก S2-B-*; ตารางนี้ไม่แทน independent review หรือ post-deploy acceptance

## Execution record / remaining gates

Local: Node24 / PostgreSQL17 test cluster127.0.0.1:55462 / Edge via Playwright390×844,1440×1000; ใช้เฉพาะ isolated `gather_sprint2_lifecycle_test` และฐาน upgradeสุ่มของ test suite ไม่มี Cloud SQL connection

- [Targeted API/unit](../../evidence/sprint-2/f05b/green-api.txt): 11 passed ก่อนเพิ่ม private owner snapshot assertions
- [Build](../../evidence/sprint-2/f05b/build.txt) ผ่าน; [full unit/API/DB/client](../../evidence/sprint-2/f05b/full-tests.txt): 110 passed/0 failed/0 skipped (99 inherited+11 new); ใช้ SHA ของ branch/run จริงก่อนสรุปผล
- [Initial regression](../../evidence/sprint-2/f05b/first-regression-failure.txt): 109 passed/1 failed เพราะเพิ่ม owner eligibility ลง public Event shape; ย้ายฟิลด์ไป private owner GET และเพิ่ม authorization checks โดย **ไม่แก้ inherited public-field assertion** ไม่อ้างรอบนี้เป็น PASS
- [Initial browser](../../evidence/sprint-2/f05b/first-browser-failure.txt): 4 passed/2 failed เพราะ locator คาดปุ่ม Reserve แต่ UI เมื่อquotaเต็มใช้ชื่อ Daily registration limit reached; แก้ locatorให้ตรงกับสถานะเดิม ไม่เปลี่ยน business/DB assertions หรือเพิ่ม retry/timeout
- [Browser F-05B](../../evidence/sprint-2/f05b/browser-capacity.txt): 6 passed/0 failed/0 skipped (3 scenarios×2viewport), retries0; ไม่ใช้ผล6นี้แทน full regression; hosted CIต้องตรวจทุก42browser executionsรวม inherited36

## Selected actual UI evidence

ข้อมูลสังเคราะห์ แต่ละ viewport/scenario ใช้ event fixture แยกกัน ไม่อ้างว่าเป็นกิจกรรมเดียวกันข้ามภาพ

- [Owner desktop](../../evidence/sprint-2/f05b/owner-capacity-desktop.png) / [owner mobile](../../evidence/sprint-2/f05b/owner-capacity-mobile.png): S2-B-02/03/08, owning Organizer; Participantสองคนลงทะเบียนหลัง ownerเพิ่มcapacity แล้วลดเหลือ2และreload → registered2/remaining0/capacity2 และ IDsเดิม; quota denial/Participant directPATCH403/การ cancel แล้วลดเหลือACTIVE count1ตรวจด้วย UI/API/DB assertionsในเคสเดียวกัน
- [Cutoff rejection desktop](../../evidence/sprint-2/f05b/cutoff-rejected-desktop.png): S2-B-05/08, ownerโหลดformตอนเปิด แล้ว DBdeadlineปิดก่อนกดsave → 409พร้อมข้อความ, capacityยัง5 และ formปิดหลังrefresh; testคง client clockล่วงหน้าเพื่อยืนยันserver eligibility
- ตรวจภาพแล้วข้อความ/formอ่านได้และไม่ล้นหน้า; ตาราง mobileใช้ horizontal scrollภายในกรอบตาม UIเดิม actual assertionsตรวจ document.scrollWidth≤viewport ไม่อ้างว่ารายละเอียดทุกคอลัมน์อยู่พร้อมกันในภาพ mobile

หลัง PhraewaS ตรวจ revisionล่าสุดและ CI ผ่าน จึง mergeเข้า sprint2-staging; ตรวจ integrationก่อน reviewed Sprint2 releaseเข้าmain/tag แล้วทำ GCP deployment/cutover/activation ตาม [runbook](../../deploy/lifecycle-release.md) และตรวจ post-deploy journey/persistence/access ก่อนสรุป Done นี่ไม่ใช่ deployment evidence

AI assistance: ใช้ AI ช่วย implementation/tests และรวบรวมหลักฐาน; guluJa รับผิดชอบงาน/Issue/PR ส่วน PhraewaS เป็นผู้รีวิวอิสระ ไม่อ้างว่าสมาชิกทำ pair programming หรือทดสอบด้วยมือครบทั้งคู่
