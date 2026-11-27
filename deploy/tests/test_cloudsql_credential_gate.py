"""CP-14: a CP request cannot reuse the legacy boolean-only confirmation."""
import json
import os
import sys
import unittest
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verify_lifecycle_release import verify
from test_credential_proof import fixture


class CredentialGateIntegration(unittest.TestCase):
    def test_CP19_release_context_accepts_matching_proof_and_rejects_different_project(self):
        bundle, trust = fixture(datetime.now(timezone.utc))
        target=bundle['request']
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'synthetic-proof.json'
            path.write_text(json.dumps(bundle),encoding='utf-8')
            env={'ROLLBACK':'true','ACTIVATE_LIFECYCLE':'true',
                'IMAGE_TAG':target['image_sha'],'EXPECTED_IMAGE_DIGEST':target['image_digest'],
                'LIFECYCLE_APPROVED_IMAGES_JSON':json.dumps([{'sha':target['image_sha'],'digest':target['image_digest'],
                    'compatibility':'ACTIVE_V1','evidence':'https://github.com/PhraewaS/event-system/actions/runs/123'}]),
                'LIFECYCLE_CUTOVER_CONFIRMED':'true','LIFECYCLE_DB_FENCE_CONFIRMED':'true',
                'LIFECYCLE_CUTOVER_EVIDENCE':'https://github.com/PhraewaS/event-system/issues/8#issuecomment-123',
                'LIFECYCLE_DB_FENCE_EVIDENCE':'https://github.com/PhraewaS/event-system/issues/8#issuecomment-124',
                'LIFECYCLE_DB_FENCE_METHOD':'CLOUDSQL_CREDENTIAL_RETIREMENT_V1',
                'CP_FENCE_BUNDLE_PATH':str(path),'CP_APPROVED_PROOF_SHA256':trust['approved_hash'],
                'CP_ACCEPTED_IMPLEMENTATION_SHA':trust['accepted_implementation'],'CP_APPROVED_REVIEWER':'synthetic-reviewer',
                'CP_ACTIVATION_APPROVED':'true','PROJECT_ID':target['project'],'REGION':'asia-southeast1',
                'SERVICE_NAME':'cp-fixture','MIGRATE_JOB_NAME':'cp-migrate'}
            with patch.dict(os.environ,env,clear=True):
                verify()
                os.environ['PROJECT_ID']='different-project'
                with self.assertRaises(ValueError):verify()

    def test_cp_method_without_proof_bundle_is_blocked(self):
        sha, digest = '1' * 40, 'sha256:' + 'a' * 64
        env = {
            'ROLLBACK': 'true', 'ACTIVATE_LIFECYCLE': 'true',
            'IMAGE_TAG': sha, 'EXPECTED_IMAGE_DIGEST': digest,
            'LIFECYCLE_APPROVED_IMAGES_JSON': json.dumps([{
                'sha': sha, 'digest': digest, 'compatibility': 'ACTIVE_V1',
                'evidence': 'https://github.com/PhraewaS/event-system/actions/runs/123'}]),
            'LIFECYCLE_CUTOVER_CONFIRMED': 'true',
            'LIFECYCLE_CUTOVER_EVIDENCE': 'https://github.com/PhraewaS/event-system/issues/8#issuecomment-123',
            'LIFECYCLE_DB_FENCE_CONFIRMED': 'true',
            'LIFECYCLE_DB_FENCE_EVIDENCE': 'https://github.com/PhraewaS/event-system/issues/8#issuecomment-124',
            'LIFECYCLE_DB_FENCE_METHOD': 'CLOUDSQL_CREDENTIAL_RETIREMENT_V1',
        }
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises((ValueError, KeyError)):
                verify()


if __name__ == '__main__':
    unittest.main(verbosity=2)
