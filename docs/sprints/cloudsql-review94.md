# PR #94 review corrections — 28 พฤศจิกายน 2026

Author `guluJa` · reviewer `PhraewaS` · Issue #8 · [review6091877352](https://github.com/PhraewaS/event-system/pull/94#pullrequestreview-6091877352) บน79154f3 (28/11/2026 01:05:18น.UTC+7)

รับทั้ง3ข้อ เพราะเป็น pre-mutation/activation safety gaps ตาม CP-AC-01/02/08 และ Deliverable2 §§3.2/3.4/3.5 ไม่เพิ่ม business scope หรือใช้ผลofflineแทนcloudacceptance

| Review | การแก้และขอบเขต | Tests |
| --- | --- | --- |
| SQL/APIต้องinstanceเดียวกันก่อนreset | Admin API GET instance metadataต้องตรงexpectedproject/name/version และinstanceConnectionNameของทุกSQLclientที่สร้างจากfixed Google Cloud SQL Connector; profilesไม่มีhost/URL/streamoverride ไม่มีการใช้ชื่อDB/rolesตรงกันแทนinstanceidentity; rawTCPprofilesไม่assertCloudinstanceและไม่terminate | sameDB+rolesแต่connectorผูกคนละinstance→rejectก่อนconnect/reset; rawTCP→unbound; profilehostoverride→reject; realPGส่วนถัดไปใช้**localconnectordouble** ไม่ใช่Googleauthproof |
| Operatorต้องตัดsessionsได้ก่อนreset/membership | Read-only catalog check: effectiveoperatoridentity, functionEXECUTE และeffectiveprivilegesของpg_signal_backend/targetrole พร้อมsuperuser-targetrestriction; recheckก่อนแต่ละmutation ไม่ทดลองkillเพื่อดูสิทธิ์; การถูกถอนสิทธิ์กลางงานให้หยุดก่อนstepถัดไป ไม่คืนoldcredentialเอง | localoperatorไม่มีsignalrights→0managementmutations/passwordยังเดิม/membershipยังเดิม; grantpg_signal_backendเฉพาะfixtureแล้วreadonlycheckผ่าน; mocklostauthority→หยุดก่อนrevoke |
| Activationต้องเทียบconfigจริง หรือoffline-onlyก่อน | เลือก **offline-only** ตามข้อเสนอreviewer: ยังไม่มีauthoritativelive service/job configreader จึงrejectCPในrelease.shก่อนgcloud และrejectในPythonreleasevalidatorด้วย ไม่ว่าจะactivationtrue/falseหรือมีCPproofแต่ลืมmethod; positiveofflinecomparisonยังทดสอบได้แต่ผลระบุliveConfigurationVerified=false/releaseActivationAllowed=false | validreviewedJSONก็activateผ่านreleaseไม่ได้; fake-gcloudcalllogว่าง; defaultstrictpath/regressionเดิมยังผ่าน; CP-19positiveเป็นcomparisonmodelเท่านั้น |

## Versioned verification

- RED5f99f78:2newVitestbehaviorfailuresและ1Pythonbehaviorfailureบน79154f3 ไม่ใช่setup/importfailure ดู [RED](../../evidence/sprint-2/cloudsql-implementation/review94-RED.txt)
- Runtime correction2193c11:instance-boundSQLfactory/APIread, authoritypreflight, unconditionalCPreleasehardstop และregressions
- [Node/API/localPG output](../../evidence/sprint-2/cloudsql-implementation/review94-regression.txt) และ [Python/offline output](../../evidence/sprint-2/cloudsql-implementation/review94-python.txt) เป็นผลจริง แยกจากhistorical143/38/42ของ79154f3
- ไม่มีการเปลี่ยนschema/migrations/appbusinessrules/productioncredentials/IAM/GitHubvariables/WIFSHA ไม่deployและไม่เปิดlifecycle เครื่องทดสอบใช้disposablelocalPostgreSQLและmockGoogleconnector/APIเท่านั้น

| Actual check on runtime2193c11 | Result |
| --- | --- |
| FullVitest unit/API/localPG/client |149passed/0failed/0skipped (19files) |
| AllPython deploy/offline/WIF/smoke |39passed/0failed/0skipped; รวมhardstopreleaseก่อนgcloudและpositiveofflinecomparisonที่releaseActivationAllowed=false |
| NativeJS / Bash syntax / gitdiff whitespace |ผ่าน |
| LiveGoogleconnector/AdminAPI/SQLpermissions และservice/jobconfig |ไม่ได้ทดสอบกับระบบจริง; testsใช้explicitdoubles/localPG |
| CI/Docker/browserบนPRheadใหม่ |รอhostedCIหลังpush ไม่ใช้runเดิมของ79154f3แทน |

## Remaining / acceptance status

Implemented and locally verified:softwarepreflights, mutationordering/failuregates, SQLpermissionreadback และofflineproofpolicy Implementationreview/CIต้องตรวจบนPRheadใหม่

**Deferredและblocked:**actualCloudoperator/connectorauthentication, newrole/ACL/secretprovisioning, actualcutover, independentlivereadsofservice/job/revision/image/identities/instance/secretversions, CP liveactivationintegration และpost-deployacceptance ยังไม่รับรองว่าส่วนเหล่านี้ผ่าน และไม่ปิด#8/#85หรือประกาศSprint2complete

ก่อนปลดCPreleasehardstopต้องมีimplementation/review/testของauthoritative liveconfigreaderและactualevidence ไม่ใช้เพียงJSON/checkbox/CIgreenแทน ขออนุมัติเปลี่ยนระบบแยกในภายหลัง Currenttrustedoperatorintegrationต้องใช้officialGoogleconnectorตามที่review ไม่ใช้testdoubleหรือBooleaninstanceclaimบนระบบจริง ไม่มีการเพิ่มambientcredentialdiscoveryหรือdependencyให้webappในรอบนี้

อ้างอิงกลไก: [GoogleCloudSQLConnector](https://docs.cloud.google.com/sql/docs/postgres/connect-connectors), [PostgreSQL17backend signaling](https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-ADMIN-SIGNAL)
