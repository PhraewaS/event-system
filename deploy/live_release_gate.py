"""Baseline composition seam: preserve the existing offline-only decision."""
from verify_credential_fence import verify_bundle

def evaluate_live_release(bundle, trust, client, *, execute=False, clock=None):
    return verify_bundle(bundle, **trust)
