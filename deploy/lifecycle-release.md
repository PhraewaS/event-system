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
3. ทำ **read-only preflight** ด้านล่างก่อน เพื่อแยก ordinary runtime ออกจาก legacy privileged login; ห้ามสมมติว่าบัญชี `gather` ไม่มี CREATEROLE จากชื่อบัญชีหรือจากการเป็น application user
4. ถ้า preflight ยืนยัน old runtime เป็น ordinary login และ operator มีสิทธิ์ครบ จึงใช้เส้นทางปกติ: ผ่าน Cloud SQL Auth Proxy/ช่องทางส่วนตัว ตั้ง `LIFECYCLE_ADMIN_DATABASE_URL`, `LIFECYCLE_OLD_DATABASE_URL`, `LIFECYCLE_NEW_DATABASE_URL` โดยไม่ echo/commit ค่า ต้องเป็น DB endpoint เดียวกัน สาม login roles แยกกัน รันจาก checkout รุ่นที่รีวิวแล้วซึ่งติดตั้ง `pg` dependency:

   ```sh
   node deploy/fence-legacy-db.mjs --fence
   ```

   สคริปต์ยืนยันว่าทั้งสามบัญชีเชื่อมต่อได้และไม่ใช่ role เดียวกันก่อน mutation จากนั้นตั้ง old role เป็น NOLOGIN, ยุติ sessions ของ old role ทุก DB ใน instance, รอจน session count=0, ยืนยัน connection ใหม่ด้วย credential เก่าถูกปฏิเสธด้วย SQLSTATE28000 และตรวจ replacement connection ยังใช้ได้ ถ้ามีหลาย old roles ต้องทำครบทุก role ใน inventory; ห้ามใช้เพียงผลของ role เดียวแทนทั้งหมด
5. ถ้าพบ CREATEROLE/privileged membership ให้ใช้เส้นทาง legacy privileged login ด้านล่าง **แทนการ bypass guard ของสคริปต์** ทั้งสองเส้นทางต้องเก็บผลจริงพร้อม inventory/revision/secret-version mapping และเวลาไว้ใน Issue #8 โดยปิดข้อมูลส่วนตัว หลักฐานต้องยืนยัน `retiredLoginDisabled=true`, `retiredSessionCount=0`, `oldConnectionRejected=true`, `replacementConnectionReady=true` ครบทุก role แล้วตรวจ state/count/quota ใหม่ก่อน activation หากล้มเหลวให้ปิด writes ไว้และ operator แก้ปัญหา ห้ามเปิด LOGIN คืนให้รุ่นเก่าหลัง lifecycle เปิดแล้ว

