# Gather: Lab 6 Special Exercise - คู่มือผู้ทดสอบ

เอกสารนี้เป็นรอบ Special Exercise ตามประกาศอาจารย์สำหรับทีมที่ไม่พบข้อบกพร่องใน UAT ปกติ ใช้ขอบเขต Sprint 1 เดิม แต่เป็นรุ่นแยก ไม่ใช่เว็บหลักบน Cloud Run และไม่แทนที่ผล UAT รอบปกติ

## ก่อนเริ่ม

- ผู้ทดสอบคือทีมภายนอกที่ได้รับมอบหมายให้ตรวจ Omega-3 ตามการจัดกลุ่มแบบวงกลมที่ได้รับอนุญาตแล้ว ให้ระบุชื่อทีมและผู้ทดสอบจริงเมื่อส่งผล
- ใช้ Docker Desktop ที่เปิดทำงานอยู่ พร้อม Docker Compose v2 ที่รองรับ `up --wait` และ PowerShell บน Windows ไม่ต้องติดตั้ง Node.js หรือ PostgreSQL บนเครื่องผู้ทดสอบ
- งดเปิด source, git log, commit message, diff และผลทดสอบภายในของรุ่นนี้จนกว่าจะส่งผล Blind Test เพื่อไม่ให้ทราบจุดบกพร่องล่วงหน้า
- อ่านคู่มือ UAT Sprint 1 ฉบับเดิม และตรวจ coverage กับข้อกำหนด/AC เพิ่มเติม ไม่จำกัดเพียงเคสตัวอย่างในคู่มือ
- ไม่รวม Sprint 2/3 เช่น ยกเลิกลงทะเบียน เปลี่ยนความจุ เช็กอิน และรายงานการเข้าร่วม

## ติดตั้งและระบุรุ่น

ผู้พัฒนาต้องส่ง Commit SHA แบบเต็มพร้อมข้อความส่งมอบ ให้ใช้ SHA นั้นแทน `<SHA-ที่ได้รับ>` ทุกครั้ง

```powershell
git clone --branch codex/lab6-special-staging --single-branch https://github.com/PhraewaS/event-system.git Gather-Lab6-Special
cd Gather-Lab6-Special
git checkout --detach <SHA-ที่ได้รับ>
git rev-parse HEAD
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\lab6-local.ps1
```

เก็บผล `git rev-parse HEAD` ก่อนเริ่ม หากใช้ source ZIP ที่ผู้พัฒนาส่งให้ ให้แตกในโฟลเดอร์ใหม่ ใช้ SHA จาก manifest และระบุในผลว่าเป็น ZIP snapshot ไม่ใช่ผล `git rev-parse` จากเครื่องผู้ทดสอบ

เปิด **http://localhost:3106/events** หลังคำสั่งสำเร็จ พอร์ตนี้เป็นของแบบฝึกหัด ไม่ใช่พอร์ต 3000 ของ Gather Compose ปกติ และไม่ใช่ลิงก์เว็บหลักบน Cloud Run

สคริปต์สร้างฐานข้อมูลและ volume เฉพาะ Compose project `gather-lab6-special` รัน migration และ seed ก่อนเปิดแอป ไม่เชื่อม Cloud SQL และไม่ลบข้อมูลเดิม ไม่ต้องรัน `docker compose down -v`

หากพอร์ต 3106 ถูกใช้อยู่ หรือมี project ชื่อนี้จากรอบเก่าแล้ว ให้หยุดและแจ้งผู้พัฒนาก่อน ห้ามลบ volume หรือเปลี่ยนรหัสใน `.env.lab6` เอง เพราะ seed จะไม่เปลี่ยนรหัสของบัญชีที่มีอยู่แล้ว

## บัญชีและข้อมูลทดสอบ

สคริปต์สร้างรหัสสำหรับบัญชี local ทั้ง 4 บัญชีแยกกันใหม่ โดยไม่ใช้รหัส Google, GCP หรือบัญชีบนเว็บหลัก เปิดไฟล์ `.local/lab6-accounts.private.txt` บนเครื่องตัวเองเพื่อดูรหัส:

| บัญชี | บทบาท |
| --- | --- |
| organizer@example.test | Organizer 1 |
| organizer2@example.test | Organizer 2 |
| participant@example.test | Participant 1 |
| participant2@example.test | Participant 2 |

ผู้เยี่ยมชมคือ browser profile ที่ยังไม่ล็อกอิน ใช้คนละ browser profile สำหรับแต่ละบัญชี ไม่ใช้แท็บ Incognito ของ browser เดียวกันแทน session แยก

