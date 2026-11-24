# F-05A — ยกเลิกและกลับมาลงทะเบียน

25 พฤศจิกายน 2026 · **Proposal / รอ teammate review ก่อน code** · Developer `guluJa`; reviewer `PhraewaS`; งาน F-05 เดิมใน [#8](https://github.com/PhraewaS/event-system/issues/8)

FR-06; BR-01–06/10/11; NFR-01–05. ฐานและลำดับงาน: [Sprint 2 plan](../sprints/sprint-2.md). Dependencies: F-01–04 และ Lab7 CR-L7-01 ที่ main e2b9842

## 1. กฎและ workflow

1. Participant ยกเลิกได้เฉพาะ ACTIVE registration ของตน เมื่อ database time **น้อยกว่า registration_deadline**; ใช้เวลาหลังได้ locks ไม่ใช้เวลาใน browser/เวลามาถึง request
2. ACTIVE → CANCELLED คืนหนึ่งที่นั่งและลด quota ของวันเริ่มกิจกรรมทันทีใน transaction ไม่ลบ record
3. ยกเลิกซ้ำของตนที่ CANCELLED แล้วคืน 200 พร้อม state เดิม แม้พ้น deadline; ไม่แก้ cancelledAt หรือคืนที่นั่งซ้ำ การตรวจ role/ownership/CSRF ยังคงทำก่อน
4. กลับมาลงทะเบียนใช้ POST registration เดิม ตรวจ deadline, ACTIVE capacity และ ACTIVE daily quota ใหม่ ใช้ row/ID เดิม กลับ ACTIVE; ห้ามเกิดสอง rows ของคู่ participant/event
5. ACTIVE ที่มีอยู่แล้วเป็น duplicate 409 แม้งานเต็ม/ปิด/quota เต็ม ลำดับ rejection สำหรับการเพิ่ม/กลับมา ACTIVE: duplicate → deadline → capacity → quota
6. Canceled rows ไม่นับที่นั่งหรือ quota; own-list/detail ยังดูได้ครบ ข้อมูล ACTIVE เก่าที่เกิน quota 2 คงไว้และยังอ่านได้ แต่เพิ่ม/activate ใหม่ไม่ได้เมื่อ count ≥2

## 2. Data / migration

เสนอ migration `003_registration_lifecycle.sql` (ตรวจเลขล่าสุดก่อนสร้างจริง): เพิ่ม `status` ที่ CHECK ACTIVE/CANCELLED, `registered_at` NOT NULL และ `cancelled_at` nullable

- Backfill rows เดิมเป็น ACTIVE และ registered_at=created_at; คง id, created_at, participant_id, event_id และ UNIQUE(participant_id,event_id)
- CHECK ให้ ACTIVE มี cancelled_at=NULL และ CANCELLED มี cancelled_at ไม่เป็น NULL; initial/activation ตั้ง registered_at จาก DB clock; cancel ตั้ง cancelled_at ครั้งแรก ส่วน reactivation เคลียร์ cancelled_at
- ห้ามแก้ migration ที่ใช้แล้ว, reset/seed ทับ Cloud SQL หรือเปลี่ยนรหัสบัญชีเดิม
- ตรวจ upgrade ฐานที่มีข้อมูลสังเคราะห์เดิม รวม legacy >2; เปิด app/API pool ใหม่แล้วอ่าน IDs/states/counts ได้เดิม
- ไม่เพิ่มประวัติทุก transition เป็น subsystem ใหม่; created_at คือการสร้างครั้งแรก, registered_at คือ activation ล่าสุด, cancelled_at คือ cancellation ล่าสุดของ state ปัจจุบัน

## 3. API และ errors

ทุก mutation: session, role PARTICIPANT, CSRF, UUID และ strict JSON; identity มาจาก server ห้ามรับ participantId/status/timestamps จาก client

| Operation | Request / response | ข้อผิดพลาดสำคัญ |
| --- | --- | --- |
| POST `/api/registrations/:id/cancel` | `{}`; 200 `{data:{id,eventId,participantId,createdAt,status,registeredAt,cancelledAt}}` | foreign/nonexistent 404 NOT_FOUND; ACTIVE ที่ now≥deadline: 409 CANCELLATION_CLOSED |
| POST `/api/events/:id/registrations` | `{}`; new row 201, reactivation 200; response fields เดิมพร้อม state fields ข้างต้น | คง 409 DUPLICATE_REGISTRATION / REGISTRATION_CLOSED / EVENT_FULL / DAILY_REGISTRATION_LIMIT; ไม่มี insert/update เมื่อถูกปฏิเสธ |
| GET own-list / own-detail | ทั้ง ACTIVE/CANCELLED ของตนพร้อม state fields; pagination ≤200 และ continuation เดิม | คง role/ownership; ไม่คืนข้อมูลคนอื่น |
| GET event list/detail, owned events/roster, quota | event counts/registrationOpen/roster ใช้ ACTIVE เท่านั้น; quota ใช้ ACTIVE ต่อ participant/วันไทย | public ไม่เพิ่ม private quota/รายชื่อ; quota query validation/no-store เดิม |

ร่วมกัน: Visitor401, wrong-role403, CSRF403, malformed UUID/body/extra field400 ตาม code เดิม; auth/role/CSRF ก่อน payload/domain checks การค้น cancel ต้อง scope ด้วย participant ของ session เพื่อคง foreign404

## 4. Transaction และ UI

ใช้ client เดียว BEGIN/COMMIT/ROLLBACK; register/reactivate/cancel lock Participant → Event แล้วตรวจ state ซ้ำภายใต้ lock การอ่าน registration เพื่อหา event ก่อน lock ไม่ถือเป็นสิทธิ์หรือ state สุดท้าย ทุก failure rollback และ release client ใน finally

การ cancel/register/reactivate ของคนเดียวต่าง event serialize ด้วย Participant lock; capacity update ของ F-05B lock Event เท่านั้น จึงไม่ย้อนลำดับหรือล็อก Participant หลัง Event อ่าน count จาก DB ไม่เก็บ mutable seat/quota counter

UI My registrations/detail: ACTIVE มี Cancel เมื่อ eligible, CANCELLED แสดงสถานะและทางกลับไปลงทะเบียน; ห้ามแสดง CANCELLED เป็น Confirmed Event Detail ใช้ ACTIVE state แทนการเช็กแค่ว่ามี row อยู่ Loading/error/retry/conflict ต้องอ่าน state/count/quota ใหม่หลัง mutation และคง session-generation guards ของ Lab7 ตรวจที่ 390×844 และ 1440×1000

## 5. AC และ STS ก่อน implementation

Test IDs ต่อไปนี้เป็น **planned** ไม่ใช่ executable tests หรือ PASS ชื่อไฟล์เสนอ `tests/registration-lifecycle*.test.ts` และ `tests/e2e/registration-lifecycle.spec.ts`; บันทึกชื่อจริงหลังสร้าง

| AC | Observable result | STS: inputs/preconditions/action → expected / level |
| --- | --- | --- |
| S2-A-01 | Upgrade ไม่เสียข้อมูลเก่าและ state constraints ใช้จริง | S2-A-DB-01: populated pre-change DB → migrate; IDs/createdAt/FKs เดิม, ACTIVE/registeredAt backfill; invalid state rejected / DB |
| S2-A-02 | Cancel ก่อน deadline คืนที่นั่งและ quota หนึ่งครั้ง | S2-A-API-01: own ACTIVE, now<deadline → cancel200; state CANCELLED, event count −1, quota −1, reload/fresh pool ตรงกัน / API+DB |
| S2-A-03 | Repeated cancel idempotent | S2-A-API-02: CANCELLED row → cancel ซ้ำทั้งก่อน/หลัง cutoff; 200 state/IDs/cancelledAt/counts เดิม / API+DB |
| S2-A-04 | ACTIVE cancel ที่ cutoff เท่ากัน/หลัง cutoff ไม่เปลี่ยนข้อมูล | S2-A-UNIT-01 + S2-A-API-03: now< / = / > deadline; unit exact equality และ real-DB deadline/lock-wait; rejected409 snapshot เดิม / unit+API+DB |
| S2-A-05 | Reactivate row เดิมและนับใหม่ถูกต้อง | S2-A-API-04: cancelled eligible + place/quota available → POST200 same ID/createdAt, ACTIVE, cancelledAtNULL, registeredAt ล่าสุด; new pair ยังคง201 / API+DB |
| S2-A-06 | กฎเดิม/precedence ไม่ถูกข้าม | S2-A-API-05: ACTIVE duplicate แม้ closed/full/quota; CANCELLED closed/full/quota → respective409, no write / API+DB |
| S2-A-07 | Quota คิด ACTIVE ตามวันไทยครบทุกแถว | S2-A-API-06: same/next Thai day, P1/P2, ACTIVE/CANCELLED, >200 rows และ legacy count3 → count/remaining/reactivation gate ตรง; legacy IDs ไม่ลบ / API+DB |
| S2-A-08 | Mutation/read ไม่ข้าม role หรือ ownership | S2-A-API-07: visitor, Organizer, foreign/absent ID, wrong CSRF, malformed/extra fields → 401/403/404/400 และ DB snapshot เดิม / API+DB |
| S2-A-09 | แข่งคำขอไม่คืนที่/ใช้โควต้าซ้ำ | S2-A-API-08: independent pools + barrier/lock observation; cancel/cancel, reactivate/reactivate, cancel/register และ cross-event quota races → legal serial outcome, ≤capacity, ≤2 สำหรับ new activations, row unique / API+DB |
| S2-A-10 | ผู้ใช้ทำ cancel → reload → reactivate ได้จริง | S2-A-UI-01: real seeded login + UI/API/DB; statuses/own ID/count/quota และ error feedback ถูก, no overflow ที่สอง viewport / E2E |
| S2-A-11 | ทุก read model ใช้ state เดียวกัน | S2-A-API-09: cancel/reactivate → public/owner/own/quota และ pagination ตรง; roster มี ACTIVE เท่านั้น own-list ยังเห็น CANCELLED / API+DB |
| S2-A-12 | Sprint 1/Lab6/Lab7 ที่ไม่เปลี่ยนยังทำงาน | S2-A-REG-01: build + inherited suites + selected journey/access/session/Location/Description checks; revision ของ fixtures/expected state อธิบาย ไม่ลด assertions ที่ไม่เกี่ยว / regression+E2E |

## 6. DoD และหลักฐาน

- [ ] แพรรีวิว contract และบันทึก revision/date ก่อน code
- [ ] เก็บ RED ที่ new cancel/state/quota behavior ยังไม่มีบนฐานจริง; แยก missing-feature assertion ออกจาก setup/compile failure
- [ ] เคสเดิมเดียวกัน GREEN; unit/API/DB/UI ตาม AC รันจริงและระบุ pass/fail/skip/SHA
- [ ] migration upgrade/persistence/concurrency/access และ regression ผ่าน ไม่มี secret หรือ reset production
- [ ] reviewed feature PR เข้า sprint2-staging; acceptance scope ชัด แล้วจึงเตรียม F-05B จาก staging ล่าสุด
- [ ] Sprint 2 release/main CI/GCP/post-deploy ตรวจหลังรวม F-05B; ยังไม่ปิดงาน F-05 ทั้งหมดจาก F-05A อย่างเดียว
