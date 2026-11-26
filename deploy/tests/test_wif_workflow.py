"""Offline routing and isolation checks. No OIDC token, GCP, or database access.

Run after installing PyYAML==6.0.3 into the test environment.
"""
import re
import os
import shutil
import subprocess
import unittest
from pathlib import Path
from types import SimpleNamespace as NS

import yaml

ROOT = Path(__file__).resolve().parents[2]


def predicate(expression, *, event, ref='refs/heads/main', verify=False,
              test_result='skipped', cancelled=False):
    """Evaluate only the logical GitHub-expression subset used in these job guards."""
    source = expression.strip().removeprefix('${{').removesuffix('}}').strip()
    source = ' '.join(source.split())
    source = source.replace('&&', ' and ').replace('||', ' or ')
    source = re.sub(r'!(?!=)', 'not ', source)
    return bool(eval(source, {'__builtins__': {}}, {
        'github': NS(event_name=event, ref=ref),
        'inputs': NS(verify_wif_only=verify),
        'needs': NS(test=NS(result=test_result)),
        'cancelled': lambda: cancelled,
    }))


class WifWorkflowIsolation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # BaseLoader preserves the YAML key "on" and treats scalar values as strings.
        cls.workflow = yaml.load((ROOT / '.github/workflows/deploy.yml').read_text(),
                                 Loader=yaml.BaseLoader)

    def test_manual_verify_never_routes_to_deploy(self):
        for test_result in ('success', 'skipped', 'failure'):
            with self.subTest(test_result=test_result):
                self.assertFalse(predicate(self.workflow['jobs']['deploy']['if'],
                    event='workflow_dispatch', verify=True, test_result=test_result))

    def test_existing_release_routes_preserved(self):
        guard = self.workflow['jobs']['deploy']['if']
        self.assertTrue(predicate(guard, event='push', test_result='success'))
        self.assertFalse(predicate(guard, event='push', test_result='failure'))
        self.assertTrue(predicate(guard, event='workflow_dispatch'))
        self.assertFalse(predicate(guard, event='workflow_dispatch', ref='refs/heads/sprint2-staging'))
        self.assertFalse(predicate(guard, event='workflow_dispatch', cancelled=True))

    def test_verify_job_only_runs_for_explicit_main_dispatch(self):
        guard = self.workflow['jobs']['verify-wif']['if']
        self.assertTrue(predicate(guard, event='workflow_dispatch', verify=True))
        for values in ({'event': 'push', 'verify': True},
                       {'event': 'workflow_dispatch', 'verify': False},
                       {'event': 'workflow_dispatch', 'verify': True,
                        'ref': 'refs/heads/sprint2-staging'}):
            with self.subTest(values=values):
                self.assertFalse(predicate(guard, **values))

    def test_verify_job_has_only_validation_authentication_and_summary(self):
        job = self.workflow['jobs']['verify-wif']
        self.assertNotIn('needs', job)
        self.assertEqual(job['environment'], 'demo')
        self.assertEqual(job['permissions'], {'contents': 'read', 'id-token': 'write'})
        self.assertEqual(len(job['steps']), 3)
        auth_steps = [step for step in job['steps'] if 'uses' in step]
        self.assertEqual(len(auth_steps), 1)
        self.assertEqual(auth_steps[0]['uses'],
            'google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093')
        settings = auth_steps[0]['with']
        self.assertEqual(settings['service_account'],
            'gather-deployer-v2@cpe334-omega-3.iam.gserviceaccount.com')
        self.assertEqual(settings['token_format'], 'access_token')
        self.assertEqual(settings['access_token_lifetime'], '300s')
        self.assertEqual(settings['create_credentials_file'], 'false')
        self.assertEqual(settings['export_environment_variables'], 'false')
        self.assertEqual(settings['access_token_scopes'],
            'https://www.googleapis.com/auth/cloud-platform.read-only')
        scripts = '\n'.join(step.get('run', '') for step in job['steps'])
        self.assertNotRegex(scripts, r'(?i)gcloud|docker|release\.sh|migrat|seed|curl|wget')
        self.assertNotRegex(scripts, r'(?i)outputs\.(access_token|auth_token|id_token)|ACTIONS_ID_TOKEN')
        self.assertIn('REQUESTED_ACTIVATION', job['steps'][0]['env'])
        self.assertIn('exit 1', job['steps'][0]['run'])

    def test_dispatch_does_not_require_image_for_authentication(self):
        inputs = self.workflow['on']['workflow_dispatch']['inputs']
        self.assertEqual(inputs['verify_wif_only']['default'], 'false')
        self.assertEqual(inputs['verify_wif_only']['type'], 'boolean')
        for field in ('image_tag', 'image_digest'):
            self.assertEqual(inputs[field]['required'], 'false')
        # Normal deploy must still validate the full SHA and digest before auth.
        steps = self.workflow['jobs']['deploy']['steps']
        validation_index = next(i for i, step in enumerate(steps)
                                if step.get('name') == 'Verify deployment settings and checked-out source')
        auth_index = next(i for i, step in enumerate(steps)
                          if step.get('name') == 'Authenticate to Google Cloud with WIF')
        self.assertLess(validation_index, auth_index)
        self.assertIn('Manual deploy requires the approved SHA-256 image digest.', steps[validation_index]['run'])
        self.assertIn('Image tag must be a full commit SHA.', steps[validation_index]['run'])

    def test_actual_shell_guard_rejects_mixed_activation_requests(self):
        script = self.workflow['jobs']['verify-wif']['steps'][0]['run']
        # The Windows Store WSL alias does not forward arbitrary Windows env vars.
        git_bash = Path('C:/Program Files/Git/bin/bash.exe')
        bash = str(git_bash) if os.name == 'nt' and git_bash.exists() else shutil.which('bash')
        if not bash:
            self.fail('Bash is required to execute the activation guard')
        fields = ('REQUESTED_ACTIVATION', 'CUTOVER_CONFIRMED', 'DB_FENCE_CONFIRMED')
        for active in (None, *fields):
            with self.subTest(active=active):
                env = {**os.environ, **{name: 'true' if name == active else 'false'
                                       for name in fields}}
                result = subprocess.run([bash, '-c', script], env=env,
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, 0 if active is None else 1,
                                 result.stderr)


if __name__ == '__main__':
    unittest.main(verbosity=2)
