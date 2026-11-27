# CP-v1 STS — credential fence ก่อน lifecycle activation

27/11/2026 · [Contract/AC](../features/F-05A-cloudsql-credential-retirement.md) · Issue #8 · Owner `guluJa` / independent reviewer `PhraewaS`

**Test design ก่อน implementation: CP-01–CP-16 ยัง not run ทั้งหมด** JSON vectors เป็นข้อมูลเตรียม tests ไม่ใช่ automated execution results การตรวจ parse/traceability ของไฟล์นี้ไม่ใช่ GREEN ของ credential fence

## Fixtures / วิธีรันใน implementation ถัดไป

- Offline unit: mocked management operations มี pending/success/permission-denied/readback-mismatch และ call recorder ตรวจ ordering ห้ามเรียก gcloud/Google SDK/production URLs
- Integration: disposable local PostgreSQL17, synthetic distinct old/new/operator roles และอย่างน้อยสอง DB ที่ run เป็นผู้สร้างเท่านั้น ไม่มี Cloud SQL/production credentials ไม่รันใน PR contract นี้
- Old pool เปิด transaction ค้างก่อน fence และใช้ barrier/lock observation ยืนยันว่าคำสั่งถูกส่งจริง ห้ามใช้ sleep อย่างเดียวแทน concurrency proof
- ใช้ actual SQLSTATE: local password retirement ต้องทดสอบ auth ที่ตรง Cloud SQL built-in password และใช้รหัสเดิมที่ positive control ผ่านแล้ว ไม่เก็บ passwords ใน logs
- ค่า fixtures และ expected outcomes อยู่ใน [cases.json](cloudsql-credential-retirement-cases.json); `allow_proof_review` หมายถึงพร้อมให้คนตรวจ credential-fence proof **ไม่ใช่ allow activation**
- Future CP-aware runner/validator ยังไม่มี ใน implementation PR ต้องเพิ่ม meaningful RED ก่อน code และ GREEN ของเคสเดิม ไม่ใส่ expectedFailure/skip แล้วนับว่า fence ผ่าน

## Case specification

