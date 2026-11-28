# CP-v1 STS — credential fence ก่อน lifecycle activation

> Review #94เพิ่มregression: sameDB/rolesบนคนละinstanceและrawTCPunboundต้องหยุดก่อนreset; SQLoperatorไม่มีsession-signalauthorityต้องไม่เปลี่ยนpassword/membership; validCPproofยังต้องถูกrelease.shปฏิเสธก่อนgcloud รวมกรณีไม่ระบุmethodแต่ส่งCPevidence CP-19positiveเป็นofflinecomparisonเท่านั้น ไม่มีliveconfigreaderจึงยังใช้activateไม่ได้ [ผลปัจจุบัน](../sprints/cloudsql-credential-retirement-implementation.md)

> Accepted test-design snapshot จาก PR #93 (94e99a3 → merge1407833) แถว Planned/not run เป็นสถานะก่อน implementation; [ผล execution ปัจจุบัน](../sprints/cloudsql-credential-retirement-implementation.md) แยก local/mocked execution ออกจาก actual Cloud acceptance ไม่ใช้21vectorsเป็นจำนวนtestsผ่านโดยอัตโนมัติ

27/11/2026 · [Contract/AC](../features/F-05A-cloudsql-credential-retirement.md) · Issue #8 · Owner `guluJa` / independent reviewer `PhraewaS`

**Test design ก่อน implementation: CP-01–CP-21 ยัง not run ทั้งหมด** JSON vectors เป็นข้อมูลเตรียม tests ไม่ใช่ automated execution results การตรวจ parse/traceability ของไฟล์นี้ไม่ใช่ GREEN ของ credential fence เพิ่ม CP-17–21 ตาม review #93 บน c7931d6 โดยยังไม่เขียน CP runtime implementation

## Fixtures / วิธีรันใน implementation ถัดไป

- Offline unit: mocked management operations มี pending/success/permission-denied/readback-mismatch และ call recorder ตรวจ ordering ห้ามเรียก gcloud/Google SDK/production URLs
- Integration: disposable local PostgreSQL17, synthetic distinct old/new/operator roles และอย่างน้อยสอง DB ที่ run เป็นผู้สร้างเท่านั้น ไม่มี Cloud SQL/production credentials ไม่รันใน PR contract นี้
- Old pool เปิด transaction ค้างก่อน fence และใช้ barrier/lock observation ยืนยันว่าคำสั่งถูกส่งจริง ห้ามใช้ sleep อย่างเดียวแทน concurrency proof
- ใช้ actual SQLSTATE: local password retirement ต้องทดสอบ auth ที่ตรง Cloud SQL built-in password และใช้รหัสเดิมที่ positive control ผ่านแล้ว ไม่เก็บ passwords ใน logs
- ค่า fixtures และ expected outcomes อยู่ใน [cases.json](cloudsql-credential-retirement-cases.json); `allow_proof_review` หมายถึงพร้อมให้คนตรวจ credential-fence proof **ไม่ใช่ allow activation**
- Future CP-aware runner/validator ยังไม่มี ใน implementation PR ต้องเพิ่ม meaningful RED ก่อน code และ GREEN ของเคสเดิม ไม่ใส่ expectedFailure/skip แล้วนับว่า fence ผ่าน
- Migration fixtures ใช้ synthetic001/002 ที่ gather เป็นเจ้าของพร้อม ledger/checksums จริง และ `server/migrations/003_registration_lifecycle.sql` ที่ไม่แก้ไฟล์เดิม; เตรียม owner-role profile ตาม contract §3.1 หลังถอน cloudsqlsuperuser/ให้ schema ACL ที่จำเป็นอย่างชัดเจน ไม่ใช้แค่ ledger001–003 no-op แทน DDL test
- Activation unit fixtures ใช้ proof/readback/request ชุดสังเคราะห์เดียวกันและ immutable proof hash/review binding ตาม contract §3.2 ตรวจ decision ของ future gateเท่านั้น ไม่เรียก deploy แม้ expected decision เป็น allow_activation
- ค่า hash ใน JSON เป็น synthetic placeholder; future fixture builder ต้อง canonicalize proof body ที่ไม่รวม hash/review fields แล้วคำนวณ SHA-256 จริงและสร้าง review binding ที่ตรงกันก่อนเรียก validator ห้ามใช้ placeholder เป็น accepted proof

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
| CP-17 / 10 | Local PG integration + mocked job | distinct migrator session; owner gather มี required schema ACL; membership SET=true/ADMIN=false ทดสอบ INHERIT=true/false แยกและรายงาน actual scope; บน client เดียว BEGIN → SET LOCAL ROLE gather → actual runner/003 บน snapshot001/002 → rerun | session_user=new migrator/current_user=gather ระหว่าง DDL; migration003/ledger checksum/backfill/constraints ผ่าน; owner OID/registrationIDs คงเดิม; rerun no-op; หลัง transaction role กลับ (INHERIT=true ยังมี approved inherited privileges); runtime SET/DDL ถูกปฏิเสธ | Planned |
| CP-18 / 10 | Local PG integration + mocked job | variant A migrator CONNECT/USAGE/DML ครบแต่ไม่มี owner membership/SET option; variant B ไม่มี schema CREATE ที่ profileต้องใช้; ลอง actual transaction/DDL โดยไม่ fallback owner credential | SQLSTATE42501 ในขั้นที่สิทธิ์ขาด; rollback schema/data/ledger ไม่เพิ่ม003; job failed ไม่เลื่อนไป deploy/activate ไม่ grantเพิ่มอัตโนมัติ | Planned |
| CP-19 / 08 | Offline unit, future CP-aware gate | CP-AC-01–07/10 ผ่าน; accepted implementation/tests; independent review ของ immutable proof hashตรง; explicit approval; project/instance/database/roles+OIDs/service/job/identities/candidate revision/image/secret numeric versions ตรง proof/readback/request ทั้งหมด | decision allow_activation เฉพาะ request นี้; call recorder ไม่มี cloud action เพราะเป็น unit; ไม่สรุปว่าระบบจริง activateแล้ว | Planned |
| CP-20 / 08 | Offline unit, future CP-aware gate | เริ่มจาก positive fixture CP-19; เปลี่ยน readback หรือ request instance connection name ทีละตัวอย่าง โดย proof/hash/review ยังเหมือนเดิม | reject_target_binding_mismatch ก่อน service mutation; project/database/roles/identity/revision/image ที่ต่างก็ reject ตามกฎเดียวกัน | Planned |
| CP-21 / 08 | Offline unit, future CP-aware gate | เริ่ม CP-19; เปลี่ยน secret resource หรือ numeric version ของ service/runtime หรือ job/migratorทีละตัวอย่าง หรือใช้ latest/missing version | reject_secret_binding_mismatch ก่อน service mutation แม้ชื่อrole/instanceตรง; review/hashต้องผูก proof ชุดใหม่หาก configเปลี่ยน | Planned |

