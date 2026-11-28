"""LG-01..08: offline capability doubles; never authenticates to GCP."""
import copy
import json
import sys
import tempfile
import os
import unittest
from contextlib import contextmanager
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from live_release_gate import evaluate_live_release, configuration_from_environment
from test_credential_proof import fixture, NOW

CONFIG='sha256:'+'d'*64
GATE_SHA='4'*40

class Client:
    def __init__(self,target):
        self.target=target;self.calls=[];self.cloud_changes={};self.sql_changes={};self.second_cloud_changes={}
        self.source={'sha':GATE_SHA,'clean':True};self.digest=target['image_digest'];self.frozen=True;self.patch_error=False;self.post_ok=True
        self.mutation_may_have_started=False
    def execution_source(self):self.calls.append('source');return self.source
    def cloud_configuration(self,target):
        self.calls.append('cloud')
        result={'cloudFieldsMatch':True,'readOnly':True,'releaseActivationAllowed':False,'configReviewHash':CONFIG,'observedAt':NOW.isoformat(),'observed':{'serviceEtag':'etag','serviceUid':'service-uid','jobEtag':'job-etag','jobUid':'job-uid','servingRevision':target['pre_activation_revision']}}
        result.update(self.cloud_changes)
        if self.calls.count('cloud')>1:result.update(self.second_cloud_changes)
        return result
    def sql_configuration(self,target):
        self.calls.append('sql')
        result={'database':target['database'],'instance':target['instance_connection_name'],'roles':copy.deepcopy(target['roles']),'replacementProfilesVerified':True,'oldSessionCount':0,'oldRoleAttributes':{'login':True,'createrole':True,'createdb':True},'oldMemberships':[],'migrationProfile':{'ownerRole':target['roles']['old']['name'],'set':True,'admin':False,'inherit':True,'privilegedPathReviewed':True}}
        result.update(self.sql_changes);return result
    def image_digest(self,target):self.calls.append('image');return self.digest
    def assert_write_barrier(self):self.calls.append('barrier-checked')
    @contextmanager
    def write_freeze(self,target):
        self.calls.append('freeze-enter')
        try:yield self.frozen
        finally:self.calls.append('freeze-exit')
    def activate(self,target,observation,*,authorize_now):
        authorize_now()
        self.calls.append('activate')
        self.mutation_may_have_started=True
        if self.patch_error=='interrupt':raise KeyboardInterrupt()
        if self.patch_error:raise ValueError('CONDITIONAL_UPDATE_FAILED')
        return {'revision':target['service']+'/revisions/new-revision','verified':self.post_ok}
    def wait_until_disabled(self,target):
        if 'freeze-exit' in self.calls:raise AssertionError('Barrier was released before safe recovery')
        self.calls.append('wait-disabled-confirmed')

def inputs():
    bundle,trust=fixture()
    trust.update({'accepted_gate_sha':GATE_SHA,'approved_config_hash':CONFIG})
    return bundle,trust,Client(bundle['request'])

