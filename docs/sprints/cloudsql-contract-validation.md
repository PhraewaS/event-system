# CP-v1 contract branch — validation / pending work

> Historical validation ของ contract PR #93 ซึ่ง acceptedแล้วเป็น1407833; ข้อความnot run/plannedด้านล่างบันทึกก่อนimplementation ดู [ผล implementation ปัจจุบัน](cloudsql-credential-retirement-implementation.md) สำหรับlocal/mocked execution โดย actual Cloud acceptance ยัง pending

27 พฤศจิกายน 2026 · `guluJa` · Issue #8 · branch `codex/sprint2-cloudsql-fence-contract`

Base `sprint2-staging` ee6e679801d8a53bc93522f44d366dba4e95d7cc มี source tree ตรง main50529ea ณ ตอน fetch; ไม่ทำงานโดยตรงบน staging/main

## ผลปัจจุบันหลังแก้ review #93 — 27/11/2026

[PhraewaS ขอแก้บน c7931d6](https://github.com/PhraewaS/event-system/pull/93#pullrequestreview-6087897099) เวลา19:09:12น. UTC+7 รับทั้งสองข้อ เนื่องจาก Deliverable 2 §3.2 ต้องมี permissions/negative cases/expected outcomes ชัดก่อน implementation และ §§3.4–3.5 ต้องผูก verification กับรุ่น/ระบบจริง:

| Review request | การแก้ / สถานะ |
| --- | --- |
| สิทธิ์ migrator กับตารางที่ gather เป็นเจ้าของและ success/failure tests | contract §3.1 ระบุ controlled owner role/SET LOCAL ROLE, required schema ACL, runtime restrictions และ residual privilege; CP-AC-10 → CP-17/18 ทดสอบ actual003 บน synthetic001/002 กับ42501/rollback; **ยัง planned ไม่ได้ provision หรือรัน DB** |
| Positive activation และ instance/secret-version mismatch | contract §3.2 / CP-AC-08 → CP-19/20/21 ผูก proof/hash/review/readback/request กับ exact target; positive gate decision แบบ offline ไม่ deploy; **ยัง planned ไม่มี CP-aware implementation** |

ผลตรวจ revision เอกสาร: existing fake-gcloud release regression **6 passed/0 failed/0 skipped**; JSON21cases→10AC, relative links20จุด resolve; activation fixture/mismatch vectors structurally consistent; existing5guard/workflow filesไม่เปลี่ยน; `git diff --check` ผ่าน ไม่มี application/SQL/Cloud/IAM mutation, deploy หรือ activation

[Transcript การตรวจรอบ review](../../evidence/sprint-2/cloudsql-contract/review93-offline-validation.txt) ไม่ใช้6testsเดิมหรือdesign consistencyเป็นผล21CPtestsผ่าน ต้องรอ peer review ของ revisionใหม่/CIและ accepted contract ก่อน implementation

## ผลแรกบน c7931d6 — เก็บตามประวัติ

| ตรวจ | ผลจริง | ขอบเขต |
| --- | --- | --- |
| `python -X utf8 deploy/tests/test_lifecycle_release.py` | 6 passed / 0 failed / 0 skipped | existing offline fake-gcloud guards เท่านั้น รวม activation test ที่เป็น stub ไม่ใช่การเปิดระบบจริง |
| CP test vectors/AC mapping | 16 IDs ไม่ซ้ำ เชื่อม9AC; JSON parse ได้ | design consistency ไม่ใช่ runtime CP tests |
| Local links ใน contract/runbook/STS/plan | resolve18ลิงก์ | ตรวจไฟล์ใน repository ไม่ใช่ external page availability |
| Release validator/fence script/release script/deploy+CI workflows | bytes เทียบ baseline ไม่เปลี่ยน (normalize CRLF) | ไม่เพิ่ม bypass/activation path |
| `git diff --check` | ผ่าน | whitespace check ของ tracked diff; ไฟล์ใหม่ตรวจตามการ stage ก่อน commit |
| CP-01–CP-16 runtime / RED/GREEN | **not run / not implemented** | รอ contract review ก่อน implementation; ไม่ปลอมเป็น16PASS |
| Cloud SQL/IAM/secret/workflow dispatch/deploy/activation | **ไม่ดำเนินการ** | ต้องมีอนุมัติ mutation แยก |

[บันทึกผล offline จริง](../../evidence/sprint-2/cloudsql-contract/offline-release-regression.txt)

## ขอบเขตการ review และขั้นถัดไป

1. `PhraewaS` ตรวจ [contract](../features/F-05A-cloudsql-credential-retirement.md), [STS](../tests/cloudsql-credential-retirement-sts.md), semantics credential-vs-role retirement, isolation/session/rollback และข้อจำกัดที่ยังเหลือ บันทึก findings/commit/date จริง
2. CI ของ PR ต้องผ่าน revision ล่าสุดก่อน merge เข้า sprint2-staging; ผล local นี้ไม่แทน hosted CI หรือ independent approval
3. หลัง accepted contract จึงทำ implementation/test-first branch ต่อ; ไม่ส่ง contract PR เข้า main เพื่อทดลอง deploy
4. ยังไม่ถือ #8/#85 Done และไม่เปิด lifecycle จากเอกสาร/JSON vectors/ผล6offline tests

ไม่มีการเพิ่ม Issue ใหม่สำหรับเอกสารชุดนี้ ใช้ #8 ติดตาม deployment-contract amendment และแยก actual cutover acceptance ใน Issue เดิม
