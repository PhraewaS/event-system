# F-05A — ยกเลิกและกลับมาลงทะเบียน

> Acceptance record: PhraewaS APPROVED contract9477808 ใน PR #86 วันที่25/11/2026 16:13:03น. UTC+7; mergeเข้าsprint2-stagingเป็นbb5aeccเวลา16:14:08 ก่อน test-first e5cf5c1 และ implementation a5bed71 ข้อความ proposal/planned ด้านล่างคง snapshot ก่อนเริ่ม code; ผล implementation แยกใน [evidence/status](../sprints/F-05A-implementation.md)

25 พฤศจิกายน 2026 · **Contract v2 accepted in #86; v2.1 clarifications ตาม review #87 รอตรวจ implementation** · Developer `guluJa`; reviewer `PhraewaS`; งาน F-05 เดิมใน [#8](https://github.com/PhraewaS/event-system/issues/8), capacity แยก [#85](https://github.com/PhraewaS/event-system/issues/85)

v2.1 คง business rules/AC เดิม และขยายหลักฐานตาม review #87: server-computed `canCancel`, stale-navigation protection, unique disposable DB ต่อ upgrade run และ capacity/roster API checks ทั้งสองรุ่น; cutover ใช้การ retire DB login และ terminate sessions ตาม [runbook](../../deploy/lifecycle-release.md) แทนการอ้าง request timeout ว่า writer จบแล้ว เก็บ contract v2 ก่อนแก้ไว้ในประวัติ PR #86

FR-06; BR-01–06/10/11; NFR-01–05. ฐานและลำดับงาน: [Sprint 2 plan](../sprints/sprint-2.md). Dependencies: F-01–04 และ Lab7 CR-L7-01 ที่ main e2b9842

## 1. กฎและ workflow

1. Participant ยกเลิกได้เฉพาะ ACTIVE registration ของตน เมื่อ database time **น้อยกว่า registration_deadline**; ใช้เวลาหลังได้ locks ไม่ใช้เวลาใน browser/เวลามาถึง request
2. ACTIVE → CANCELLED คืนหนึ่งที่นั่งและลด quota ของวันเริ่มกิจกรรมทันทีใน transaction ไม่ลบ record
3. ยกเลิกซ้ำของตนที่ CANCELLED แล้วคืน 200 พร้อม state เดิม แม้พ้น deadline; ไม่แก้ cancelledAt หรือคืนที่นั่งซ้ำ การตรวจ role/ownership/CSRF ยังคงทำก่อน
4. กลับมาลงทะเบียนใช้ POST registration เดิม ตรวจ deadline, ACTIVE capacity และ ACTIVE daily quota ใหม่ ใช้ row/ID เดิม กลับ ACTIVE; ห้ามเกิดสอง rows ของคู่ participant/event
5. ACTIVE ที่มีอยู่แล้วเป็น duplicate 409 แม้งานเต็ม/ปิด/quota เต็ม ลำดับ rejection สำหรับการเพิ่ม/กลับมา ACTIVE: duplicate → deadline → capacity → quota
6. Canceled rows ไม่นับที่นั่งหรือ quota; own-list/detail ยังดูได้ครบ ข้อมูล ACTIVE เก่าที่เกิน quota 2 คงไว้และยังอ่านได้ แต่เพิ่ม/activate ใหม่ไม่ได้เมื่อ count ≥2

## 2. Data / migration

เสนอ migration `003_registration_lifecycle.sql` (ตรวจเลขล่าสุดก่อนสร้างจริง) ภายใน transaction ของ migrator เดิม:

| Column | Contract หลัง migration commit | ข้อมูลเดิม / INSERT ของรุ่นเดิม |
| --- | --- | --- |
| status | TEXT NOT NULL DEFAULT 'ACTIVE'; CHECK ACTIVE/CANCELLED | ทุก row เดิมเป็น ACTIVE; INSERT ที่ไม่ระบุ column นี้ได้ ACTIVE |
| registered_at | TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() | เพิ่ม column แล้ว backfill จาก created_at ก่อน SET NOT NULL/DEFAULT; INSERT รุ่นเดิมได้เวลา activation จาก DB |
| cancelled_at | TIMESTAMPTZ NULL DEFAULT NULL | row เดิมและ INSERT รุ่นเดิมเป็น NULL |