class LiveReleaseGate(unittest.TestCase):
    def test_LG01_valid_live_check_only_never_freezes_or_mutates(self):
        b,t,c=inputs();result=evaluate_live_release(b,t,c,clock=lambda:NOW)
        self.assertIs(result['liveConfigurationVerified'],True)
        self.assertIs(result['activationExecuted'],False)
        self.assertNotIn('activate',c.calls);self.assertNotIn('freeze-enter',c.calls)
        self.assertIn('cloud',c.calls);self.assertIn('sql',c.calls)

    def test_LG03_valid_offline_proof_cannot_hide_cloud_or_config_mismatch(self):
        for edit in [{'cloudFieldsMatch':False},{'configReviewHash':'sha256:'+'a'*64},{'readOnly':False}]:
            with self.subTest(edit=edit):
                b,t,c=inputs();c.cloud_changes=edit
                with self.assertRaises(ValueError):evaluate_live_release(b,t,c,clock=lambda:NOW)
                self.assertNotIn('activate',c.calls)

    def test_LG02_missing_trusted_pins_or_unapproved_proof_blocks_before_live_reads(self):
        for key in ('accepted_gate_sha','approved_config_hash','activation_approved','approved_hash'):
            with self.subTest(key=key):
                b,t,c=inputs();t[key]=False if key=='activation_approved' else ''
                with self.assertRaises(ValueError):evaluate_live_release(b,t,c,clock=lambda:NOW)
                self.assertEqual(c.calls,[])

    def test_LG04_live_database_identity_sessions_and_migration_authority_must_match(self):
        b0,t0,c0=inputs()
        for edit in [{'database':'other'},{'instance':'other'},{'roles':{}},{'replacementProfilesVerified':False},
                     {'oldSessionCount':False},{'oldSessionCount':1},{'oldRoleAttributes':{}},
                     {'oldMemberships':['cloudsqlsuperuser']},{'migrationProfile':{'admin':True}}]:
            with self.subTest(edit=edit):
                b,t,c=inputs();c.sql_changes=edit
                with self.assertRaises(ValueError):evaluate_live_release(b,t,c,clock=lambda:NOW)
                self.assertNotIn('activate',c.calls)

    def test_LG05_dirty_or_unaccepted_source_and_tag_retarget_reject(self):
        for edit in ({'sha':GATE_SHA,'clean':False},{'sha':'5'*40,'clean':True}):
            b,t,c=inputs();c.source=edit
            with self.assertRaises(ValueError):evaluate_live_release(b,t,c,clock=lambda:NOW)
            self.assertEqual(c.calls,['source'])
        b,t,c=inputs();c.digest='sha256:'+'f'*64
        with self.assertRaises(ValueError):evaluate_live_release(b,t,c,clock=lambda:NOW)

    def test_LG06_explicit_execution_rechecks_inside_freeze_and_activates_once(self):
        b,t,c=inputs();r=evaluate_live_release(b,t,c,execute=True,clock=lambda:NOW)
        self.assertIs(r['activationExecuted'],True)
        self.assertEqual(c.calls.count('activate'),1)
        self.assertEqual(c.calls.count('cloud'),2)
        self.assertLess(c.calls.index('freeze-enter'),len(c.calls)-1-c.calls[::-1].index('cloud'))
        self.assertEqual(c.calls[-1],'freeze-exit')

    def test_LG07_missing_freeze_or_final_cloud_drift_blocks_mutation(self):
        for change in ('freeze','cloud'):
            b,t,c=inputs()
            if change=='freeze':c.frozen=False
            else:c.second_cloud_changes={'observed':{'serviceEtag':'different'}}
            with self.assertRaises(ValueError):evaluate_live_release(b,t,c,execute=True,clock=lambda:NOW)
            self.assertNotIn('activate',c.calls)
            self.assertEqual(c.calls[-1],'freeze-exit')

    def test_LG07_expiry_during_live_reads_rejects_before_mutation(self):
        from datetime import timedelta
        b,t,c=inputs();counter=[0]
        def clock():
            counter[0]+=1
            return NOW if counter[0]<5 else NOW+timedelta(hours=1)
        with self.assertRaises(ValueError):evaluate_live_release(b,t,c,execute=True,clock=clock)
        self.assertNotIn('activate',c.calls)

    def test_LG08_conditional_failure_or_failed_postcheck_never_retries(self):
        for flag in ('patch_error','post_ok','interrupt'):
            b,t,c=inputs()
            if flag=='interrupt':c.patch_error='interrupt'
            else:setattr(c,flag,flag=='patch_error')
            with self.assertRaises((ValueError,KeyboardInterrupt)):evaluate_live_release(b,t,c,execute=True,clock=lambda:NOW)
            self.assertEqual(c.calls.count('activate'),1)
            self.assertEqual(c.calls[-1],'freeze-exit')
            self.assertLess(c.calls.index('wait-disabled-confirmed'),c.calls.index('freeze-exit'))

    def test_saved_json_observation_cannot_replace_in_process_client(self):
        b,t,c=inputs()
        with self.assertRaises(AttributeError):evaluate_live_release(b,t,{'cloudFieldsMatch':True},clock=lambda:NOW)

    def test_LG02_environment_binding_and_explicit_execution_modes(self):
        from datetime import datetime,timezone
        b,t=fixture(datetime.now(timezone.utc));target=b['request']
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'proof.json';path.write_text(json.dumps(b),encoding='utf-8')
            env={'LIFECYCLE_DB_FENCE_METHOD':b['proof']['method'],'ROLLBACK':'true','ACTIVATE_LIFECYCLE':'true',
                 'CP_FENCE_BUNDLE_PATH':str(path),'CP_APPROVED_PROOF_SHA256':t['approved_hash'],
                 'CP_ACCEPTED_IMPLEMENTATION_SHA':t['accepted_implementation'],'CP_APPROVED_REVIEWER':'synthetic-reviewer',
                 'CP_ACTIVATION_APPROVED':'true','CP_ACCEPTED_RELEASE_GATE_SHA':GATE_SHA,'CP_APPROVED_CONFIG_SHA256':CONFIG,
                 'PROJECT_ID':target['project'],'REGION':target['instance_connection_name'].split(':')[1],
                 'SERVICE_NAME':target['service'].split('/')[-1],'MIGRATE_JOB_NAME':target['job'].split('/')[-1],
                 'IMAGE_TAG':target['image_sha'],'EXPECTED_IMAGE_DIGEST':target['image_digest']}
            self.assertIs(configuration_from_environment(env)[2],False)
            for key in ('PROJECT_ID','REGION','SERVICE_NAME','MIGRATE_JOB_NAME','IMAGE_TAG','EXPECTED_IMAGE_DIGEST'):
                with self.subTest(key=key):
                    with self.assertRaises(ValueError):configuration_from_environment({**env,key:'different'})
            for change in ({'CP_CHECK_ONLY':'false'},{'CP_EXECUTE_APPROVED_ACTIVATION':'true'},
                           {'CP_CHECK_ONLY':'TRUE'},{'LIFECYCLE_DB_FENCE_METHOD':''},{'ROLLBACK':'false'}):
                with self.subTest(change=change):
                    with self.assertRaises(ValueError):configuration_from_environment({**env,**change})
            self.assertIs(configuration_from_environment({**env,'CP_CHECK_ONLY':'false','CP_EXECUTE_APPROVED_ACTIVATION':'true'})[2],True)

    def test_LG10_shell_dispatch_success_does_not_fall_through_to_legacy_cloud_commands(self):
        self.shell_dispatch('0')

    def test_LG10_shell_dispatch_rejection_does_not_fall_back_to_legacy(self):
        self.shell_dispatch('1')

    def shell_dispatch(self,code):
        # Only the shell dispatcher is under test here: its coordinator process
        # is a labelled local stub, not a fabricated cloud verification result.
        from test_lifecycle_release import ReleaseGate
        helper=ReleaseGate();helper.setUp();self.addCleanup(helper.tearDown)
        stub=helper.folder/'coordinator-stub'
        marker=helper.folder/'coordinator-called'
        stub.write_text('#!/usr/bin/env bash\nprintf "%s" "$1" > "$GATE_MARKER"\nexit '+code+'\n',encoding='utf-8');stub.chmod(0o755)
        result=helper.run_release(LIFECYCLE_DB_FENCE_METHOD='CLOUDSQL_CREDENTIAL_RETIREMENT_V1',
            CP_CHECK_ONLY='true',PYTHON_COMMAND=str(stub).replace('\\','/'),GATE_MARKER=str(marker).replace('\\','/'))
        self.assertEqual(result.returncode,int(code),result.stderr)
        self.assertIn('live_release_gate.py',marker.read_text())
        self.assertEqual(helper.calls(),'')

if __name__=='__main__':unittest.main(verbosity=2)
