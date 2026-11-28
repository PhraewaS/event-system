"""Metadata review preparation is usable without fictional completed fence proof."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from inspect_live_release import inspect_target
from test_credential_proof import fixture

class MetadataInspection(unittest.TestCase):
    def test_only_metadata_capability_is_called_and_does_not_authorize_release(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'target.json';path.write_text(json.dumps(fixture()[0]['request']),encoding='utf-8')
            client=Mock();client.__enter__=Mock(return_value=client);client.__exit__=Mock(return_value=False)
            client.cloud_configuration.return_value={'cloudFieldsMatch':True,'releaseActivationAllowed':False}
            result=inspect_target(path,lambda:client)
            self.assertIs(result['releaseActivationAllowed'],False)
            self.assertEqual([c[0] for c in client.method_calls],['cloud_configuration'])

    def test_invalid_target_rejects_before_client_authentication(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'target.json';path.write_text('{}',encoding='utf-8');factory=Mock()
            with self.assertRaises(ValueError):inspect_target(path,factory)
            factory.assert_not_called()

    def test_saved_passed_receipt_is_not_a_target(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'target.json';path.write_text('{"cloudFieldsMatch":true}',encoding='utf-8')
            with self.assertRaises(ValueError):inspect_target(path,Mock())

if __name__=='__main__':unittest.main(verbosity=2)
