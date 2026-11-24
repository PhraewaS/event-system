# Lab 7: เปลี่ยนกฎการลงทะเบียนรายวันของ Gather

สถานะ ณ 24 พฤศจิกายน 2026: **เตรียมเอกสารก่อน implementation; รอ teammate review**

| เอกสาร | ใช้ตรวจอะไร |
| --- | --- |
| [CR-L7-01](CR-L7-01.md) | เหตุผล กฎเดิม/ใหม่ ขอบเขต baseline และการตัดสินใจของทีม |
| [Daily quota contract](daily-quota-contract.md) | SRS/Feature SDS/System SDS ส่วนที่แก้, UI/API/data, AC, STS, ผลกระทบและ DoD |
| [Evidence plan](evidence-plan.md) | ลำดับหลักฐาน RED/GREEN, review/release, metrics 5 รายการ และรายงาน Parts A-D |

## ข้อกำหนดที่ใช้

ใช้ Lab_7_Sprint_1_Maintenance.pdf ร่วมกับประกาศแก้ไขที่สมาชิกส่งมาเป็นภาพ `S__10330116.jpg`: ไม่ต้องขอ Instructor/TA approval ของ change request ให้ทีมเลือกการเปลี่ยนแปลง Sprint 1 ที่มีสาระร่วมกัน ยังคง Issue, precise old/new rule, impact, versioned contract/STS และ **teammate review ก่อน implementation** ตามข้อกำหนดส่วนที่เหลือ

แหล่งอ้างอิงประกาศคือภาพที่ผู้ใช้ส่ง ไม่ได้อ้างว่าได้สร้างการอนุมัติใหม่จากผู้สอน ไม่จำเป็นต้องใส่ชื่อ/วันที่ Instructor/TA approval สำหรับงานนี้ ให้บันทึก teammate review ที่เกิดขึ้นจริงแทนโดยแยกชนิดหลักฐานให้ชัด

## รุ่นและหน้าที่ของเอกสาร

- Accepted Sprint 1 หลัง Lab 6 และ actual pre-change main: `da02edd0258aed2aaf6847f87577a717e8f533e9`
- Accepted deployed revision: `gather-00012-7lx`; [release #80](https://github.com/PhraewaS/event-system/pull/80); [CrustCraft final decision](https://github.com/PhraewaS/event-system/issues/76#issuecomment-7102627014)
- ผล Lab 6: Accepted with documented minor limitations; `1 places left` ยังเป็นข้อจำกัดที่ยอมรับ ไม่อ้างว่าแก้ใน Lab 7 นี้
- Branch เอกสารเริ่มจาก main ข้างต้น; ระหว่าง main กับ sprint1-staging ก่อนเปิด PR นี้มีประวัติ merge ต่างกัน แต่ source tree เท่ากัน
- Stable change ID: **CR-L7-01** ใช้เชื่อมก่อน guluJa เปิด GitHub Issue เอง เมื่อมีเลขจริงให้แนบลิงก์ Issue ใน PR ไม่สร้างเลข Issue หรือ review ขึ้นล่วงหน้า

เอกสารชุดนี้เป็น **contract proposal** ไม่ใช่โค้ดที่ทำงานแล้ว ไม่มี test/implementation/migration ใหม่ใน PR นี้ ผล 64 API/client/unit tests และ browser 16 tests ของ baseline เป็นผลเดิมของ Lab 6 ไม่ใช่ผลของกฎโควต้าใหม่

## จุดส่งต่อ

1. guluJa เปิด Issue ตาม CR-L7-01 และเปิด PR เอกสารเข้า `sprint1-staging`
2. PhraewaS ตรวจ old/new rules, impact, AC/STS, legacy data และ concurrency แล้วลง review จริง
3. หลัง contract ได้รับการยืนยันและรวมแล้ว จึงแตก branch implementation จาก staging ที่มี contract นี้
4. เพิ่ม tests ให้ RED บน implementation เดิมก่อนแก้ เก็บ commit/output จากนั้นทำ GREEN และ regression
5. Teammate review + CI → staging integration → reviewed main release → GCP และตรวจพฤติกรรมใหม่/เดิมบนรุ่นจริง

หาก baseline หรือกฎที่ตกลงเปลี่ยนก่อนเริ่ม code ต้องบันทึกเหตุผลและ revised contract/test design พร้อม review ก่อนแก้ตาม revision นั้น ไม่เขียนเอกสารย้อนหลังให้ดูเหมือนวางแผนก่อน code