- Backfill rows เดิมเป็น ACTIVE และ registered_at=created_at; คง id, created_at, participant_id, event_id และ UNIQUE(participant_id,event_id)
- CHECK ให้ ACTIVE มี cancelled_at=NULL และ CANCELLED มี cancelled_at ไม่เป็น NULL; initial/activation ตั้ง registered_at จาก DB clock; cancel ตั้ง cancelled_at ครั้งแรก ส่วน reactivation เคลียร์ cancelled_at
- ห้ามแก้ migration ที่ใช้แล้ว, reset/seed ทับ Cloud SQL หรือเปลี่ยนรหัสบัญชีเดิม
- ตรวจ upgrade ฐานที่มีข้อมูลสังเคราะห์เดิม รวม legacy >2; เปิด app/API pool ใหม่แล้วอ่าน IDs/states/counts ได้เดิม
- ไม่เพิ่มประวัติทุก transition เป็น subsystem ใหม่; created_at คือการสร้างครั้งแรก, registered_at คือ activation ล่าสุด, cancelled_at คือ cancellation ล่าสุดของ state ปัจจุบัน

### 2.1 การสลับ revision และ rollback

Defaults ทำให้ SQL INSERT ของรุ่นเดิมยังใช้ได้หลัง migration แต่รุ่นก่อน ACTIVE-only counting **ใช้ร่วมกับ CANCELLED ไม่ได้** จึงต้องเปิดใช้งานเป็นลำดับ ไม่รับรอง zero-downtime ขณะ DDL ถือ lock

1. เพิ่ม config ที่ไม่ใช่ secret `REGISTRATION_LIFECYCLE_WRITES_ENABLED` (true/false; default false) ใน implementation ภายหลัง PR contract นี้ เพื่อ gate เฉพาะ cancel/reactivation writes; normal new registration และ reads ยังใช้ได้
2. ทำ migration แบบ additive ก่อนสลับแอป ระหว่างนี้ต้องยังไม่มี CANCELLED และ lifecycle writes ปิดอยู่ ทั้ง API รุ่น e2b9842 และรุ่นใหม่ที่ปิด gate ต้องจองได้บน upgraded DB โดยไม่กรอก columns ใหม่
3. Deploy **state-aware revision** ที่ทุก count/read/write ใช้ ACTIVE ถูกต้อง แต่ gate ยัง false เก็บ SHA/digest/revision และผลตรวจเป็น compatible rollback target ใช้ replacement DB login/secret version ที่ revision เก่าไม่มี จากนั้นส่ง traffic ให้รุ่น compatible 100%, เอา traffic/tag routes เก่าออก แล้ว retire ทุก old runtime DB login (NOLOGIN), terminate sessions และพิสูจน์ old credentials reconnect ไม่ได้ตาม runbook ก่อนเปิด gate; timeout/traffic เพียงอย่างเดียวไม่ยืนยันว่า writer เก่าจบ
4. ผ่าน coexistence/count/access checks แล้วจึงเปิด gate ผ่าน controlled release/config update และบันทึก revision ใหม่/ค่า config หาก gate ปิด: cancel ACTIVE และ reactivation คืน 503 REGISTRATION_CHANGES_DISABLED โดยไม่เขียน; UI แสดงว่ายังไม่พร้อมและไม่แสดงผลสำเร็จ repeated cancel ของ CANCELLED ที่ตรวจสิทธิ์แล้วคง 200 state เดิมเพราะไม่เขียนข้อมูล
5. **หลังเปิด lifecycle ครั้งแรก หรือมี CANCELLED แล้ว ห้าม rollback ไป e2b9842 หรือ image ก่อน state-aware** แม้ปัจจุบันจะไม่มี CANCELLED เหลือ ให้ใช้เฉพาะ compatible target ที่เคยตรวจบน upgraded DB พร้อม CANCELLED; ปิด lifecycle writes ระหว่างกู้ระบบ แต่คง ACTIVE-only counts/reads และข้อมูลทุก row
6. Release/rollback preflight ต้องตรวจ approved SHA+digest และหลักฐาน compatibility ก่อนส่ง traffic; target ไม่มีหลักฐานให้ fail closed แล้ว roll forward ด้วยรุ่น compatible ใหม่ ไม่ลง database migration ย้อนกลับ ไม่ reset/seed และไม่เปลี่ยน CANCELLED กลับ ACTIVE เพื่อให้โค้ดเก่าอ่านได้ ตัว release script ปัจจุบันยังไม่มี compatibility gate นี้ ต้อง implement/verify เป็นส่วนหนึ่งของ F-05A ก่อน release

