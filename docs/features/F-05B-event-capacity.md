# F-05B — เจ้าของกิจกรรมปรับความจุ

25 พฤศจิกายน 2026 · **Contract v2 accepted in PR #86; implementation รอรีวิว** · Developer `guluJa`; reviewer `PhraewaS`; [Issue #85](https://github.com/PhraewaS/event-system/issues/85)

ประวัติก่อน code: PhraewaS approved contract9477808 ใน PR #86 เวลา16:13:03น. และ mergeเป็นbb5aeccเวลา16:14:08น. UTC+7; F-05A ได้ PhraewaS APPROVED f3c691a ใน PR #87 เวลา23:37:38น. และ mergeเข้า stagingเป็น921ffdcเวลา23:37:45น. วันที่25/11/2026 พร้อม [staging CI](https://github.com/PhraewaS/event-system/actions/runs/45655949506) ผ่านก่อนแยก branch F-05B ผล implementation/tests/review/release แยกใน [status matrix](../sprints/F-05B-implementation.md); pending/planned ใน STS ด้านล่างเป็น snapshot ก่อน implementation

FR-06; BR-01/03/04/07/10; NFR-01–05. งานย่อยของ F-05 เดิมใน [#8](https://github.com/PhraewaS/event-system/issues/8); เชื่อม Issue F-05B ผ่าน Development ของ PR และรายการงานใน #8 หลังเปิดจริง Dependencies: F-01–04 และ [F-05A state/ACTIVE-count contract](F-05A-registration-lifecycle.md). ดู [Sprint 2 plan](../sprints/sprint-2.md)

## 1. กฎและ workflow

Organizer ที่เป็นเจ้าของ event ปรับ capacity ได้เมื่อ DB now < registration_deadline เท่านั้น คง integer 1–1,000,000 และ newCapacity ≥ ACTIVE registrations; เท่าจำนวน ACTIVE ทำได้ ส่วน CANCELLED ไม่นับ

request ที่ capacity เท่าเดิมผ่านได้ก่อน deadline แต่ที่/หลัง deadline ให้ reject แม้เป็นค่าเดิม ไม่เปิดให้แก้ title/date/deadline หรือย้าย owner ขอบเขตนี้เป็นการยืนยัน DEC-03/BR-07 ตามแผนเดิม ไม่เพิ่ม approval system หรือ subsystem ใหม่

## 2. API / data / errors

`PATCH /api/events/:id/capacity` ต้อง session Organizer + CSRF + valid UUID + strict JSON `{capacity: number}`. 200 `{data: Event}` ตาม public event response เดิม คำนวณ registeredCount/remainingPlaces/registrationOpen จาก ACTIVE state ที่สอดคล้องกันหลัง update

Owner UI อ่าน snapshot จาก `GET /api/organizer/events/:id`: require Organizer+ownership, invalid UUID400/Visitor401/Participant403/foreign-or-absent404; คืน Event พร้อม `capacityChangeOpen` จาก DB clock ก่อน deadline ไม่ใช้ client clock หรือ registrationOpen (งานเต็มยังเพิ่ม capacity ได้) ฟิลด์นี้อยู่เฉพาะ owner response ไม่เพิ่มใน public Event; backend PATCH ตรวจเวลาใหม่หลังได้ lockเสมอ เพราะ eligibility ที่อ่านไว้อาจเก่าแล้ว

| เงื่อนไข | ผล | ผลต่อข้อมูล |
| --- | --- | --- |
| ไม่ login / Participant / CSRF ผิด | 401 UNAUTHENTICATED / 403 FORBIDDEN / 403 CSRF_INVALID | ไม่เปลี่ยน |
| ID/body ผิด, field เพิ่ม, string/fraction/0/เกิน 1,000,000 | 400 VALIDATION_ERROR | ไม่เปลี่ยน |
| ไม่พบ event หรือ Organizer คนอื่น | 404 NOT_FOUND | ไม่เปิดข้อมูล event ส่วนตัว |
| DB now ≥ deadline หลังได้ event lock | 409 CAPACITY_CHANGE_CLOSED | capacity/registrations เดิม |
| newCapacity < ACTIVE count | 409 CAPACITY_BELOW_ACTIVE_COUNT | capacity/registrations เดิม |
| ผ่านทุกเงื่อนไข | 200 event snapshot ใหม่ | เปลี่ยนเฉพาะ capacity; ไม่แก้ registration/state/quota |

ตรวจ auth/role/CSRF/input ก่อน transaction; ใน transaction ค้นและ lock owned Event แล้วตรวจ deadline ก่อน lower-bound ธุรกิจ อ่าน DB clock หลัง lock และ count ACTIVE จาก DB จากนั้น update/return snapshot/COMMIT ทุก failure rollback และ release client

**Lock Event เท่านั้น** ไม่ acquire Participant ภายหลัง จึงอยู่ร่วมกับ F-05A/Lab7 Participant → Event ได้ การลด/เพิ่มความจุที่แข่ง register/cancel/reactivate ต้องให้ผลที่เทียบเท่า legal serial execution และไม่ oversubscribe

ใช้ field/schema capacity เดิมและ migration ACTIVE state ของ F-05A ไม่ต้องเพิ่ม migration ใหม่ของ F-05B ไม่มี stored seat counter หรือข้อมูลภายนอกที่ต้อง backfill

## 3. UI และ dependencies

เพิ่ม form ในหน้า owner event/roster แสดง capacity ปัจจุบัน ACTIVE count และที่นั่งคงเหลือ มี validation, submitting, success/error/conflict และ refresh หลังบันทึก Participant/Visitor ไม่เห็นเครื่องมือแก้ แต่ backend ต้องปฏิเสธได้ด้วย ไม่ใช้การซ่อนปุ่มแทน authorization ใช้ server eligibility สำหรับ form; delayed response หลังย้ายหน้า/event ต้องไม่แสดง feedback หรือเปลี่ยน URL ในหน้าใหม่

Event list/detail/roster อ่านจำนวนที่อัปเดตหลัง reload การเพิ่ม capacity ไม่เปลี่ยน daily quota ของ Participant; การลด capacity ไม่ลบหรือ cancel ผู้ลงทะเบียน ตรวจ 390×844 และ 1440×1000 โดยคง historical data/session behavior

## 4. AC / STS ก่อน code

Test IDs ทั้งหมด **planned**; เสนอไฟล์ `tests/event-capacity*.test.ts`, `tests/e2e/event-capacity.spec.ts` ยังไม่มีผลรัน Sprint 2

| AC | Observable result | STS: inputs/action → expected / level |
| --- | --- | --- |
| S2-B-01 | strict integer bounds | S2-B-UNIT-01 + S2-B-API-01: 1/1,000,000 valid; 0/1,000,001/fraction/string/null/missing/extra invalid400 no write / unit+API |
| S2-B-02 | owner เพิ่ม/ลดได้ก่อน cutoff | S2-B-API-02: own open event, new ≥ ACTIVE count → 200 persisted capacity; registration IDs/states ไม่เปลี่ยน / API+DB |
| S2-B-03 | new = ACTIVE count และ unchanged value ถูกต้อง | S2-B-API-03: 3 ACTIVE + cancelled fixtures → capacity3 accepted, remaining0; empty event min1; no-op acceptedก่อน cutoff / API+DB |
| S2-B-04 | ต่ำกว่ายอด ACTIVE ไม่ผ่าน | S2-B-API-04: ACTIVE3 request2 → 409 CAPACITY_BELOW_ACTIVE_COUNT; before/after snapshots เหมือนเดิม / API+DB |
| S2-B-05 | เวลา cutoff ใช้ clock หลัง lock | S2-B-UNIT-02 + S2-B-API-05: before/equal/after, lock wait ข้าม cutoff, unchanged capacity ที่ปิดแล้ว → 409/no write ตามกฎ / unit+API+DB |
| S2-B-06 | server-enforced role/owner/CSRF | S2-B-API-06: visitor/Participant/Organizer2/absent event/wrong CSRF → 401/403/404 ไม่มี writes หรือ private leak / API+DB |
| S2-B-07 | capacity mutation แข่งกับ allocation ปลอดภัย | S2-B-API-07: independent pools + barrier/lock observation; capacity reduction/register, increase/register, cancel/reduce/reactivate → legal serial result, count≤capacity, no deadlock / API+DB |
| S2-B-08 | owner UI และ cross-feature counts ตรง | S2-B-UI-01: change via real form → reload; Participant/public/owner เห็นจำนวนตรง, wrong-role API denied; quota ไม่เพิ่มตาม capacity, no overflow สอง viewport / E2E+API |
| S2-B-09 | saved capacity/state คงอยู่และ regression ผ่าน | S2-B-REG-01: new app/pool อ่านค่าเดิม; inherited suites + F-05A + Lab7; setup/migration/seed ไม่ทำลายข้อมูลเดิม / API+DB+regression |

## 5. DoD

- [ ] Contract reviewed ก่อน implementation; feature branch จาก sprint2-staging หลังรับ F-05A
- [ ] Meaningful RED → GREEN ของ owner-capacity rule บนฐานจริง; ไม่ใช้ compile/setup failure เป็น RED
- [ ] AC ทุกข้อมี actual tests/results/SHA รวม backend restriction และ cross-feature concurrency
- [ ] PhraewaS รีวิว diff/tests/permissions และ revision ล่าสุด; CI ผ่านก่อน merge
- [ ] ทดสอบ integrated F-05A/B/Sprint1/Lab7 จาก staging; reviewed release เข้า main พร้อม immutable Sprint 2 version
- [ ] actual main CI/deploy และ post-deploy journey/persistence/access ผ่าน; completion/traceability matrix ระบุจริงก่อนปิดงาน