| Test ID / AC | Level | Inputs / preconditions / action | Expected result | Status |
| --- | --- | --- | --- | --- |
| CP-01 / 01 | Unit, mocked API | ไม่มี accepted contract หรือ change approval/window; ขอเริ่ม fence | Reject ก่อน reset/revoke/terminate ทุกชนิด; call log ไม่มี mutations | Planned |
| CP-02 / 01 | Unit + local catalog | inventory ขาด writer/auth/path หรือ operator=old/new | Reject พร้อมรายการที่ขาด/role conflict; ไม่มี mutation | Planned |
| CP-03 / 02 | Unit + local integration | new runtime/migrator แยก role, isolated pinned secret, old identity เข้าไม่ถึง; เริ่มเตรียม fence | ผ่าน readiness เฉพาะขั้นนี้ ไม่ activate; roles/versions ตรง inventory | Planned |
| CP-04 / 02 | Unit, mocked IAM | shared old SA หรือ impersonation path ยังอ่าน new secret ได้ แม้ชื่อ secret ต่าง | Reject ก่อน reset ไม่ถือว่า pin version พอ | Planned |
| CP-05 / 03 | Unit + local integration | freeze/backup/baseline ครบ; old credential positive control ผ่าน; management reset/revoke สำเร็จและ readback ตรง | คำสั่งตามลำดับ; ไม่ retain password/ส่ง new credential ให้ old workload; ยัง gate=false | Planned |
| CP-06 / 03 | Unit, mocked API | reset/revoke permission denied, timeout, pending operation หรือ memberships readback mismatch | ไม่ทำขั้นถัดไป ไม่ terminate/activate จาก guessed success; outcome pending/failed ตามจริง | Planned |
| CP-07 / 04 | Local PG integration | old transaction ค้างมี uncommitted synthetic write; rotate password แล้ว terminate old sessions จาก independent operator | write ไม่ commit, connection ถูกตัด, sessions ของ old role ทุก DB เป็นศูนย์; replacement ใช้ได้ | Planned |
| CP-08 / 04 | Local PG integration | old session ยังมีใน DB ที่สอง แม้ DB แอปเป็นศูนย์ | ไม่รับ proof; ต้องพบ/ยุติครบทุก DB ก่อนผ่าน | Planned |
| CP-09 / 04 | Local auth + unit | positive control ผ่านก่อน reset; reconnect หลัง reset ได้ 28P01 เทียบกับ network timeout/connection-refused/credential ผิดตั้งแต่ก่อน reset | 28P01 ที่ผูกกับ valid before-control เป็น credential rejection; network/setup error ไม่ใช่ PASS; ไม่เปลี่ยนเป็น 28000 | Planned |
| CP-10 / 05 | Local PG integration | snapshot owner OID/table/ledger/IDs/states ก่อน fence; หลัง fence เปิด pool ใหม่ตรวจอีกครั้ง | ข้อมูล/ownership/ledger คงเดิม ไม่มี DROP/reset/seed; fingerprint compare ใน freeze | Planned |
| CP-11 / 05 | Unit + local catalog | memberships ถอนแล้ว แต่ LOGIN/CREATEROLE/CREATEDB ยัง true หรือพบ privileged path ใหม่ | flags รายงาน true; retiredLoginDisabled ไม่เป็น true; uncontrolled path ให้ reject; ไม่รายงาน privileged retirement สำเร็จ | Planned |
| CP-12 / 06 | API+DB + selected UI | replacement credentials, state-aware gate=false; normal registration/reload/own-list/owner roster/count/quota; visitor/wrong role/foreign IDs | persistence/counts ตรง; auth/ownership errors เดิม; ไม่มีข้อมูลคนอื่น; cancel/reactivate ยังปิด | Planned |
| CP-13 / 07 | Unit, mocked release | failure หลัง reset หรือ replacement unavailable; ขอ rollback | คง false/freeze; ไม่คืน old password/privileges/access และไม่ลง migrationย้อน/seed; incompatible target reject | Planned |
| CP-14 / 08 | Unit, proof/activation guard | ครบ credential proof แต่ไม่มี independent proof review หรือ CP-aware gate accepted; ขอ activation | Block; document merge/URL/boolean ไม่ใช่เหตุให้ bypass strict guard | Planned |
| CP-15 / 08 | Unit, proof schema | alternate method แนบ SQLSTATE28P01/LOGIN=true แต่แอบระบุ strict retiredLoginDisabled=true หรือเปลี่ยนmethodให้เข้มกว่าโดยไม่มี proof | Reject contradictory proof; incomplete fields/type/method reject; no activation | Planned |
| CP-16 / 09 | Offline regression + diff review | รัน existing lifecycle release tests ด้วย fake gcloud; ตรวจ diff ไม่มี workflow/app/SQL/IAM changes | existing strict guard regression ผ่านตามผลจริง; CP cases ยังคง planned ไม่ถือ cloud PASS | Planned |

## Proof record ที่ต้องพัฒนา ไม่ใช่ผลตรวจจริง

`method=CLOUDSQL_CREDENTIAL_RETIREMENT_V1`; operator/date/window; accepted contract/implementation commits; affected role IDs/OIDs; old/new secret resource+version (ไม่มี payload); writer/auth/privileged-path inventory; replacement-secret isolation; management operation IDs/status/readback; positive-control/negative-reconnect SQLSTATE; old session counts ทุก DB; flags/memberships before/after; baseline/data/compatibility/API results; independent proof review

ใช้ `legacyCredentialRejected`, `retiredSessionCount`, `replacementConnectionReady`, `replacementSecretIsolationVerified` พร้อมข้อจำกัดตามจริง ไม่ออก strict `retiredLoginDisabled=true` หาก LOGIN ยัง true ฟิลด์เหล่านี้เป็น design ที่ต้อง review ไม่ใช่ environment variables ที่เพิ่มใน workflow รอบนี้

**Stop:** missing/unknown/failure/contradiction → ไม่เสนอ activation; ไม่มี approved CP-aware gate → ไม่ส่ง old strict confirmation เป็น true; residual privileged path ควบคุมไม่ได้ → หยุดแม้ old password ใช้ไม่ได้

## Regression / evidence ที่ต้องเก็บ

Existing S2-A-DEPLOY-01–03 และ DB-01a–c ไม่ถูกลบ/ลด assertions CP-07–10 ต้องมี synthetic execution จริงใน implementation ภายหลัง ส่วน Cloud SQL acceptance เป็น manual actual proof อีกชุดหลัง explicit approval

เก็บ command, tested commit, pass/fail/skip, sanitized output และ RED/GREEN ของ CP implementation แยกกัน ไม่เขียนว่า 16 cases PASS จากเพียง parse JSON สำเร็จ
