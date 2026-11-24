# Lab 7: เปลี่ยนกฎการลงทะเบียนรายวันของ Gather

> **สถานะ review implementation:** เปิด PR #83 แล้ว CI รอบแรกผ่านที่ f868800 จากนั้น PhraewaS ขอแก้รูปแบบวันและ late response ของบัญชีเก่า รับแก้ทั้งหมดพร้อม additional RED/GREEN ดู [review83-evidence.md](review83-evidence.md) สำหรับผลล่าสุด 81 unit/API/client และ 28 browser executions; รอ review และ required checks ของ head ล่าสุดก่อน merge ไม่อ้างว่า release/GCP เสร็จแล้ว

> **สถานะถัดจาก contract review — 24 พฤศจิกายน 2026:** PhraewaS อนุมัติ `d9978c6` และ PR #82 merge เข้า staging `639f67b` แล้ว จึงเริ่ม test-first branch `codex/lab7-daily-quota` เก็บ domain RED ก่อนแก้ และได้ local GREEN/regression แล้ว ดู [implementation-evidence.md](implementation-evidence.md) สำหรับลำดับ commit, ผลจริง และข้อจำกัด ข้อความ proposal ด้านล่างเป็นประวัติก่อน approval; implementation ยังรอ PR review/CI/release/GCP ไม่ใช่ Done

สถานะ ณ 24 พฤศจิกายน 2026: **เปิด [Issue #81](https://github.com/PhraewaS/event-system/issues/81) และ [PR #82](https://github.com/PhraewaS/event-system/pull/82) แล้ว; PhraewaS review รอบแรกเป็น Changes requested; แก้เอกสารแล้วรอตรวจ revision ล่าสุดก่อน approval/implementation**

| เอกสาร | ใช้ตรวจอะไร |
| --- | --- |
| [CR-L7-01](CR-L7-01.md) | เหตุผล กฎเดิม/ใหม่ ขอบเขต baseline และการตัดสินใจของทีม |
| [Daily quota contract](daily-quota-contract.md) | SRS/Feature SDS/System SDS ส่วนที่แก้, UI/API/data, AC, STS, ผลกระทบและ DoD |
| [Evidence plan](evidence-plan.md) | ลำดับหลักฐาน RED/GREEN, review/release, metrics 5 รายการ และรายงาน Parts A-D |

## ข้อกำหนดที่ใช้

ใช้ Lab_7_Sprint_1_Maintenance.pdf ร่วมกับประกาศแก้ไขที่สมาชิกส่งมาเป็นภาพ `S__10330116.jpg`: ไม่ต้องขอ Instructor/TA approval ของ change request ให้ทีมเลือกการเปลี่ยนแปลง Sprint 1 ที่มีสาระร่วมกัน ยังคง Issue, precise old/new rule, impact, versioned contract/STS และ **teammate review ก่อน implementation** ตามข้อกำหนดส่วนที่เหลือ

แหล่งประกาศและข้อความที่ใช้ตัดสินบันทึกไว้ใน [approval-waiver-source.md](approval-waiver-source.md) พร้อมภาพต้นฉบับ `S__10330116.jpg` ที่สมาชิกส่งมา ภาพแสดงเวลาแบบสัมพัทธ์ “1 ชม.” จึงไม่อ้างวันที่โพสต์ที่ยืนยันไม่ได้ ไม่จำเป็นต้องสร้างชื่อ/วันที่ Instructor/TA approval สำหรับงานนี้ ให้บันทึก teammate review ที่เกิดขึ้นจริงแยกจากประกาศยกเว้น

## รุ่นและหน้าที่ของเอกสาร

- Accepted Sprint 1 หลัง Lab 6 และ actual pre-change main: `da02edd0258aed2aaf6847f87577a717e8f533e9`
- Accepted deployed revision: `gather-00012-7lx`; [release #80](https://github.com/PhraewaS/event-system/pull/80); [CrustCraft final decision](https://github.com/PhraewaS/event-system/issues/76#issuecomment-7102627014)
- ผล Lab 6: Accepted with documented minor limitations; `1 places left` ยังเป็นข้อจำกัดที่ยอมรับ ไม่อ้างว่าแก้ใน Lab 7 นี้
- Branch เอกสารเริ่มจาก main ข้างต้น; ระหว่าง main กับ sprint1-staging ก่อนเปิด PR นี้มีประวัติ merge ต่างกัน แต่ source tree เท่ากัน
- Stable change ID: **CR-L7-01**; [Issue #81](https://github.com/PhraewaS/event-system/issues/81); documentation [PR #82](https://github.com/PhraewaS/event-system/pull/82) เข้า `sprint1-staging`
- Review รอบแรก: PhraewaS [Changes requested](https://github.com/PhraewaS/event-system/pull/82#pullrequestreview-6042687973) บน `758fc3586f3a5c7385252743eff7ec4ee58ceb1e`, 24 พฤศจิกายน 2026 เวลา 22:54:01 +07:00; การแก้ครั้งนี้รอ review อีกครั้ง ไม่ใช่ approval

เอกสารชุดนี้เป็น **contract proposal** ไม่ใช่โค้ดที่ทำงานแล้ว ไม่มี test/implementation/migration ใหม่ใน PR นี้ ผล 64 API/client/unit tests และ browser 16 tests ของ baseline เป็นผลเดิมของ Lab 6 ไม่ใช่ผลของกฎโควต้าใหม่

## จุดส่งต่อ

1. เปิด Issue #81 และ PR #82 แล้ว; คง Issue เปิดไว้ตลอดขั้น implementation/release/evidence
2. แก้ข้อเสนอแนะ review รอบแรกแล้ว ให้ PhraewaS ตรวจ revision ล่าสุดและยืนยัน contract ก่อน code
3. หลัง contract ได้รับการยืนยันและรวมแล้ว จึงแตก branch implementation จาก staging ที่มี contract นี้
4. เพิ่ม tests ให้ RED บน implementation เดิมก่อนแก้ เก็บ commit/output จากนั้นทำ GREEN และ regression
5. Teammate review + CI → staging integration → reviewed main release → GCP และตรวจพฤติกรรมใหม่/เดิมบนรุ่นจริง

หาก baseline หรือกฎที่ตกลงเปลี่ยนก่อนเริ่ม code ต้องบันทึกเหตุผลและ revised contract/test design พร้อม review ก่อนแก้ตาม revision นั้น ไม่เขียนเอกสารย้อนหลังให้ดูเหมือนวางแผนก่อน code
