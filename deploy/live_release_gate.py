"""Baseline composition seam: preserve the existing offline-only decision."""
from verify_credential_fence import verify_bundle

def evaluate_live_release(bundle, trust, client, *, execute=False, clock=None):
    offline = {k:v for k,v in trust.items() if k not in ('accepted_gate_sha','approved_config_hash')}
    return verify_bundle(bundle, **offline)