ห้ามแนบ `.env.lab6`, ไฟล์รหัส, cookie, CSRF token หรือ Authorization header ลง Issue/รายงาน/แชทสาธารณะ หากแชร์หลักฐานให้ปิดค่าดังกล่าวก่อน แต่คง URL เส้นทางและผลที่ต้องใช้ตรวจสอบไว้

สร้างกิจกรรมใหม่ด้วยชื่อขึ้นต้น `UAT-L6-SE-<ทีม>-<เวลา>` ใช้ข้อมูลสมมติและวันเวลาในอนาคต อย่าใช้ตัวอย่าง seed เป็นหลักฐานเคสที่ต้องตั้งความจุ/เวลาเฉพาะ

## สิ่งที่ควรทดสอบ

ทำเคส Sprint 1 ตามคู่มือเดิม: login, การเผยแพร่และค้นหากิจกรรม, ลงทะเบียน, ป้องกันลงทะเบียนซ้ำ/เกินความจุ/หลังปิดรับ, รายชื่อของผู้จัดและสิทธิ์เจ้าของ, รายการลงทะเบียนของตน และการคงข้อมูลหลัง refresh/login ใหม่

เพิ่มการตรวจ boundary conditions, invalid inputs, access restrictions และ unusual actions ตามประกาศอาจารย์ ทั้งหน้าเว็บและ API เท่าที่ทำได้ บันทึกสิ่งที่ลองจริง รวมถึงกรณีที่ไม่พบปัญหา หาก API ถูกปฏิเสธเพราะยังไม่ล็อกอินหรือ CSRF ไม่ครบ ยังสรุปไม่ได้ว่าผ่านการตรวจข้อมูลของ business rule นั้น

## ส่งผลและรายงานข้อบกพร่อง

บันทึกผู้ทดสอบ วันที่/เวลา เขตเวลา Commit SHA วิธีรัน URL/port, case ID/AC, input, ขั้นตอน, Expected, Actual, PASS/FAIL/BLOCKED และหลักฐานที่อ่านได้ หากถูกปฏิเสธให้ตรวจด้วยว่าข้อมูลที่เกี่ยวข้องไม่เปลี่ยน ไม่ต้องใช้แบบ Results.md บังคับ

เมื่อพบปัญหาที่ทำซ้ำได้ เปิด Issue ที่ https://github.com/PhraewaS/event-system/issues/new โดยใส่:

1. ชื่อปัญหาและระบุว่าเป็น Lab 6 Special Exercise
2. รุ่นที่ตรวจ ผู้รายงาน วันเวลา บทบาทและเงื่อนไขก่อนเริ่ม
3. ขั้นตอนทำซ้ำและข้อมูลสมมติที่ใช้
4. ผลที่ควรได้เทียบกับผลจริง และ AC/ข้อกำหนดที่เกี่ยวข้อง
5. ผลกระทบ/ความรุนแรงที่เสนอ และภาพหรือ network response ที่ปิดค่าลับแล้ว

ไม่ต้องคาดเดาจุดแก้โค้ดหรือสร้าง Issue ว่าพบปัญหาไว้ล่วงหน้า หากติดตั้งไม่ได้ให้รายงาน BLOCKED พร้อม error ที่ปิดค่าลับแล้ว

## หลังส่งผล

ผู้พัฒนาจะ triage รายงาน ทำ RED/GREEN, regression, teammate PR review, CI และ deploy รุ่นแก้ไข แล้วแจ้ง URL, Commit SHA และ Cloud Run revision ใหม่ ให้ผู้ทดสอบภายนอกทำซ้ำขั้นตอนที่เคย FAIL และเคสที่ได้รับผลกระทบ บันทึกผลจริงพร้อมหลักฐาน และสรุป Accepted / Accepted with documented minor limitations / Not Accepted

ผลทดสอบรอบนี้และผลยอมรับรุ่นแก้ไขต้องระบุรุ่นแยกกัน ห้ามถือว่ารอบนี้ผ่านก่อนทดสอบจริง

## หยุดระบบโดยเก็บข้อมูล

```powershell
docker compose --env-file .env.lab6 -p gather-lab6-special -f compose.lab6.yaml down
```

เปิดต่อด้วยคำสั่งสคริปต์เดิม ข้อมูลจะยังอยู่ อย่ารัน `down -v`, `volume prune` หรือ reset ของระบบอื่น