Acceptance tests ของ cancel/reactivate ตั้ง gate=true อย่างชัดเจน; coexistence และ disabled-path tests ตั้ง false การปิด gateไม่หยุด writer ที่ทำงานค้างทันที ต้องผ่าน database fence ก่อนตรวจ snapshot/เปิดใช้งานขั้นถัดไป ห้ามเปิด LOGIN คืนให้ old runtime หลัง activation

### 2.2 STS ของ compatibility (ขยาย S2-A-DB-01 / AC S2-A-01)

- **DB-01a upgrade:** เริ่มจาก populated schema 001/002; หลัง upgrade คง ID/created_at/FKs, status ACTIVE NOT NULL, registered_at=created_at, cancelled_at NULL; ตรวจ defaults/constraints จริง และ migrate ซ้ำไม่แก้ข้อมูล
- **DB-01b old/new coexistence:** ใช้ actual API จาก immutable e2b9842 และ state-aware API gate=false บน DB ที่ upgrade แล้ว (ยังไม่มี CANCELLED) ให้แต่ละรุ่น POST รายการใหม่จริง ตรวจ 201, default columns, quota/capacity/roster ตรงกันและไม่มี NOT NULL failure ไม่ใช้ mock-only หรือ INSERT จำลองอย่างเดียวแทน API รุ่นเดิม
- **DB-01c rollback data:** สร้าง ACTIVE/CANCELLED ที่รู้ผลในรุ่นใหม่; เปลี่ยน app/pool เป็น approved compatible target แล้วตรวจ IDs/states/cancelledAt คงเดิม public/owner counts และ quota นับ ACTIVE เท่านั้น own-list ยังเห็น CANCELLED ของตน backend role/ownership ยังบังคับใช้
- **S2-A-DEPLOY-01:** offline release/traffic stub ทดสอบว่า incompatible/unverified target ถูกปฏิเสธก่อนเปลี่ยน service/traffic; compatible rollback ไม่ migrate/seed/down schema และ record SHA/digest/config ตรงกัน; ตรวจ gate=false คืน503/no write สำหรับ active cancel/reactivation, repeated-cancel200 และ normal registration ยังทำงาน
- **S2-A-DEPLOY-02/03:** local PostgreSQL กับ synthetic old/new login roles; หลัง fence old in-flight transaction commit ไม่ได้, session=0, reconnect ถูกปฏิเสธ และ new login ยังใช้ได้; ถ้า old/new ใช้ role เดียวกันต้องปฏิเสธก่อนเปลี่ยน role
- Upgrade suite สร้าง DB ใหม่ชื่อสุ่มต่อ run; reset/drop ได้เฉพาะ DB ที่ run นั้น CREATE สำเร็จ รวม legacy extraction directory แยกกัน จึงไม่ชน run อื่น
- ก่อน production acceptance เก็บ actual release/config/traffic binding และ selected post-deploy compatibility/persistence checks แยกจาก offline tests; ณ proposal นี้ทั้งหมดยัง planned/not run

