# F-05A lifecycle cutover / rollback

ขอบเขต: additive schema 003 และ ACTIVE-only readers/writers หลัง contract [PR #86](https://github.com/PhraewaS/event-system/pull/86). นี่เป็น runbook ก่อน cloud acceptance ไม่ใช่หลักฐานว่า deploy Sprint 2 แล้ว

## Normal release (ยังปิด lifecycle writes)

1. ผ่าน independent review, staging acceptance และ reviewed release เข้า main ตาม workflow เดิม
2. main pipeline รัน CI/build/push, verify immutable digest, migrate ก่อนเปลี่ยน service และตั้ง `REGISTRATION_LIFECYCLE_WRITES_ENABLED=false` normal registration/reads ยังทำงาน; cancel/reactivate ถูกปิดตาม contract
3. เก็บ main SHA, CI run, digest, migration execution และ state-aware revision ตรวจ public/own/owner/quota/persistence บนข้อมูลสังเคราะห์ การเพิ่ม migration ไม่ลบข้อมูลหรือ seed บนระบบร่วม
4. ตรวจ traffic ไป state-aware revision 100% และไม่มี tag route ไป pre-state-aware revision แต่ **ห้ามใช้ traffic 100% หรือการรอ request timeout เป็นหลักฐานว่า writer เก่าจบแล้ว** Cloud Run อาจประมวลผลต่อหลัง timeout ต้องผ่าน database fence ด้านล่างก่อนเปิด lifecycle

## Database fence ก่อน activation (แก้ตาม PR #87)

ผู้ดูแลทำในช่วง cutover ที่ตกลงไว้หลัง reviewed release เท่านั้น คำสั่งนี้ตั้งใจยุติ transaction ของ runtime เก่า จึงอาจทำให้ request เดิมล้มเหลวและต้อง retry ในรุ่นใหม่ ไม่ใช่ zero-downtime guarantee

1. ทำ inventory ของ pre-state-aware revisions และ jobs/writers ทุกตัว ระบุ **DB login role และ Secret Manager version** ที่ใช้จริง โดยไม่คัดลอก secret payload ลงหลักฐาน ต้องไม่มี writer เก่าที่ถือ credential ของ replacement role; หากยืนยัน mapping ไม่ได้ให้คง writes=false
2. เตรียม replacement runtime login role แยกจาก old role และ operator/admin โดยให้ permissions ที่จำเป็นกับ schema/session ทั้งหมด ทดสอบ normal registration/reads ของ state-aware revision ที่ writes=false แล้วสลับทั้ง service และ migration job ไป replacement credential ที่ **pin เป็น secret version เฉพาะ** ห้ามแก้ payload ของ `latest` ที่ revision เก่าอาจอ่านจนได้ credential ใหม่ ตรวจ old revisions ยังผูกกับ retired versions และปิด job executions เก่าก่อนดำเนินการ
3. ผ่าน Cloud SQL Auth Proxy/ช่องทางส่วนตัว ให้ operator ตั้ง `LIFECYCLE_ADMIN_DATABASE_URL`, `LIFECYCLE_OLD_DATABASE_URL`, `LIFECYCLE_NEW_DATABASE_URL` ใน environment โดยไม่ echo หรือ commit ค่า ต้องเป็น DB endpoint เดียวกัน สาม login roles แยกกัน และ old runtime ไม่ใช่ administrator
4. รันจาก checkout รุ่นที่รีวิวแล้วซึ่งติดตั้ง `pg` dependency:

   ```sh
   node deploy/fence-legacy-db.mjs --fence
   ```

   สคริปต์ยืนยันว่าทั้งสามบัญชีเชื่อมต่อได้และไม่ใช่ role เดียวกันก่อน mutation จากนั้นตั้ง old role เป็น NOLOGIN, ยุติ sessions ของ old role ทุก DB ใน instance, รอจน session count=0, ยืนยัน connection ใหม่ด้วย credential เก่าถูกปฏิเสธด้วย SQLSTATE28000 และตรวจ replacement connection ยังใช้ได้ ถ้ามีหลาย old roles ต้องทำครบทุก role ใน inventory; ห้ามใช้เพียงผลของ role เดียวแทนทั้งหมด
5. เก็บ JSON ผลจริงพร้อม inventory/revision/secret-version mapping และเวลาไว้ใน Issue #8 โดยปิดข้อมูลส่วนตัว JSON ไม่มี connection strings/passwords ต้องมี `retiredLoginDisabled=true`, `retiredSessionCount=0`, `oldConnectionRejected=true`, `replacementConnectionReady=true` ครบทุก role แล้วตรวจ state/count/quota ใหม่ก่อน activation หากล้มเหลวให้ปิด writes ไว้และ operator แก้ปัญหา ห้ามเปิด LOGIN คืนให้รุ่นเก่าหลัง lifecycle เปิดแล้ว

การตั้ง NOLOGIN หยุด connection ใหม่ แต่ไม่ยุติ session เดิม จึงต้องทำคู่กับการ terminate และตรวจผลจริง เอกสารอ้างอิง: [Cloud Run timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout), [ALTER ROLE](https://www.postgresql.org/docs/17/sql-alterrole.html), [pg_terminate_backend](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-ADMIN-SIGNAL)

## Explicit activation of the verified image

ผู้ดูแลตั้ง environment `demo` variable `LIFECYCLE_APPROVED_IMAGES_JSON` เป็นรายการ image ที่ผ่าน compatibility tests และ post-deploy checks จริง เช่นรูปแบบต่อไปนี้ (ต้องแทนค่าตามผลจริง ไม่ใช้ตัวอย่างเป็นหลักฐาน):

```json
[{"sha":"FULL_40_HEX_SHA","digest":"sha256:FULL_64_HEX_DIGEST","compatibility":"ACTIVE_V1","evidence":"https://github.com/PhraewaS/event-system/actions/runs/ACTUAL_RUN_ID"}]
```

เปิด Deploy demo → Run workflow บน main เลือก image_tag/image_digest ของ **image เดิมที่ตรวจแล้ว**, `activate_lifecycle=true`, `lifecycle_cutover_confirmed=true` และ `lifecycle_cutover_evidence` เป็น URL ของหลักฐาน cutover ใน repository นี้ พร้อม `lifecycle_db_fence_confirmed=true` และ `lifecycle_db_fence_evidence` เป็น URL ผลจริง/inventory ของ database fence ข้างต้น

โหมดนี้ reuse immutable image ไม่ build/migrate/seed ซ้ำ ตรวจ approval SHA/digest/compatibility และ cutover confirmation ก่อนเปลี่ยน service/traffic แล้วเปิด writes ผ่าน revision ใหม่ เก็บ revision/config/traffic binding และตรวจ cancel → saved CANCELLED → reactivate กับ permission/count/quota บนรุ่นจริงอีกครั้ง

## Rollback

- Run workflow บน main โดยใช้ approved state-aware SHA/digest และคง `activate_lifecycle=false` (ค่าเริ่มต้น) จะปิด lifecycle writes แต่ยังอ่าน CANCELLED และนับ ACTIVE ถูกต้อง
- ห้ามเลือก e2b9842 หรือ pre-state-aware image หลัง lifecycle เปิดใช้ ไม่ down migration/reset/seed/แปลง CANCELLED เป็น ACTIVE เพื่อรองรับโค้ดเก่า
- ถ้าไม่มี compatible target ที่มีหลักฐาน ให้ fail closed และ roll forward ด้วย state-aware image ที่ผ่าน review/tests การปิด writes ไม่ยกเลิก request ที่ค้างทันที จึงต้องรอ drain ก่อนตรวจ snapshot
- Normal release ใหม่ทุกครั้งปิด writes ก่อน ต้องทำ activation ของ image ที่ตรวจแล้วอีกครั้งก่อนประกาศ feature acceptance

`deploy/verify_lifecycle_release.py` ปฏิเสธ manual targets ที่ไม่มี approval/evidence หรือ activation ที่ไม่ยืนยัน cutover และ DB fence ก่อน Cloud Run mutation; registry digest ต้องตรง approval ด้วย Workflow ตรวจ confirmation/รูปแบบ URL แต่ไม่ได้อ่าน private Cloud SQL หรือรับรอง inventory แทน operator จึงต้องให้ผู้ดูแลตรวจหลักฐานจริงก่อนยืนยัน ไม่มีรายการ image ที่อนุมัติให้โดยอัตโนมัติ

## Offline verification

```sh
python3 deploy/tests/test_lifecycle_release.py
bash deploy/tests/test_release_stub.sh
```

ใช้ fake gcloud เท่านั้น ไม่พิสูจน์ว่า traffic/drain หรือ cloud persistence เกิดจริง ต้องมีผลหลัง release แยกต่างหาก
