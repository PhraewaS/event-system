"""LG-01..08: offline capability doubles; never authenticates to GCP."""
import copy
import sys
import unittest
from contextlib import contextmanager
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from live_release_gate import evaluate_live_release
from test_credential_proof import fixture, NOW

CONFIG='sha256:'+'d'*64
GATE_SHA='4'*40

class Client:
    def __init__(self,target):
        self.target=target;self.calls=[];self.cloud_changes={};self.sql_changes={};self.second_cloud_changes={}
        self.source={'sha':GATE_SHA,'clean':True};self.digest=target['image_digest'];self.frozen=True;self.patch_error=False;self.post_ok=True
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
    @contextmanager
    def write_freeze(self,target):
        self.calls.append('freeze-enter')
        try:yield self.frozen
        finally:self.calls.append('freeze-exit')
    def activate(self,target,observation):
        self.calls.append('activate')
        if self.patch_error:raise ValueError('CONDITIONAL_UPDATE_FAILED')
        return {'revision':'new-revision','verified':self.post_ok}

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

if __name__=='__main__':unittest.main(verbosity=2)