## Proof record ที่ต้องพัฒนา ไม่ใช่ผลตรวจจริง

`method=CLOUDSQL_CREDENTIAL_RETIREMENT_V1`; operator/date/window; accepted contract/implementation commits; affected role IDs/OIDs; old/new secret resource+numeric version (ไม่มี payload); writer/auth/privileged-path inventory; replacement-secret isolation; management operation IDs/status/readback; positive-control/negative-reconnect SQLSTATE; old session counts ทุก DB; flags/memberships before/after; baseline/data/compatibility/API/migration-profile results; immutable proof hash และ independent review ของ content/hash เดียวกัน

Target binding ต้องมี project/instance connection name/database, role OIDs, service/job+service accounts, pre-activation gate=false candidate revision, approved SHA/digest และ per-workload secret versions ตรง fresh readback/intended request Future activation revision เป็น revisionใหม่ที่สร้างจาก request ที่ผูกแล้ว ต้องตรวจหลัง deploy ไม่ใช้ชื่อ revisionเก่าแทนผล deployใหม่

ใช้ `legacyCredentialRejected`, `retiredSessionCount`, `replacementConnectionReady`, `replacementSecretIsolationVerified` พร้อมข้อจำกัดตามจริง ไม่ออก strict `retiredLoginDisabled=true` หาก LOGIN ยัง true ฟิลด์เหล่านี้เป็น design ที่ต้อง review ไม่ใช่ environment variables ที่เพิ่มใน workflow รอบนี้

**Stop:** missing/unknown/failure/contradiction → ไม่เสนอ activation; ไม่มี approved CP-aware gate → ไม่ส่ง old strict confirmation เป็น true; residual privileged path ควบคุมไม่ได้ → หยุดแม้ old password ใช้ไม่ได้

## Regression / evidence ที่ต้องเก็บ

Existing S2-A-DEPLOY-01–03 และ DB-01a–c ไม่ถูกลบ/ลด assertions CP-07–10 ต้องมี synthetic execution จริงใน implementation ภายหลัง ส่วน Cloud SQL acceptance เป็น manual actual proof อีกชุดหลัง explicit approval

เก็บ command, tested commit, pass/fail/skip, sanitized output และ RED/GREEN ของ CP implementation แยกกัน ไม่เขียนว่า 16 cases PASS จากเพียง parse JSON สำเร็จ