การตั้ง NOLOGIN หยุด connection ใหม่ แต่ไม่ยุติ session เดิม จึงต้องทำคู่กับการ terminate และตรวจผลจริง เอกสารอ้างอิง: [Cloud Run timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout), [ALTER ROLE](https://www.postgresql.org/docs/17/sql-alterrole.html), [pg_terminate_backend](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-ADMIN-SIGNAL)

### Read-only preflight: ตรวจ role และ operator ก่อนเลือกเส้นทาง

Cloud SQL built-in users ที่สร้างแบบเดิมอาจได้รับ `cloudsqlsuperuser` และ CREATEROLE/CREATEDB/LOGIN อัตโนมัติ; `deploy/deploy.sh` เดิมใช้ `gcloud sql users create gather` โดยไม่ระบุ custom roles จึงมีโอกาสพบกรณีนี้ **ยังไม่ได้อ่านค่าจริงของ Cloud SQL ใน PR นี้** อ้างอิง [Cloud SQL users](https://docs.cloud.google.com/sql/docs/postgres/create-manage-users) และ [ข้อจำกัด cloudsqlsuperuser](https://docs.cloud.google.com/sql/docs/postgres/users)

ให้ operator ใช้ private connection profile ผ่าน Proxy/ช่องทางที่อนุญาต ไม่ส่ง connection URL/password ลง command history หรือ Git ตั้งชื่อ role ให้ตรง inventory จริง ตัวอย่าง `gather_runtime_v2` เป็นชื่อเสนอ ไม่ใช่หลักฐานว่าสร้างแล้ว:

```sh
psql --dbname=service=PRIVATE_OPERATOR_PROFILE -X \
  -v old_role=gather -v new_role=gather_runtime_v2 \
  -f deploy/lifecycle-role-preflight.sql
```

SQL นี้ใช้ catalog SELECTs ภายใน `BEGIN READ ONLY` เท่านั้น ไม่เรียก ALTER/GRANT/REVOKE/terminate หรืออ่าน password hashes ตรวจผลดังนี้:

- server version ต้องตรง PostgreSQL ที่ใช้จริง (แบบตรวจนี้ออกแบบกับ17); old/new/operator เป็นคนละ role และ replacement มีอยู่จริงก่อน cutover
- flags ของ old role และ inherited memberships โดยเฉพาะ cloudsqlsuperuser; ตรวจ ownership และ session ทุก DB เพื่อระบุผู้ได้รับผลกระทบก่อนเปลี่ยนสิทธิ์ role ระดับ instance
- operator ต้องมีสิทธิ์ ALTER target role จริง PostgreSQL17 ต้องพิจารณา CREATEROLE และ ADMIN OPTION ของ target ด้วย ไม่ใช่เห็น CREATEROLE แล้วถือว่าแก้ได้ทุก role; ถ้าต้อง revoke membership ต้องมี authority ของ role ที่จะ revoke เช่น cloudsqlsuperuser แยกต่างหาก
- สิทธิ์ยุติ backend ต้องตรวจทั้ง EXECUTE ของฟังก์ชันและ role membership/pg_signal_backend; หากต้องสำรวจ session ทั้ง instance ต้องมีสิทธิ์อ่านสถิติเพียงพอด้วย ค่า indicator เป็นข้อมูลตรวจสอบ ไม่ใช่การทดลอง mutation หรือการรับรองสิทธิ์พิเศษของ managed service

ถ้า old role หายไป, operator=old/new, สิทธิ์ไม่ครบ หรือพบ SUPERUSER/REPLICATION/system-managed account ให้หยุดและให้ผู้ดูแล Cloud SQL วางวิธีที่รองรับก่อน คง writes=false; ห้าม grant สิทธิ์ admin ให้ runtime หรือถือว่า GitHub/GCP IAM Owner เท่ากับ PostgreSQL DBA

### Legacy privileged login: แผนปลดระวางเมื่อ gather มี CREATEROLE

นี่เป็น **แผนสำหรับ operator ในช่วง cutover หลัง reviewed release** ไม่ใช่คำสั่งให้ทำตอนตรวจ PR และไม่ต้องเปลี่ยน Cloud SQL เพื่อให้ PR นี้ผ่าน

1. ผ่าน preflight/inventory และตรวจสิทธิ์ operator อิสระจากบัญชีเก่าให้ครบ เตรียม replacement runtime แบบ least privilege และ migration/operator แยกตามงาน ทดสอบ service/session/normal registration และ migration permissions ด้วย credential ที่ pin รุ่นแล้วก่อนตัดบัญชีเก่า หาก old role เป็นเจ้าของ objects ให้คง objects/data ไว้และจัดสิทธิ์/ownership ของงานที่ต้อง migrate อย่างเจาะจง ไม่ใช้ DROP OWNED/รีเซ็ต/ลบ user เพื่อแก้ปัญหา
2. หลัง service/jobs ใหม่ใช้ credential ใหม่ และเอา old traffic/tags/jobs ออกแล้ว operator จึงปลดระวาง old login จาก connection ของตนที่แยกกัน: ตั้ง **NOLOGIN และ NOCREATEROLE** พร้อม revoke `cloudsqlsuperuser` membership และ privileged paths ที่ inventory พบ โดยใช้คำสั่งที่ operator มีสิทธิ์จริง สำหรับ membership ปกติแบบ direct ชื่อ gather ตัวอย่างที่ต้องตรวจปรับก่อนใช้คือ:

   ```sql
   -- MUTATING PLAN ONLY: ห้ามรันใน read-only preflight หรือบน Cloud SQL ระหว่าง PR นี้
   BEGIN;
   ALTER ROLE gather NOLOGIN NOCREATEROLE;
   REVOKE cloudsqlsuperuser FROM gather;
   COMMIT;
   ```

   ตัวอย่างไม่ครอบคลุม inherited/admin-option paths ทุกแบบ ต้องตัด paths ที่พบจริงด้วยสิทธิ์ที่ตรวจแล้ว หาก provider จำกัดคำสั่ง/สิทธิ์ใด ให้หยุดที่ writes=false และใช้วิธีที่ผู้ดูแล Cloud SQL รองรับ ไม่ลบเงื่อนไข CREATEROLE ในสคริปต์ และไม่เปิด LOGIN คืนเพื่อให้สคริปต์รันผ่าน
3. หลัง privilege changes commit แล้ว ยุติ old-role sessions ทุก DB ด้วย operator ที่มีสิทธิ์และรอจน `pg_stat_activity` ไม่เหลือ old-role session ตรวจ flags/memberships ซ้ำจาก catalog ให้ NOLOGIN/NOCREATEROLE และไม่มี privileged path ที่ยังไม่จัดการ **NOLOGIN อย่างเดียวไม่ยุติ session ที่ค้าง**
4. ลอง connection ใหม่ด้วย credential เก่าที่เคยยืนยันว่าใช้ได้ก่อน cutover ต้องถูกปฏิเสธเพราะ NOLOGIN (SQLSTATE28000; network error/ผิดรหัสไม่ใช่หลักฐาน) และตรวจ replacement connection/API/count/quota/persistence ยังผ่าน เก็บผลแต่ละข้อพร้อม operator/time/revision/secret-version mapping โดยไม่ใส่ค่าลับเป็น manual fence proof ที่เทียบเท่าเงื่อนไขสคริปต์ หากไม่ครบห้ามยืนยัน activation

คง old role เป็น NOLOGIN เพื่อรักษา object ownership/history ไม่ต้อง DROP ROLE หลัง fence เส้นทางนี้ไม่เรียก ordinary-role script ซ้ำ เพราะสคริปต์ตั้งใจต้องเห็น old credential ที่ยัง login ได้ก่อนลงมือ ไม่แอบอ้างผล manual Cloud SQL เป็น local script output

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
