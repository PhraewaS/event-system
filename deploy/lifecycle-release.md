# F-05A lifecycle cutover / rollback

ขอบเขต: additive schema 003 และ ACTIVE-only readers/writers หลัง contract [PR #86](https://github.com/PhraewaS/event-system/pull/86). นี่เป็น runbook ก่อน cloud acceptance ไม่ใช่หลักฐานว่า deploy Sprint 2 แล้ว

## Normal release (ยังปิด lifecycle writes)

1. ผ่าน independent review, staging acceptance และ reviewed release เข้า main ตาม workflow เดิม
2. main pipeline รัน CI/build/push, verify immutable digest, migrate ก่อนเปลี่ยน service และตั้ง `REGISTRATION_LIFECYCLE_WRITES_ENABLED=false` normal registration/reads ยังทำงาน; cancel/reactivate ถูกปิดตาม contract
3. เก็บ main SHA, CI run, digest, migration execution และ state-aware revision ตรวจ public/own/owner/quota/persistence บนข้อมูลสังเคราะห์ การเพิ่ม migration ไม่ลบข้อมูลหรือ seed บนระบบร่วม
4. ตรวจ traffic ไป state-aware revision 100%, ไม่มี tag route ไป pre-state-aware revision และรอพ้น old revision request timeout นับจากตัด traffic ตรวจผู้ดูแลทำจริงและบันทึก URL หลักฐาน ห้ามถือว่า traffic 100% เท่ากับ in-flight requests จบแล้ว

## Explicit activation of the verified image

ผู้ดูแลตั้ง environment `demo` variable `LIFECYCLE_APPROVED_IMAGES_JSON` เป็นรายการ image ที่ผ่าน compatibility tests และ post-deploy checks จริง เช่นรูปแบบต่อไปนี้ (ต้องแทนค่าตามผลจริง ไม่ใช้ตัวอย่างเป็นหลักฐาน):

```json
[{"sha":"FULL_40_HEX_SHA","digest":"sha256:FULL_64_HEX_DIGEST","compatibility":"ACTIVE_V1","evidence":"https://github.com/PhraewaS/event-system/actions/runs/ACTUAL_RUN_ID"}]
```

เปิด Deploy demo → Run workflow บน main เลือก image_tag/image_digest ของ **image เดิมที่ตรวจแล้ว**, `activate_lifecycle=true`, `lifecycle_cutover_confirmed=true` และ `lifecycle_cutover_evidence` เป็น URL ของหลักฐาน cutover ใน repository นี้

โหมดนี้ reuse immutable image ไม่ build/migrate/seed ซ้ำ ตรวจ approval SHA/digest/compatibility และ cutover confirmation ก่อนเปลี่ยน service/traffic แล้วเปิด writes ผ่าน revision ใหม่ เก็บ revision/config/traffic binding และตรวจ cancel → saved CANCELLED → reactivate กับ permission/count/quota บนรุ่นจริงอีกครั้ง

## Rollback

- Run workflow บน main โดยใช้ approved state-aware SHA/digest และคง `activate_lifecycle=false` (ค่าเริ่มต้น) จะปิด lifecycle writes แต่ยังอ่าน CANCELLED และนับ ACTIVE ถูกต้อง
- ห้ามเลือก e2b9842 หรือ pre-state-aware image หลัง lifecycle เปิดใช้ ไม่ down migration/reset/seed/แปลง CANCELLED เป็น ACTIVE เพื่อรองรับโค้ดเก่า
- ถ้าไม่มี compatible target ที่มีหลักฐาน ให้ fail closed และ roll forward ด้วย state-aware image ที่ผ่าน review/tests การปิด writes ไม่ยกเลิก request ที่ค้างทันที จึงต้องรอ drain ก่อนตรวจ snapshot
- Normal release ใหม่ทุกครั้งปิด writes ก่อน ต้องทำ activation ของ image ที่ตรวจแล้วอีกครั้งก่อนประกาศ feature acceptance

`deploy/verify_lifecycle_release.py` ปฏิเสธ manual targets ที่ไม่มี approval/evidence หรือ activation ที่ไม่ยืนยัน cutover ก่อน Cloud Run mutation; registry digest ต้องตรง approval ด้วย ค่าตัวแปรนี้ไม่ใช่ secret แต่ต้องควบคุมโดยผู้ดูแลและอ้างหลักฐานจริง ไม่มีรายการ image ที่อนุมัติให้โดยอัตโนมัติ

## Offline verification

```sh
python3 deploy/tests/test_lifecycle_release.py
bash deploy/tests/test_release_stub.sh
```

ใช้ fake gcloud เท่านั้น ไม่พิสูจน์ว่า traffic/drain หรือ cloud persistence เกิดจริง ต้องมีผลหลัง release แยกต่างหาก
