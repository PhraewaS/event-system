"""CP-01..06,09,11,13..16,19..21: offline evidence policy, no network."""
import copy
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verify_credential_fence import CHECKS, METHOD, canonical_hash, load_json, verify_bundle

NOW = datetime(2026, 11, 27, 12, 0, tzinfo=timezone.utc)
STAMP = lambda d: d.isoformat()


def fixture(now=NOW):
    vectors = json.loads((Path(__file__).resolve().parents[2] / 'docs/tests/cloudsql-credential-retirement-cases.json').read_text(encoding='utf-8'))
    target = vectors['future_activation_fixture']['matching_proof_readback_request_target']
    proof = {'method': METHOD, 'author':'synthetic-author', 'operator':'cp_operator',
        'implementationSha':'2'*40, 'verifiedAt':STAMP(now-timedelta(minutes=2)),
        'windowStart':STAMP(now-timedelta(minutes=10)), 'windowEnd':STAMP(now+timedelta(minutes=10)),
        'target':target, 'checks':dict.fromkeys(CHECKS,True), 'oldCredentialPositiveControl':True,
        'oldCredentialSqlstate':'28P01', 'retiredSessionCount':0,
        'oldRoleAttributes':{'login':True,'createrole':True,'createdb':True}, 'oldMemberships':[],
        'migrationProfile':{'ownerRole':'cp_old','set':True,'admin':False,'inherit':True,'privilegedPathReviewed':True}}
    digest = canonical_hash(proof)
    bundle = {'proof':proof,'review':{'reviewer':'synthetic-reviewer','state':'APPROVED','proofHash':digest,
        'reviewedAt':STAMP(now-timedelta(minutes=1))},
        'readback':{'observedAt':STAMP(now),'writesEnabled':False,'target':copy.deepcopy(target)},
        'request':copy.deepcopy(target)}
    trust = {'approved_hash':digest,'accepted_implementation':'2'*40,'reviewers':['synthetic-reviewer'],
        'activation_approved':True,'now':now}
    return bundle, trust


class ProofPolicy(unittest.TestCase):
    def test_CP19_complete_reviewed_bound_proof_allows_decision_without_claiming_nologin(self):
        bundle, trust = fixture()
        result = verify_bundle(bundle, **trust)
        self.assertEqual(result['decision'], 'allow_activation')
        self.assertEqual(result['cloudOperations'], 0)
        self.assertIs(result['retiredLoginDisabled'], False)
        self.assertIs(result['releaseActivationAllowed'], False)
        self.assertIs(result['liveConfigurationVerified'], False)
        self.assertEqual(result['scope'], 'OFFLINE_ATTESTATION_COMPARISON_ONLY')

    def reject_edit(self, edit, repin=True):
        bundle, trust = fixture()
        edit(bundle, trust)
        if repin:
            trust['approved_hash'] = canonical_hash(bundle['proof'])
            bundle['review']['proofHash'] = trust['approved_hash']
        with self.assertRaises((ValueError, KeyError, TypeError)):
            verify_bundle(bundle, **trust)

    def test_CP01_06_11_12_every_missing_failed_unknown_attestation_blocks(self):
        for name in CHECKS:
            for value in (False, None, 'true', 1):
                with self.subTest(check=name,value=value):
                    self.reject_edit(lambda b,t:b['proof']['checks'].__setitem__(name,value))

    def test_CP20_every_target_component_mismatch_blocks_even_with_valid_review(self):
        target = fixture()[0]['request']
        for source in ('readback','request'):
            for key in target:
                with self.subTest(source=source,key=key):
                    def edit(b,t):
                        obj=b['readback']['target'] if source=='readback' else b['request']
                        obj[key] = {} if key=='roles' else obj[key]+'-different'
                    self.reject_edit(edit)

    def test_CP21_runtime_and_migrator_versions_reject_latest_missing_wrong_resource(self):
        for key in ('runtime_secret_version','migrator_secret_version'):
            for bad in ('projects/cp-fixture-project/secrets/wrong/versions/9', 'latest', '', None):
                with self.subTest(key=key,bad=bad):
                    self.reject_edit(lambda b,t:b['request'].__setitem__(key,bad))

    def test_CP02_roles_and_operator_cannot_alias(self):
        self.reject_edit(lambda b,t:b['proof'].__setitem__('operator','cp_old'))
        self.reject_edit(lambda b,t:b['proof']['target']['roles'].__setitem__('runtime',b['proof']['target']['roles']['old']))

    def test_CP08_sessions_must_be_exact_integer_zero(self):
        for value in (1, None, False, '0', -1):
            with self.subTest(value=value): self.reject_edit(lambda b,t:b['proof'].__setitem__('retiredSessionCount',value))

    def test_CP09_rejection_needs_positive_control_and_exact_password_sqlstate(self):
        for value in ('CONNECTED','28000','ECONNREFUSED','ETIMEDOUT',None):
            with self.subTest(value=value): self.reject_edit(lambda b,t:b['proof'].__setitem__('oldCredentialSqlstate',value))
        self.reject_edit(lambda b,t:b['proof'].__setitem__('oldCredentialPositiveControl',False))

    def test_CP11_15_flags_cannot_be_forged_or_privileged_memberships_hidden(self):
        self.reject_edit(lambda b,t:b['proof'].__setitem__('retiredLoginDisabled',True))
        self.reject_edit(lambda b,t:b['proof'].__setitem__('oldMemberships',['cloudsqlsuperuser']))
        self.reject_edit(lambda b,t:b['proof']['oldRoleAttributes'].__setitem__('createrole','false'))

    def test_CP14_review_hash_approval_implementation_and_freshness_are_mandatory(self):
        changes=[lambda b,t:t.__setitem__('activation_approved',False),
            lambda b,t:t.__setitem__('accepted_implementation','3'*40),
            lambda b,t:b['review'].__setitem__('reviewer','synthetic-author'),
            lambda b,t:b['review'].__setitem__('state','COMMENTED'),
            lambda b,t:b['readback'].__setitem__('observedAt',STAMP(NOW-timedelta(minutes=8))),
            lambda b,t:b['readback'].__setitem__('writesEnabled',True),
            lambda b,t:b['proof'].__setitem__('windowEnd',STAMP(NOW-timedelta(seconds=1))),
            lambda b,t:b['proof'].__setitem__('verifiedAt',STAMP(NOW-timedelta(minutes=20))),
            lambda b,t:b['review'].__setitem__('proofHash','sha256:'+'c'*64)]
        for i, edit in enumerate(changes):
            with self.subTest(case=i): self.reject_edit(edit,repin=False)

    def test_CP15_editing_approved_proof_invalidates_hash(self):
        self.reject_edit(lambda b,t:b['proof']['checks'].__setitem__('backupVerified',False),repin=False)

    def test_migration_profile_must_be_independently_reviewed_not_admin(self):
        for key,value in [('admin',True),('set',False),('privilegedPathReviewed',False),('ownerRole','other')]:
            with self.subTest(key=key): self.reject_edit(lambda b,t:b['proof']['migrationProfile'].__setitem__(key,value))

    def test_parser_rejects_duplicate_keys_and_nonfinite_numbers(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'evidence.json'
            for raw in ('{"review":1,"review":2}','{"value":NaN}'):
                path.write_text(raw,encoding='utf-8')
                with self.assertRaises(ValueError): load_json(path)


if __name__ == '__main__': unittest.main(verbosity=2)