อ้างอิงกลไก: [PostgreSQL 17 ALTER TABLE/defaults](https://www.postgresql.org/docs/17/ddl-alter.html), [Cloud Run traffic/revision rollback](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration). การเลือก lifecycle gate และ compatible target เป็นการออกแบบของทีม ไม่ใช่การรับรอง compatibility โดย Cloud Run

## 3. API และ errors

ทุก mutation: session, role PARTICIPANT, CSRF, UUID และ strict JSON; identity มาจาก server ห้ามรับ participantId/status/timestamps จาก client

| Operation | Request / response | ข้อผิดพลาดสำคัญ |
| --- | --- | --- |
| POST `/api/registrations/:id/cancel` | `{}`; 200 `{data:{id,eventId,participantId,createdAt,status,registeredAt,cancelledAt}}` | foreign/nonexistent 404 NOT_FOUND; ACTIVE ที่ now≥deadline: 409 CANCELLATION_CLOSED |
| POST `/api/events/:id/registrations` | `{}`; new row 201, reactivation 200; response fields เดิมพร้อม state fields ข้างต้น | คง 409 DUPLICATE_REGISTRATION / REGISTRATION_CLOSED / EVENT_FULL / DAILY_REGISTRATION_LIMIT; ไม่มี insert/update เมื่อถูกปฏิเสธ |
| GET own-list / own-detail | ทั้ง ACTIVE/CANCELLED ของตนพร้อม state fields; pagination ≤200 และ continuation เดิม | คง role/ownership; ไม่คืนข้อมูลคนอื่น |
| GET event list/detail, owned events/roster, quota | event counts/registrationOpen/roster ใช้ ACTIVE เท่านั้น; quota ใช้ ACTIVE ต่อ participant/วันไทย | public ไม่เพิ่ม private quota/รายชื่อ; quota query validation/no-store เดิม |

ร่วมกัน: Visitor401, wrong-role403, CSRF403, malformed UUID/body/extra field400 ตาม code เดิม; auth/role/CSRF ก่อน payload/domain checks การค้น cancel ต้อง scope ด้วย participant ของ session เพื่อคง foreign404 เมื่อ lifecycle gate ปิด ให้ตรวจ ownership/state ก่อนคืน503ของ write ที่ถูกปิด; เมื่อ gate เปิดใช้ domain precedence เดิมข้างต้น

## 4. Transaction และ UI

ใช้ client เดียว BEGIN/COMMIT/ROLLBACK; register/reactivate/cancel lock Participant → Event แล้วตรวจ state ซ้ำภายใต้ lock การอ่าน registration เพื่อหา event ก่อน lock ไม่ถือเป็นสิทธิ์หรือ state สุดท้าย ทุก failure rollback และ release client ใน finally

การ cancel/register/reactivate ของคนเดียวต่าง event serialize ด้วย Participant lock; capacity update ของ F-05B lock Event เท่านั้น จึงไม่ย้อนลำดับหรือล็อก Participant หลัง Event อ่าน count จาก DB ไม่เก็บ mutable seat/quota counter

UI My registrations/detail: server ส่ง `canCancel` จาก ACTIVE + DB clock ก่อนdeadline + lifecycle gate; UI อิงค่านี้ ไม่ใช้เวลาเครื่องผู้ใช้ตัดสิน และ backend ตรวจใหม่ภายใต้ lock ทุกครั้งเพราะ eligibility อาจเก่าได้ CANCELLED แสดงสถานะและทางกลับไปลงทะเบียน; ห้ามแสดง CANCELLED เป็น Confirmed Event Detail ใช้ ACTIVE state แทนการเช็กแค่ว่ามี row อยู่ Loading/error/retry/conflict ต้องอ่าน state/count/quota ใหม่หลัง mutation และคง session-generation guards ของ Lab7; ผล mutation ที่กลับหลัง unmount/ย้าย URL ต้องไม่ replace URL หรือแสดง feedback ในหน้าใหม่ ตรวจ client clock skew และ delayed cancel response ที่ 390×844 และ 1440×1000 (API-10/UI-03/UI-04)

## 5. AC และ STS ก่อน implementation

Test IDs ต่อไปนี้เป็น **planned** ไม่ใช่ executable tests หรือ PASS ชื่อไฟล์เสนอ `tests/registration-lifecycle*.test.ts` และ `tests/e2e/registration-lifecycle.spec.ts`; บันทึกชื่อจริงหลังสร้าง

| AC | Observable result | STS: inputs/preconditions/action → expected / level |
| --- | --- | --- |
| S2-A-01 | Upgrade, old-app compatibility และ state-aware rollback ไม่เสียข้อมูล/นับผิด | S2-A-DB-01a–c ตาม §2.2: constraints/defaults/backfill, actual old/new API บน upgraded DB, rollback บน ACTIVE/CANCELLED; S2-A-DEPLOY-01 gate/preflight/traffic stubs / API+DB+deployment |
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

- [ ] PhraewaS รีวิว contract และบันทึก revision/date ก่อน code
- [ ] เก็บ RED ที่ new cancel/state/quota behavior ยังไม่มีบนฐานจริง; แยก missing-feature assertion ออกจาก setup/compile failure
- [ ] เคสเดิมเดียวกัน GREEN; unit/API/DB/UI ตาม AC รันจริงและระบุ pass/fail/skip/SHA
- [ ] migration upgrade/persistence/concurrency/access และ regression ผ่าน ไม่มี secret หรือ reset production
- [ ] S2-A-DB-01a–c / S2-A-DEPLOY-01 ผ่าน; มี compatible rollback target และ release gate จริงก่อนเปิด lifecycle ในระบบร่วม
- [ ] reviewed feature PR เข้า sprint2-staging; acceptance scope ชัด แล้วจึงเตรียม F-05B จาก staging ล่าสุด
- [ ] Sprint 2 release/main CI/GCP/post-deploy ตรวจหลังรวม F-05B; ยังไม่ปิดงาน F-05 ทั้งหมดจาก F-05A อย่างเดียว
