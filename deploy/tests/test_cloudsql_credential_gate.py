"""CP-14: a CP request cannot reuse the legacy boolean-only confirmation."""
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verify_lifecycle_release import verify


class CredentialGateIntegration(unittest.TestCase):
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
