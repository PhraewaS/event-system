"""Collect metadata/config-review hash for independent review; never activate."""
import argparse
import json
import sys
from verify_credential_fence import load_json,validate_target

def inspect_target(path,client_factory):
    expected=load_json(path)
    validate_target(expected)
    with client_factory() as client:
        # Only the metadata reader; no SQL secret payload, barrier or mutation.
        return client.cloud_configuration(expected)

def main():
    parser=argparse.ArgumentParser(description='Read cloud metadata/config hash only. Never deploy, lock, read DB passwords or activate.')
    parser.add_argument('--target',required=True)
    args=parser.parse_args()
    from live_release_client import GoogleLiveReleaseClient
    report=inspect_target(args.target,GoogleLiveReleaseClient)
    print(json.dumps(report,sort_keys=True))
    return 0 if report.get('cloudFieldsMatch') is True else 1

if __name__=='__main__':
    try:sys.exit(main())
    except Exception:
        print('Live metadata inspection unavailable; no mutation performed.',file=sys.stderr)
        sys.exit(1)
