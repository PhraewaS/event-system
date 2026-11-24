# CR-L7-01: revised engineering contract — daily registration quota

Version: **proposal v1 — 24 November 2026**. Status: **pre-implementation / awaiting teammate review**. Change owner guluJa; reviewer PhraewaS. Rule source: team-selected Lab 7 change under the instructor's approval-waiver announcement. Full request: [CR-L7-01](CR-L7-01.md).

## 1. Baseline and old/new SRS excerpts

- Accepted Sprint 1 after Lab 6, and actual pre-change main: `da02edd0258aed2aaf6847f87577a717e8f533e9`.
- Deployed baseline `gather-00012-7lx`; [release #80](https://github.com/PhraewaS/event-system/pull/80), [independent acceptance](https://github.com/PhraewaS/event-system/issues/76#issuecomment-7102627014).
- ไม่มี intervening Sprint 2/3 implementation ใน baseline ที่ตรวจขณะเตรียม proposal นี้ หากเริ่มบนรุ่นใหม่ให้บันทึก SHA/diff และ impact เพิ่มก่อน code.
- Historical release `v0.1.0` และผล Lab 6 คงเดิม ไม่แก้ tag, recorded results หรือข้อจำกัดเดิมย้อนหลัง.

| ส่วน | Old accepted behavior | Proposed replacement/addition |
| --- | --- | --- |
| FR-04 / F-03 | Participant จองและเรียกดูรายการตน; ไม่เกิน capacity; ไม่ซ้ำ event เดียวกัน; ก่อน deadline | คงพฤติกรรมเดิม และการเพิ่ม registration ต้องไม่ทำให้ Participant มี registrations ที่นับ quota เกิน 2 สำหรับวันเริ่มกิจกรรมเดียวกันใน Asia/Bangkok |
| New BR-11 | ไม่มีกฎ aggregate quota ข้าม event | แต่ละ Participant/date มี limit 2; ใช้ server-owned identity และ persisted registrations; ตรวจและ insert ใน transaction ที่ serialize ต่อ participant และ event |
| AC-06 / AC-07 revision | คำขอไม่ซ้ำ ก่อนปิดและมีที่ว่างได้ 201 | เพิ่ม quota gate หลัง existing rejection rules; quota เต็มได้ 409 DAILY_REGISTRATION_LIMIT โดยไม่ insert |
| DEC-08 | ไม่มีการตัดสินใจเรื่องจำนวนกิจกรรมต่อวัน | fixed limit 2, timezone Asia/Bangkok, legacy grandfathering และ lock order ตามเอกสารนี้; รอ teammate ยืนยันใน contract review |
| Preserved BR-01–04 / AC-08–11 | capacity/duplicate, deadline equality, privacy, owner roster | คงเดิม; quota ไม่เปิดทางข้าม authentication, role, CSRF, ownership, deadline หรือ capacity |

### 1.1 นิยาม quota

`eventDay = (events.starts_at AT TIME ZONE 'Asia/Bangkok')::date`.

`registeredCount(participant,eventDay)` นับ registration ของ participant จาก identity ใน session ที่ join กับ events แล้วได้วันเดียวกัน ไม่ใช้ registration.created_at และไม่จำกัดเพียงข้อมูลหน้าแรกของ My registrations.

- ใน schema Sprint 1 ปัจจุบันไม่มี cancellation/status column จึงนับ registrations ที่มีอยู่ทั้งหมดของคน/วันนั้น.
- การผ่าน start time ไม่ลบการนับ; ไม่ใช่กฎห้ามเวลาซ้อนทับ และไม่ใช้ duration ของกิจกรรม.
- เมื่อ Sprint 2 #8 เพิ่ม ACTIVE/CANCELLED ต้องปรับ query ให้ ACTIVE เท่านั้นและใช้ quota gate เดียวกันตอน reactivation ผ่าน contract/PR ของ #8 ไม่อ้างว่า logic นั้นรันได้แล้วใน schema ปัจจุบัน.
- `remaining = max(0, 2 - registeredCount)`. ข้อมูลเดิม 3 รายการแสดง count 3, remaining 0 และดูรายการเดิมได้ครบ.

### 1.2 Boundary examples

ตัวอย่างวันสำหรับ fixture: 2–3 มกราคม 2027; ใน tests ที่รันจริงต้องตั้ง event และ deadline ให้อยู่ในอนาคตของ database clock.

| Instant เริ่มงาน | วันไทยที่ใช้ quota |
| --- | --- |
| 2027-01-02T16:59:59.999Z | 2027-01-02 เวลา 23:59:59.999 +07:00 |
| 2027-01-02T17:00:00.000Z | 2027-01-03 เวลา 00:00:00 +07:00: เป็นวันใหม่ |
| 2027-01-03T00:00:00.000Z | 2027-01-03 เวลา 07:00 +07:00: นับวันเดียวกับแถวก่อน แม้ UTC คนละวัน |

ค่าที่แทน instant เดียวกันด้วย `Z` หรือ offset ต่างกันต้องนับเหมือนกัน ใช้ timezone ที่ contract กำหนด ไม่ขึ้นกับ timezone ของ OS/browser หรือ session database.

## 2. Feature SDS: behavior and error precedence

### 2.1 POST /api/events/:id/registrations

Request และ successful response คงรูปแบบเดิม: Participant session + CSRF, valid UUID, strict empty JSON object `{}`; successful status **201** พร้อม `{data:{id,eventId,participantId,createdAt}}`.

ลำดับ validation/transaction ที่เสนอ:

1. Authentication → role PARTICIPANT → CSRF → UUID/strict body validation ตาม route เดิม.
2. `BEGIN` โดยใช้ checked-out pg client เดียวจนจบ transaction.
3. Lock participant row (`users`) ก่อน event: participant ID มาจาก server-owned session. หาก identity ไม่อยู่แล้วให้ rollback และปฏิเสธตาม auth contract โดยไม่ insert.
4. Lock target event row `FOR UPDATE`; event ไม่พบให้ rollback/404.
5. อ่าน database clock หลัง lock, duplicate และจำนวน registrations ของ event. คง priority **duplicate → deadline → capacity**.
6. หากกฎเดิมผ่าน คำนวณวันไทยของ event และ count quota ของ participant/date จาก DB ภายใต้ participant lock. count ≥ 2 ให้ rollback/409 DAILY_REGISTRATION_LIMIT.
7. หาก count < 2 ให้ insert exactly one registration แล้ว COMMIT. ทุก rejection/error rollback และ release client ใน finally.

| เงื่อนไข | HTTP / code | ผลต่อข้อมูล |
| --- | --- | --- |
| ไม่ login / role ผิด / CSRF ผิด | 401 UNAUTHENTICATED / 403 FORBIDDEN / 403 CSRF_INVALID ตามเดิม | ไม่เปลี่ยน |
| UUID หรือ body ผิด/มี participantId ปลอม | 400 VALIDATION_ERROR ตามเดิม | ไม่เปลี่ยน |
| UUID ถูกแต่ event ไม่พบ | 404 NOT_FOUND | ไม่เปลี่ยน |
| event เดิมมี registration ของตนแล้ว | 409 DUPLICATE_REGISTRATION แม้ quota เต็ม/งานเต็ม/ปิด | ไม่เพิ่ม ไม่แปลงเป็น success |
| DB now ≥ registration_deadline | 409 REGISTRATION_CLOSED แม้ quota เต็ม | ไม่เปลี่ยน |
| event count ≥ capacity | 409 EVENT_FULL แม้ quota เต็ม | ไม่เปลี่ยน |
| กฎเดิมผ่าน แต่ quota count ≥ 2 | 409 DAILY_REGISTRATION_LIMIT | ไม่เพิ่ม registration และที่เหลือ/roster ทุก event คงเดิม |
| กฎเดิมผ่าน และ quota count < 2 | 201 payload เดิม | เพิ่มหนึ่งแถวพร้อม quota/capacity ที่ถูกต้อง |

ตัวอย่าง error ใหม่ที่เสนอ:

```json
{"error":{"code":"DAILY_REGISTRATION_LIMIT","message":"You can register for at most 2 events on the same day (Asia/Bangkok)."}}
```

ไม่ส่งรายชื่อกิจกรรมของคนอื่น จำนวน quota ของคนอื่น password/session หรือรายละเอียด SQL ใน error.

### 2.2 GET /api/registrations/quota?date=YYYY-MM-DD (new private read endpoint)

Purpose: ให้ Participant เห็น quota ของตนสำหรับวันไทยที่ระบุ เพื่อแสดงสถานะบน event detail. ต้องประกาศ static route **ก่อน `/api/registrations/:id`** เช่นเดียวกับ `/mine` เพื่อไม่ตีความ `quota` เป็น registration UUID.

- Authentication และ PARTICIPANT role มาก่อน query validation; Visitor 401, Organizer 403.
- ไม่มี CSRF requirement สำหรับ GET read-only; ใช้ same-origin cookie และ Cache-Control: no-store ตาม API เดิม.
- query ต้องมี `date` เพียงหนึ่งค่าในรูป exact `YYYY-MM-DD` ซึ่งเป็นวันจริงของปฏิทิน Gregorian (ปี 0001–9999). ไม่รับ array, duplicate date params, extra params หรือ participantId.
- missing/malformed/impossible date เช่น `2027-02-30` หรือ participantId query เพิ่ม → 400 VALIDATION_ERROR; ไม่แก้ DB.
- date ที่ถูกต้องแต่ไม่มี registration ของตน รวมถึงอดีต/อนาคต → 200 count 0. การอ่าน quota ของวันเก่าไม่เท่ากับการอนุญาตให้ลงทะเบียน event ที่ปิดแล้ว.
- ใช้ aggregate ทุกแถวของผู้ใช้ที่ตรงวัน ไม่ใช้ event pagination ของ UI. Legacy count เกิน 2 ไม่ถูกซ่อน/ปรับลง.

```json
{"data":{"date":"2027-01-03","timeZone":"Asia/Bangkok","limit":2,"registeredCount":2,"remaining":0,"canRegister":false}}
```

`canRegister` หมายถึงมี quota เหลือเท่านั้น เป็น advisory snapshot ไม่รับรอง role/deadline/capacity ของ event และไม่ใช่ reservation token. POST ต้องตรวจใหม่ภายใน transaction เสมอ.

## 3. System SDS / data / concurrency

| รายการ | Proposed design และ invariant |
| --- | --- |
| Lock order | registration writers: **participant → target event** เสมอ; participant lock serialize คนเดียวกันข้าม event/API instances; event lock รักษา last-place safety ข้ามคน |
| DB clock | อ่านหลังได้ lock ที่จำเป็น เพื่อคง deadline behavior เมื่อรอ lock จนเลยเวลา |
| Atomicity | count + rule checks + insert อยู่ใน transaction/client เดียว; failed quota ไม่กระทบ event counts, IDs, roster หรือ session |
| Same participant race | มีอยู่ 1 แล้วขอ B/C พร้อมกันในวันเดียวกัน สำเร็จได้หนึ่ง requestเท่านั้น; อีกคำขอเห็น count ใหม่หลังรอ lock และได้ DAILY_REGISTRATION_LIMIT |
| Different participant last place | quota แยกกัน; event lock ยังคงให้ที่นั่งสุดท้ายหนึ่งคน แม้ต่าง API/pool |
| Future #8 writers | cancellation/reactivation ต้องร่วม participant → event ordering; capacity-only writers ไม่เริ่มล็อก participant ภายหลัง event แบบกลับทิศ ต้องทบทวน lock graph ใน #8 ก่อน implement |
| Schema/migration | proposal นี้ไม่เพิ่ม column หรือ table; starts_at, participant/event FKs และ unique(participant_id,event_id) มีอยู่แล้ว จึง **ไม่ต้อง migration** เพื่อเปลี่ยนกฎนี้ |
| Index/performance | ใช้ participant-leading unique index เดิมจำกัด candidate registrations แล้ว join events by PK; หากการวัดพบต้องเพิ่ม index ให้ review เป็น migration แยก ไม่แก้ 001_initial.sql ย้อนหลัง |
| Historical data | อ่านและนับเดิมทุกแถว ไม่มี backfill ลบ ย้ายวัน หรือบังคับลด >2; quota เต็มปฏิเสธเฉพาะการเพิ่มใหม่ |
| Pool/resources | release/rollback ตามเดิม; failure ไม่ทำให้ pg client ค้าง; ไม่ใช้ in-memory counter เป็น authority เพราะหลาย instance ต้องเห็นข้อมูลเดียวกัน |

## 4. UI and client contract

ที่ Event Detail สำหรับ Participant ให้แสดงวันไทยของ event และ quota snapshot เช่น `Registrations on 2027-01-03 (Asia/Bangkok): 1 / 2`. คำนวณวันที่ target จาก event.startsAt โดย fixed timezone ที่ตรง server และส่ง ISO date string ไป private endpoint.

- ลำดับสถานะ UI: already registered → full/closed ตาม event → quota state. ผู้ที่ลงทะเบียน event นี้แล้วต้องยังเห็น `You’re registered` / link ดูรายการ แม้ quota วันนั้นเต็ม.
- loading quota: แสดง loading และไม่ให้กดจองจนมี snapshot หรือแสดง error/retry ที่ชัดเจนเมื่ออ่านไม่ได้. ไม่ตีความ network error เป็น quota 0 หรือ quota ผ่าน.
- count ≥ 2 และยังไม่ registered: แสดง daily-limit message และปิดปุ่มจอง แต่ server POST ยังเป็น authority ป้องกัน stale UI/direct API.
- quota ยังเหลือ: กดจองตาม workflow เดิม; หากคำขอแพ้ race แล้วได้ DAILY_REGISTRATION_LIMIT ให้แสดงข้อความและ refresh snapshot โดยคง event เดิมไว้.
- Visitor/Organizer ไม่ fetch private Participant quota และยังใช้ข้อความ sign-in/role/owner UI เดิม.
- key/cache ของ resource ต้องผูก event ID + current user ID + revision; logout/login สลับ account ต้องล้างสถานะ quota เก่า และผล response ที่กลับช้าของ account เก่าห้ามแทน state ของคนใหม่.
- My registrations/owner roster ยังแสดงข้อมูลเดิมครบ; ไม่ตัดรายการ legacy ให้เหลือสอง. Public events/detail `registrationOpen` ยังหมายถึงเวลาและ capacity ของ event ไม่ใส่ private per-user quota ลง public API.
- รองรับ 390×844 และ 1440×1000 โดยไม่ล้น มี label/status/alert ที่สังเกตได้. “1 places left” เป็น known minor limitation เดิมนอก scope นี้.

## 5. Impact / traceability table (proposed revision)

| Requirement / responsibility | Contract sections affected | Proposed AC | Planned verification / modules |
| --- | --- | --- | --- |
| FR-04 / F-03 / new BR-11 | SRS FR-04; F-03 transaction; System data/lock design §§1–3 | Q01–Q04, Q08–Q10 | L7-Q-API-01/02/05/06/07/08; server/src/registrations.ts |
| BR-01/02/03 and DEC-01 | preserve capacity/duplicate/deadline priority; lock/time §2.1/3 | Q05/Q08 | API-03/06/07; tests/rules.test.ts and existing REG-CONC/BOUND |
| BR-04 / NFR-02 / F-01 | identity/role/CSRF; private read §2 | Q06/Q07/Q12 | API-04/09/10; app.ts/validation.ts, auth/owner regressions |
| NFR-01 / NFR-05 | historical data/persistence/migration §3 | Q09/Q10 | API-08; fresh app/pool + schema/migration checks |
| NFR-03 / F-03 UI | quota and auth state §4 | Q11–Q13 | UI-01/02/03; client/src/App.tsx, api.ts, styles only if necessary |
| NFR-04 | aggregate not first-page only; strict date query §2.2 | Q04/Q07/Q10 | UNIT-01/02; API-02/09/10, bounded response inspection |
| SYS-QUALITY / SYS-DELIVERY | contract/version/tests/review/CI/deploy §§6–8 | Q14 | full regression, CI evidence, post-deploy checks |
| FR-06 / F-05 / #8 (future dependency) | ACTIVE/CANCELLED count + reactivation and lock ordering | future F-05 AC must reference Q08/Q09 | Plan only in this PR; implementation/evidence belongs to #8 |

## 6. Acceptance criteria

All IDs below are **proposed and unexecuted**. `AC-L7-Qxx` is the full ID; abbreviations Qxx in the tables refer to it.

| AC | Given / When / Then |
| --- | --- |
| AC-L7-Q01 | Given eligible future events A/B/C on one Thai date and a Participant with no registrations that date, registering A then B succeeds 201 with persisted own rows. |
| AC-L7-Q02 | Given count 2 (or greater legacy count) for the Thai date and a different eligible event C, POST C returns 409 DAILY_REGISTRATION_LIMIT; registration IDs/counts and rosters remain unchanged. |
| AC-L7-Q03 | Given count 2 on date D, an eligible event on D+1 still allows registration; another Participant's quota on D is independent. |
| AC-L7-Q04 | Given starts_at values on the Thai midnight boundary or equivalent offsets, count/query/UI classify exact instants into the same Thai calendar dates independently of browser/DB-session timezone. |
| AC-L7-Q05 | Duplicate, closed-at-equality and full-event checks keep the existing HTTP/code and precedence before quota; failed requests never write. |
| AC-L7-Q06 | Anonymous, Organizer, invalid-CSRF, malformed UUID, forged participantId/nonempty POST and missing event preserve their existing denials and privacy without inserting rows. |
| AC-L7-Q07 | GET quota returns only current Participant's aggregate fields for one valid calendar date; Visitor 401, Organizer 403, invalid/missing/duplicate/extra params 400, all with no writes or disclosure. |
| AC-L7-Q08 | Given count 1 and two different eligible events on D, truly competing requests across independent DB/API pools produce exactly one 201 and one DAILY_REGISTRATION_LIMIT; final participant count 2. Different participants still cannot oversubscribe one last seat. |
| AC-L7-Q09 | Pre-change registrations, including >2 on one date, keep IDs, dates, ownership, visibility and roster counts after release. count reflects existing data, remaining floors at 0, and fresh app/pool reads the same persisted state. |
| AC-L7-Q10 | The count uses all persisted relevant rows, including rows outside the first 200-item My registrations page. Current schema has no CANCELLED column; future F-05 exclusion/reactivation changes must be separately contracted. |
| AC-L7-Q11 | Participant event detail displays own date/quota, disables reserve when limit reached, handles failed reads/retry and stale POST conflict, and keeps already-registered navigation available. |
| AC-L7-Q12 | Switching identity/logout discards previous private quota state; anonymous/Organizer UI does not call the private endpoint as a Participant. Late old-account responses cannot overwrite current account state. |
| AC-L7-Q13 | Changed quota/error UI is readable at 390 and 1440px with status/alert labels, while normal publication/registration/own-list/owner-roster and preserved Lab 6 location/description behavior remain usable. |
| AC-L7-Q14 | Issue → reviewed contract → meaningful RED on pre-change implementation → GREEN with the same changed-rule assertions → regression/review/CI/staging → reviewed main release/GCP → selected new/preserved behavior checks are traceable to actual versions/results. |

## 7. Software Test Specification (STS) — design only

Fixtures: four synthetic demo roles plus isolated test participants where needed; at least three distinct future eligible events per tested Thai date, capacity 10 unless testing last-place; independent agents/CSRF and separate real pg pools for concurrency. Tests use a disposable DB whose name ends `_test`, never Cloud SQL/shared live reset.

| Planned test ID | AC | Level / input / action | Expected and evidence to capture |
| --- | --- | --- | --- |
| L7-Q-UNIT-01 | Q04 | Pure date helper: instants around Thai midnight, same instant in different offsets, browser-zone-independent date output | exact expected YYYY-MM-DD; capture command/source/result |
| L7-Q-UNIT-02 | Q02/Q07/Q09 | strict date validation + remaining for counts 0/1/2/3 and invalid calendar values | remaining 2/1/0/0; canRegister true/true/false/false; reject invalid query |
| L7-Q-API-01 | Q01/Q02 | New participant, same-day events A/B/C; POST via existing public contract, no schema-only fixtures | A/B 201, C 409 DAILY_REGISTRATION_LIMIT; IDs and counts before/after C unchanged. **Primary RED:** old code incorrectly returns C=201. |
| L7-Q-API-02 | Q03/Q04 | Same participant new Thai day, another participant same day, exact midnight and different UTC date cases | correct per-person/day isolation; valid choices 201; check own quota responses |
| L7-Q-API-03 | Q05 | Quota already full plus duplicate/full/closed independently; boundary DB now == deadline and blocked-lock crossing deadline | preserve error priority/codes; no inserts |
| L7-Q-API-04 | Q06 | anonymous, O1, missing/wrong CSRF, nonempty participantId body, invalid UUID and missing event | existing 401/403/400/404; saved state unchanged |
| L7-Q-API-05 | Q02/Q07 | count 2 then direct API bypass of UI; request quota before/after POST rejection | POST 409; GET count/remaining unchanged; no event capacity change |
| L7-Q-API-06 | Q08 | One existing row; same Participant across independent app/pool instances POST B/C concurrently; use start barrier and lock-wait observation rather than arbitrary sleep | exactly one 201 and one quota rejection; count 2; both event rosters consistent |
| L7-Q-API-07 | Q05/Q08 | Different Participants with available quota race for one last seat | exactly one 201, other EVENT_FULL; original capacity invariant retained |
| L7-Q-API-08 | Q09 | Insert an explicitly labelled pre-change fixture with 3 existing registrations, create fresh API/pool, read mine/owner/quota, attempt fourth | IDs/rows retained; GET count 3/remaining 0; POST fourth rejected; persistence real DB |
| L7-Q-API-09 | Q07 | GET date valid/none/malformed/Feb30/duplicate/extra participantId; identities P1/P2/O1/V | response schema and 200/400/403/401; no other-user data and no writes |
| L7-Q-API-10 | Q07/Q10 | Many owned rows across dates plus relevant rows beyond first response page; target-day sum and static route dispatch | aggregate exact and not capped at 200; /quota resolves static route; /mine and /:uuid still behave correctly |
| L7-Q-UI-01 | Q11/Q13 | Real form creates events; Participant registers two, opens third; observe own count, disabled reserve; visit already registered event and next-day event at desktop/mobile | quota message understandable; already registered link preserved; next-day flow works; no page overflow |
| L7-Q-UI-02 | Q11/Q12 | quota read delayed/failed then retry; stale request after another session uses last quota slot; P1→logout→P2→Organizer | actual user/role keyed state, safe loading/error handling and correct conflict refresh; explicit network fault injection labelled separately from real-data paths |
| L7-Q-UI-03 | Q13 | existing publish → register → own record → owner roster; role/ownership; long description/location regression | preserved user paths and errors, stored rows consistent at 390/1440px |

### 7.1 Tests and existing-fixture compatibility

Primary RED adds tests before implementation using **existing POST publication/registration endpoints** and valid baseline fields. It must reach the third registration and fail because old code returns 201; a missing future column, broken fixture, compile error, or only a 404 on a new route is insufficient as the sole RED evidence.

When adding the private endpoint, a separate missing-route RED can supplement but not replace the domain-rule RED above. The concurrency test must demonstrate competing requests, not merely two sequential calls.

The baseline suite currently shares seeded users across many tests. The new legitimate cross-event rule can make unrelated tests accidentally consume one user's daily quota. In the **test-design/RED stage**, isolate those existing fixtures by unique participants or test dates while retaining their existing capacity/duplicate/auth/ownership assertions. Before implementation, require all preserved tests to pass and the changed-rule tests alone to fail for the intended reason. Commit/explain fixture-only revisions; do not delete/skip old tests to make the suite green.

Existing >200-row fixtures for pagination/rosters may remain explicitly labelled legacy/direct DB fixtures to test read invariants; they do not prove new POST can create unlimited same-day registrations. If an existing test truly asserts the superseded unlimited rule, revise only that expectation and document its mapping to CR-L7-01.

### 7.2 Relevant regression and version evidence

Run root `npm run build`, `npm test -- --reporter=verbose`, browser `npm run test:e2e`, existing offline deploy/smoke checks, normal CI/Compose/Docker build. Preserve tests for registration race/deadline/pool recovery/pagination, identity/session/CSRF, owner roster and Lab 6 fixes. Explain any legitimate changed expectations and report passed/failed/skipped counts per exact suite/run/commit.

64 unit/API/client + 16 browser tests are **historical baseline results** at da02edd (main CI 45125868536/deploy 45125868584). The future suite's size/results are not known yet. No Lab 7 tests or pass output are claimed by this document.

## 8. Definition of Done / release readiness

- [ ] guluJa creates the GitHub Issue and links CR-L7-01 in the documentation PR; scope/IDs/date/baseline are accurate.
- [ ] PhraewaS substantively reviews this contract before implementation; record actual reviewed commit, message/time and resolution of any changes.
- [ ] New-rule RED fails for missing quota behavior on pre-change code with valid fixtures; preserve test source, command, SHA and actual output.
- [ ] GREEN passes the same changed-rule tests; persistence, concurrency, timezone, roles and legacy behavior meet ACs.
- [ ] Existing relevant regression remains covered; fixture/expected-result revisions explained; counts and failures/skips honest.
- [ ] Implementation PR reviewed, CI passed, integrated into sprint staging, then reviewed main release through normal project workflow.
- [ ] GCP deployed SHA/digest/revision/URL recorded; post-deploy check second/third same-day and next-day behavior, role/privacy and important preserved journey using synthetic data.
- [ ] Metrics/readiness/retrospective and self-contained PDF follow [evidence-plan.md](evidence-plan.md); no credentials in Git/PDF.
- [ ] Record preserved minor limitations and new findings; READY refers only to maintained Sprint 1 scope, not completed Sprint 2/3.

Implementation, test execution, approvals, deployment and all checkboxes remain **pending** in this proposal.
