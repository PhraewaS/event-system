"""S2-A-DEPLOY-01: offline fake gcloud, no cloud access or real credentials."""
import json,os,shutil,subprocess,tempfile,unittest,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SHA='1'*40; DIGEST='sha256:'+'a'*64
BASH=shutil.which('bash') or 'C:/Program Files/Git/bin/bash.exe'
class ReleaseGate(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='s2-release-');self.folder=Path(self.tmp.name)
  self.log=self.folder/'calls';stub=self.folder/'gcloud'
  stub.write_text('''#!/usr/bin/env bash
echo "$*" >> "$CALL_LOG"
case "$*" in
 'artifacts docker images describe '*) echo 'asia-southeast1-docker.pkg.dev/release-test/gather/gather@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';;
 'run services describe '*) echo 'https://synthetic.example.test';;
esac
''',encoding='utf-8');stub.chmod(0o755)
  self.env={**os.environ,'PATH':str(self.folder)+os.pathsep+os.environ['PATH'],'CALL_LOG':str(self.log).replace('\\','/'),'GITHUB_ENV':str(self.folder/'env').replace('\\','/'),
   'PROJECT_ID':'release-test','REGION':'asia-southeast1','IMAGE_TAG':SHA,'EXPECTED_IMAGE_DIGEST':DIGEST,'ROLLBACK':'true',
   'ACTIVATE_LIFECYCLE':'false','LIFECYCLE_CUTOVER_CONFIRMED':'false','LIFECYCLE_APPROVED_IMAGES_JSON':'[]','PYTHON_COMMAND':sys.executable.replace('\\','/')}
 def tearDown(self):self.tmp.cleanup()
 def run_release(self,**changes):
  env={**self.env,**changes}
  return subprocess.run([BASH,str(ROOT/'deploy/release.sh').replace('\\','/')],env=env,capture_output=True,text=True)
 def calls(self):return self.log.read_text() if self.log.exists() else ''
 def approval(self):return json.dumps([{'sha':SHA,'digest':DIGEST,'compatibility':'ACTIVE_V1','evidence':'https://github.com/PhraewaS/event-system/actions/runs/123'}])
 def test_unverified_rollback_rejected_before_mutation(self):
  r=self.run_release();self.assertNotEqual(r.returncode,0,r.stdout)
  self.assertNotIn('run services update',self.calls());self.assertNotIn('run jobs',self.calls())
 def test_verified_rollback_disables_writes_and_never_migrates(self):
  r=self.run_release(LIFECYCLE_APPROVED_IMAGES_JSON=self.approval());self.assertEqual(r.returncode,0,r.stderr)
  self.assertIn('REGISTRATION_LIFECYCLE_WRITES_ENABLED=false',self.calls());self.assertNotIn('run jobs',self.calls())
 def test_activation_without_cutover_confirmation_rejected(self):
  r=self.run_release(LIFECYCLE_APPROVED_IMAGES_JSON=self.approval(),ACTIVATE_LIFECYCLE='true');self.assertNotEqual(r.returncode,0)
  self.assertNotIn('run services update',self.calls())
 def test_verified_explicit_activation_reuses_image(self):
  r=self.run_release(LIFECYCLE_APPROVED_IMAGES_JSON=self.approval(),ACTIVATE_LIFECYCLE='true',LIFECYCLE_CUTOVER_CONFIRMED='true',LIFECYCLE_CUTOVER_EVIDENCE='https://github.com/PhraewaS/event-system/issues/8#issuecomment-123',LIFECYCLE_DB_FENCE_CONFIRMED='true',LIFECYCLE_DB_FENCE_EVIDENCE='https://github.com/PhraewaS/event-system/issues/8#issuecomment-124')
  self.assertEqual(r.returncode,0,r.stderr);self.assertIn('REGISTRATION_LIFECYCLE_WRITES_ENABLED=true',self.calls());self.assertNotIn('run jobs',self.calls())
 def test_timeout_drain_without_db_fence_cannot_activate(self):
  r=self.run_release(LIFECYCLE_APPROVED_IMAGES_JSON=self.approval(),ACTIVATE_LIFECYCLE='true',LIFECYCLE_CUTOVER_CONFIRMED='true',LIFECYCLE_CUTOVER_EVIDENCE='https://github.com/PhraewaS/event-system/issues/8#issuecomment-123',LIFECYCLE_DB_FENCE_CONFIRMED='false',LIFECYCLE_DB_FENCE_EVIDENCE='')
  self.assertNotEqual(r.returncode,0,r.stdout);self.assertNotIn('run services update',self.calls())
 def test_db_fence_confirmation_requires_evidence(self):
  r=self.run_release(LIFECYCLE_APPROVED_IMAGES_JSON=self.approval(),ACTIVATE_LIFECYCLE='true',LIFECYCLE_CUTOVER_CONFIRMED='true',LIFECYCLE_CUTOVER_EVIDENCE='https://github.com/PhraewaS/event-system/issues/8#issuecomment-123',LIFECYCLE_DB_FENCE_CONFIRMED='true',LIFECYCLE_DB_FENCE_EVIDENCE='')
  self.assertNotEqual(r.returncode,0,r.stdout);self.assertNotIn('run services update',self.calls())
 def test_review94_cp_activation_with_full_legacy_confirmations_stops_before_any_gcloud_call(self):
  r=self.run_release(LIFECYCLE_APPROVED_IMAGES_JSON=self.approval(),ACTIVATE_LIFECYCLE='true',
   LIFECYCLE_CUTOVER_CONFIRMED='true',LIFECYCLE_CUTOVER_EVIDENCE='https://github.com/PhraewaS/event-system/issues/8#issuecomment-123',
   LIFECYCLE_DB_FENCE_CONFIRMED='true',LIFECYCLE_DB_FENCE_EVIDENCE='https://github.com/PhraewaS/event-system/issues/8#issuecomment-124',
   LIFECYCLE_DB_FENCE_METHOD='CLOUDSQL_CREDENTIAL_RETIREMENT_V1')
  self.assertNotEqual(r.returncode,0,r.stdout);self.assertEqual(self.calls(),'')
  self.assertIn('offline proof',r.stderr)
  r=self.run_release(ACTIVATE_LIFECYCLE='false',LIFECYCLE_DB_FENCE_METHOD='CLOUDSQL_CREDENTIAL_RETIREMENT_V1')
  self.assertNotEqual(r.returncode,0,r.stdout);self.assertEqual(self.calls(),'')
  # Omitting the method must not disguise CP evidence as the legacy strict path.
  r=self.run_release(LIFECYCLE_APPROVED_IMAGES_JSON=self.approval(),ACTIVATE_LIFECYCLE='true',
   LIFECYCLE_DB_FENCE_METHOD='',CP_FENCE_BUNDLE_PATH='synthetic-reviewed-proof.json')
  self.assertNotEqual(r.returncode,0,r.stdout);self.assertEqual(self.calls(),'')
if __name__=='__main__':unittest.main(verbosity=2)
