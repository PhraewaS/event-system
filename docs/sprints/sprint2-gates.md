# DOC-S2-06 — Sprint 2 review/integration gate record

ตรวจ 25 พฤศจิกายน 2026 ประมาณ 04:31 น. UTC+7 · ผู้ดำเนินงาน `guluJa`; ผู้ดูแล/ผู้รีวิว `PhraewaS`

| Gate | ผลที่อ่านได้จริง | สถานะ |
| --- | --- | --- |
| PR #86 base/head | sprint2-staging ← codex/sprint2-contract; reviewed head a74a20f | ตรวจแล้ว |
| PR CI ของ head a74a20f | [run 45490133420](https://github.com/PhraewaS/event-system/actions/runs/45490133420): test-and-docker และ build-and-test SUCCESS | ผ่านเฉพาะ head นี้; revision ใหม่ต้องรันใหม่ |
| Independent contract review | PhraewaS CHANGES_REQUESTED 25/11 04:27:24; v2 รอตรวจซ้ำ | pending |
| sprint2-staging protection | REST branch response: protected=false, SHA e2b9842edef525b2e72f040c9f64fa99dbe0f2c2 | ยังไม่ผ่าน |
| Protection details | branches/sprint2-staging/protection ตอบ404 ด้วยสิทธิ์ที่ใช้ตรวจ; ยืนยันค่ารายข้อไม่ได้ | ให้ผู้ดูแลตรวจ/ตั้งและแนบหลักฐาน |

คำสั่งอ่านที่ใช้:

```powershell
gh api repos/PhraewaS/event-system/branches/sprint2-staging --jq '{name:.name,sha:.commit.sha,protected:.protected}'
gh api repos/PhraewaS/event-system/branches/sprint2-staging/protection
gh pr checks 86 --repo PhraewaS/event-system
```

ก่อนรับ feature implementation PR ให้ `PhraewaS` ตรวจ/ตั้ง ruleset หรือ branch protection ที่มีผลกับ sprint2-staging และแนบค่าที่ตรวจจริง: non-author approval อย่างน้อย1, required CI check ที่รันจริง, up-to-date branch, resolved conversations และไม่ใช้ force-push/deletion/bypass เพื่อข้าม gate ตาม workflow เดิม

ผลตรวจ `protected=false` และ404ไม่ใช่หลักฐานว่าเปิด gates แล้ว DOC-S2-06 ยัง unchecked จนผู้ดูแลแนบผลหลังตั้งค่า พร้อมวันเวลา/branch/rule scope และตรวจ revision ล่าสุดครบ ไม่แก้ผลเดิมให้กลายเป็น PASS ย้อนหลัง
