# F-05A / CP-v1 — Cloud SQL credential retirement

27 พฤศจิกายน 2026 · Issue [#8](https://github.com/PhraewaS/event-system/issues/8) · Author/owner `guluJa` · Reviewer `PhraewaS` (รอ review จริง)

**Proposed contract/test design ก่อน implementation; ไม่ใช่ผล cloud fence และไม่อนุญาต activation**
ฐานออกแบบ: sprint2-staging `ee6e679801d8a53bc93522f44d366dba4e95d7cc`; main ที่ fetch ได้ `50529ea365b607c39db4e3f1fa802898c8e5331b`

## 1. เหตุผลและผลกระทบ

Parent contract v2/v2.1 กำหนด NOLOGIN/NOCREATEROLE, ถอน privileged memberships, terminate sessions และ reconnect rejection 28000 ก่อน activation หลักฐาน catalog เดิมพบ `gather` เป็นเจ้าของตารางและมี CREATEROLE/CREATEDB/LOGIN; ยังไม่ยืนยัน operator ที่มีอำนาจแก้ attributes/membership ตามแผน จึงยังรับรอง strict fence ไม่ได้ ไม่ใช่ข้อสรุปว่า Cloud SQL ใช้ ALTER ROLE ไม่ได้ทุกกรณี

CP-v1 เสนอ **credential retirement** ผ่าน Cloud SQL user management: reset password และแทนที่/ถอน memberships โดยไม่ต้องมีรหัสเก่า ไม่ใช้ cloudsqladmin และไม่สมมติว่า GCP IAM คือ PostgreSQL ADMIN OPTION วิธีนี้ไม่เท่ากับ **privileged-role retirement** และไม่เปลี่ยน attributes โดยอัตโนมัติ

เชื่อม FR-06 / F-05A; BR-01–06/10/11 และ NFR-01–05 ของ parent contract คงเดิม ด้าน persistence/access/regression/release readiness นี่เป็นการออกแบบ deployment ของทีม ไม่ใช่คำสั่ง rubric ว่าต้องใช้วิธีนี้

| ชั้น | การเปลี่ยน |
| --- | --- |
| UI / API / business rules | ไม่เปลี่ยน cancel/reactivate/quota/capacity/ownership/error precedence |
| Schema / migration / data | ไม่เปลี่ยน schema/IDs/object owner; ไม่ DROP ROLE/DROP OWNED/reset/seed |
| Deployment / security | เสนอ management-plane credential fence พร้อม proof semantics แยกจาก NOLOGIN |
| Activation/workflow | PR นี้ไม่แก้ workflow/release validator/ordinary-role script; guards เดิมยังคงอยู่ |
| Documents / STS | ระบุ AC, inputs, negative cases, expected results, pending status และ review sequence |

## 2. Boundaries และ access expectations

- เป้าหมายคือหยุด old application writers ที่ใช้ credential เดิม ไม่อ้างว่าป้องกันผู้ดูแล Google ที่ยังมีอำนาจ reset password โดยเจตนา หรือว่าลด attributes ครบแล้ว
- ทุก old role/writer/authentication/SET ROLE path ต้องอยู่ใน inventory; unknown/uncontrolled privileged path ให้หยุด การตรวจ IAM 10 คู่ไม่ทดแทน DB inventory
- gate=false ไม่หยุด normal registration/in-flight work ต้องมี maintenance/write freeze ที่บังคับได้ก่อน baseline/fence ไม่รับรอง zero downtime
- Reset password ไม่ปิด session เดิม และถอน cloudsqlsuperuser ไม่รับรองว่า CREATEROLE/CREATEDB/LOGIN เปลี่ยน ต้องเก็บ flags/memberships จริงหลังทำ
- New secret name/pinned version ไม่พอหาก old revisions ใช้ service account เดียวกับใหม่ ต้องพิสูจน์ old identities/impersonation เข้าไม่ถึง replacement secret; ถ้ายังเข้าถึงได้ให้หยุด
- ต้องตรวจ roles/privileged paths ที่อาจเปลี่ยนระหว่าง freeze ไม่สมมติว่า old privileged sessions ไม่มีผลกระทบ
- หาก reviewed security policy ยังต้องการ NOLOGIN/NOCREATEROLE CP-v1 ไม่ผ่านเงื่อนไขนั้น ต้องใช้ operator/provider-supported route ที่ทำได้ ห้าม downgrade guard เพื่อให้ deploy ผ่าน

## 3. Workflow / permissions / errors

1. Teammate review CP-v1/STS และบันทึก accepted commit/date ก่อน implementation ใหม่ การ merge เอกสารไม่ใช่อนุมัติ Cloud mutations
2. Implementation ถัดไปต้องเก็บ meaningful RED ของ CP-aware proof/ordering guard แล้ว GREEN/regression บน synthetic DB และ mocked management API ห้ามใช้ production เป็น fixture
3. ก่อน actual cutover ต้องมีอนุมัติ window/operator/targets/actions/stop points แยก ใช้ IAM user-management authority สำหรับ reset/memberships และ SQL operator authority สำหรับ sessions/data ตามงานจริง
4. Backup/frozen baseline → replacement runtime/migrator และ isolated pinned secrets → ทดสอบ state-aware gate=false → ย้าย service/jobs หลังอนุมัติ deploy → ระงับ old traffic/tags/executions
5. หลังอนุมัติ DB fence จึง reset old built-in password ผ่าน Cloud SQL เป็นค่าควบคุมที่ old workloads ไม่รู้ ไม่ retain old password ไม่ใส่ credential ใหม่ใน old shared secret/latest และไม่แสดงใน logs ถอน privileged memberships ตาม approved inventory รอ operation/readback
6. จาก SQL operator อิสระ terminate old sessions ทุก DB จนศูนย์ พิสูจน์ in-flight old write ไม่ commit และ old credential ที่ positive control ผ่านก่อน fence ถูกปฏิเสธหลัง fenceด้วย authentication SQLSTATE จริง; replacement ต้อง reconnect ได้
7. ตรวจ role flags/memberships/ownership/migration ledger/rows และ API/session/count/quota/persistence ตามเดิม เก็บ operator/time/source/revision/digest/secret versions โดยไม่มี payload ถ้า LOGIN/CREATEROLE/CREATEDB ยัง true ให้บันทึกตามจริง ไม่เรียก privileged-role retirement complete
8. Independent review actual proof และ CP-aware implementation/tests ต้อง accepted ก่อนเสนอ activation แยก ปัจจุบันยังไม่มีผลทั้งสองส่วน จึง blocked

Permission denied, operation failure, unknown readback, secret leak, role/path ที่ไม่ได้วางแผน หรือ data mismatch ต้องหยุดที่ writes=false รักษา freeze ตามแผน เก็บ error ที่ปิดค่าลับและไม่ลอง bypass ไม่มี runnable production mutation commands ใน PR นี้

Rollback ใช้เฉพาะ compatible state-aware target กับ replacement credentials ที่ตรวจแล้ว ไม่คืน old password/LOGIN/privileges/secret access ไม่ reset/seed/restore ฐานร่วมอัตโนมัติ

## 4. Acceptance criteria

| AC | Observable outcome | STS |
| --- | --- | --- |
| CP-AC-01 | ไม่มี contract review/อนุมัติ/window หรือ inventory ขาด writer/auth/privileged path ให้หยุดก่อน mutation; operator/old/new role ต้องแยกกัน | CP-01, CP-02 |
| CP-AC-02 | Replacement พร้อมและ old identities เข้าไม่ถึง new credential รวม shared-SA/impersonation paths; ถ้ายังเข้าถึงได้ต้อง reject | CP-03, CP-04 |
| CP-AC-03 | Frozen baseline/old-credential positive control ครบก่อน reset; management operation/readback memberships ตรงแผน; failure/unknown ไม่ทำขั้นถัดไป | CP-05, CP-06 |
| CP-AC-04 | In-flight old transaction ไม่ commit, old sessions ทุก DB เป็นศูนย์, old credential reconnect authentication rejected; network error ไม่ใช่ PASS | CP-07, CP-08, CP-09 |
| CP-AC-05 | Owner OID/tables/rows/registration IDs/states/migration ledger คงเดิม; flags/memberships แสดงจริง; ไม่เรียก password rejection ว่า NOLOGIN | CP-10, CP-11 |
| CP-AC-06 | Replacement reconnect/register/read/session/own/owner/count/quota/persistence ผ่าน; visitor/wrong-role/foreign ownership ถูกปฏิเสธ ไม่มี data leak | CP-12 |
| CP-AC-07 | Failure คง writes=false; rollback เฉพาะ compatible target/new credential ไม่คืน old credential/access และไม่ reset/seed | CP-13 |
| CP-AC-08 | Proof ไม่ครบ/ไม่ได้ review/ยังไม่มี CP-aware gate ห้าม activation; LOGIN=true ต้องไม่ออก retiredLoginDisabled=true และ 28P01 ไม่ใช่ 28000 | CP-14, CP-15 |
| CP-AC-09 | Contract PR ไม่เปลี่ยน app/workflow/SQL/IAM/flags; strict guards ยังอยู่ ผล design validation/offline regression ไม่ใช่ cloud fence PASS | CP-16 |

## 5. STS / Definition of Done

[STS CP-01–CP-16](../tests/cloudsql-credential-retirement-sts.md) และ [machine-readable test vectors](../tests/cloudsql-credential-retirement-cases.json) เป็น test design ไม่มีผล runtime execution ของ CP-v1; implementation/test runner ใหม่ต้องรอ contract review

- [ ] PhraewaS review contract/STS ระบุข้อสงสัย/ผลพิจารณา และ accepted commit/date จริง
- [ ] ก่อน code เก็บ test-design history; implementation ถัดไปมี RED/GREEN ไม่ใช้ setup failure แทน RED
- [ ] Local synthetic integration/mocked API/inherited regression ผ่าน ระบุ actual pass/fail/skip/SHA
- [ ] ก่อน actual mutation มีอนุมัติแยก แล้วเก็บ CP-AC-01–08/operator authority/secret isolation proof และ independent review; ส่วนไม่ได้ทำต้อง pending
- [ ] ก่อน activation มี CP-aware gate accepted และ tested; จากนั้นจึงขออนุมัติ activation และตรวจ cancel/reactivate บนรุ่นจริง

## 6. สถานะและ traceability

Deliverable 2 §3.2 ต้องเก็บ contract/test design ก่อน implementation; §§3.4–3.5 ต้องระบุ planned/actual และคง regression/deployment evidence รอบนี้เป็น deployment-contract amendment **ไม่ทำให้ Sprint 2 complete** และไม่แทน cloud acceptance หรือ Sprint 3 progress

| รายการ | สถานะ |
| --- | --- |
| Parent v2/v2.1 / strict NOLOGIN path | คงประวัติเดิม ไม่ rewrite review |
| CP-v1 contract/STS | proposed; awaiting review |
| CP-aware runtime code / local integration | planned; not implemented/not run |
| Existing offline release guards | ตรวจและบันทึกผลแยกใน validation record ของ branch |
| Cloud reset/revoke/terminate/data proof | not executed ใน PR นี้ |
| Activation/deployed acceptance | blocked; lifecycle ต้องยัง false |

ผลตรวจ branch รอบนี้: [validation record และ pending work](../sprints/cloudsql-contract-validation.md) แยก existing regression ที่รันแล้วจาก CP-v1 tests ที่ยัง planned

## อ้างอิง

- [Cloud SQL user management](https://docs.cloud.google.com/sql/docs/postgres/create-manage-users): reset/replace memberships
- [users.update](https://docs.cloud.google.com/sql/docs/postgres/admin-api/rest/v1/users/update): ไม่ใช่ NOLOGIN/ADMIN OPTION API
- [PostgreSQL 17 ALTER ROLE](https://www.postgresql.org/docs/17/sql-alterrole.html): SQL authority/attributes
- [Backend termination](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-ADMIN-SIGNAL): session permissions
