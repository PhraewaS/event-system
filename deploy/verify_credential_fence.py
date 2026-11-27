"""Offline CP-v1 evidence validator. Never authenticates, mutates or deploys.

The approved hash/implementation/reviewer come from the operator's trusted
approval channel, not from the submitted proof itself. Cloud/SQL facts remain
operator attestations; this module does not independently inspect private GCP.
"""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

METHOD = 'CLOUDSQL_CREDENTIAL_RETIREMENT_V1'
CHECKS = {
    'contractAccepted', 'changeApproved', 'freezeConfirmed', 'backupVerified',
    'inventoryComplete', 'noUncontrolledPaths', 'oldRoutesDisabled',
    'replacementSecretIsolationVerified', 'managementOperationsSucceeded',
    'membershipReadbackVerified', 'inFlightWriteAborted', 'baselinePreserved',
    'replacementConnectionReady', 'normalJourneyPassed', 'accessRestrictionsPassed',
    'migrationProfileVerified',
}
TARGET_KEYS = {
    'project', 'instance_connection_name', 'database', 'roles', 'service', 'job',
    'runtime_service_account', 'migrator_service_account', 'pre_activation_revision',
    'image_sha', 'image_digest', 'runtime_secret_version', 'migrator_secret_version',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def canonical_hash(proof):
    raw = json.dumps(proof, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
    return 'sha256:' + hashlib.sha256(raw.encode('utf-8')).hexdigest()


def load_json(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'Duplicate JSON key.')
            result[key] = value
        return result
    require(Path(path).stat().st_size <= 262144, 'Evidence document too large.')
    return json.loads(Path(path).read_text(encoding='utf-8'), object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Non-finite JSON number.')))


def instant(value):
    require(isinstance(value, str), 'Missing timestamp.')
    value = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(value.tzinfo is not None, 'Timestamp requires timezone.')
    return value.astimezone(timezone.utc)


def validate_target(target):
    require(isinstance(target, dict) and set(target) == TARGET_KEYS, 'Incomplete/unknown target fields.')
    for key in TARGET_KEYS - {'roles'}:
        require(isinstance(target[key], str) and bool(target[key]), 'Invalid target value.')
    project = target['project']
    require(re.fullmatch(r'[a-z][a-z0-9-]{4,61}[a-z0-9]', project), 'Invalid project.')
    parts = target['instance_connection_name'].split(':')
    require(len(parts) == 3 and parts[0] == project and all(parts), 'Invalid instance binding.')
    region = parts[1]
    prefix = f'projects/{project}/locations/{region}/'
    require(re.fullmatch(re.escape(prefix) + r'services/[a-z][a-z0-9-]*', target['service']), 'Invalid service binding.')
    require(re.fullmatch(re.escape(prefix) + r'jobs/[a-z][a-z0-9-]*', target['job']), 'Invalid job binding.')
    require(re.fullmatch(r'[0-9a-f]{40}', target['image_sha']), 'Invalid image SHA.')
    require(re.fullmatch(r'sha256:[0-9a-f]{64}', target['image_digest']), 'Invalid image digest.')
    require(re.fullmatch(r'[a-z_][a-z0-9_]{0,62}', target['database']), 'Invalid database.')
    roles = target['roles']
    require(isinstance(roles, dict) and set(roles) == {'old', 'runtime', 'migrator'}, 'Incomplete role binding.')
    for role in roles.values():
        require(isinstance(role, dict) and set(role) == {'name', 'oid'}, 'Incomplete role identity.')
        require(isinstance(role['name'], str) and re.fullmatch(r'[a-z_][a-z0-9_]{0,62}', role['name']), 'Invalid role name.')
        require(type(role['oid']) is int and role['oid'] > 0, 'Invalid role OID.')
    require(len({r['name'] for r in roles.values()}) == 3 and len({r['oid'] for r in roles.values()}) == 3,
            'Old/replacement roles must be distinct.')
    for key in ('runtime_service_account', 'migrator_service_account'):
        require(re.fullmatch(r'[a-z][a-z0-9-]*@' + re.escape(project) + r'\.iam\.gserviceaccount\.com', target[key]), 'Invalid service identity.')
    require(target['runtime_service_account'] != target['migrator_service_account'], 'Shared runtime/migration identity.')
    for key in ('runtime_secret_version', 'migrator_secret_version'):
        require(re.fullmatch(re.escape(f'projects/{project}/secrets/') + r'[A-Za-z0-9_-]+/versions/[1-9][0-9]*', target[key]),
                'Secret requires full resource and numeric version.')
    require(target['runtime_secret_version'].split('/versions/')[0] != target['migrator_secret_version'].split('/versions/')[0],
            'Runtime and migrator secrets must be isolated.')


def verify_bundle(bundle, *, approved_hash, accepted_implementation, reviewers,
                  activation_approved, now=None):
    require(activation_approved is True, 'Explicit activation decision approval required.')
    require(isinstance(bundle, dict) and set(bundle) == {'proof', 'review', 'readback', 'request'}, 'Invalid evidence envelope.')
    proof, review, readback, request = (bundle[k] for k in ('proof', 'review', 'readback', 'request'))
    require(isinstance(proof, dict) and set(proof) == {
        'method', 'author', 'operator', 'implementationSha', 'verifiedAt', 'windowStart', 'windowEnd',
        'target', 'checks', 'oldCredentialPositiveControl', 'oldCredentialSqlstate',
        'retiredSessionCount', 'oldRoleAttributes', 'oldMemberships', 'migrationProfile'}, 'Invalid proof fields.')
    require(proof['method'] == METHOD, 'Unsupported fence method.')
    require(re.fullmatch(r'sha256:[0-9a-f]{64}', approved_hash or ''), 'Approved proof hash required.')
    require(canonical_hash(proof) == approved_hash, 'Proof hash mismatch.')
    require(re.fullmatch(r'[0-9a-f]{40}', accepted_implementation or '') and proof['implementationSha'] == accepted_implementation,
            'Implementation is not the accepted version.')
    require(isinstance(proof['author'], str) and bool(proof['author']), 'Proof author required.')
    require(isinstance(review, dict) and set(review) == {'reviewer', 'state', 'proofHash', 'reviewedAt'}, 'Invalid review.')
    require(review['reviewer'] in reviewers and review['reviewer'] != proof['author'] and review['state'] == 'APPROVED',
            'Independent approved proof review required.')
    require(review['proofHash'] == approved_hash, 'Review does not bind approved proof.')
    clock = now or datetime.now(timezone.utc)
    start, end, verified, reviewed = (instant(proof['windowStart']), instant(proof['windowEnd']),
                                    instant(proof['verifiedAt']), instant(review['reviewedAt']))
    require(start <= verified <= reviewed <= clock <= end and end > start, 'Invalid/expired approval window.')
    require((clock - verified).total_seconds() <= 900, 'Fence proof is stale.')
    checks = proof['checks']
    require(isinstance(checks, dict) and set(checks) == CHECKS and all(v is True for v in checks.values()),
            'Incomplete/failed/unknown fence prerequisites.')
    target = proof['target']
    validate_target(target)
    require(isinstance(proof['operator'], str) and proof['operator'] not in {r['name'] for r in target['roles'].values()}
            and bool(proof['operator']), 'Independent SQL operator required.')
    require(proof['oldCredentialPositiveControl'] is True and proof['oldCredentialSqlstate'] == '28P01',
            'Explicit password rejection with valid before-control required; not NOLOGIN/network failure.')
    require(type(proof['retiredSessionCount']) is int and proof['retiredSessionCount'] == 0, 'Old sessions remain or unknown.')
    flags = proof['oldRoleAttributes']
    require(isinstance(flags, dict) and set(flags) == {'login', 'createrole', 'createdb'} and all(type(v) is bool for v in flags.values()),
            'Actual role flags must be reported.')
    require(isinstance(proof['oldMemberships'], list) and all(isinstance(r, str) for r in proof['oldMemberships'])
            and 'cloudsqlsuperuser' not in proof['oldMemberships'], 'Privileged memberships remain.')
    profile = proof['migrationProfile']
    require(isinstance(profile, dict) and set(profile) == {'ownerRole', 'set', 'admin', 'inherit', 'privilegedPathReviewed'}, 'Invalid migration profile.')
    require(profile['ownerRole'] == target['roles']['old']['name'] and profile['set'] is True and profile['admin'] is False
            and type(profile['inherit']) is bool and profile['privilegedPathReviewed'] is True, 'Migration owner authority unverified.')
    require(isinstance(readback, dict) and set(readback) == {'observedAt', 'writesEnabled', 'target'}, 'Fresh readback required.')
    observed = instant(readback['observedAt'])
    require(reviewed <= observed <= clock and (clock - observed).total_seconds() <= 300 and readback['writesEnabled'] is False,
            'Readback stale/unknown or lifecycle already enabled.')
    validate_target(readback['target'])
    validate_target(request)
    require(target == readback['target'] == request, 'Instance/database/role/revision/image/identity/secret binding mismatch.')
    return {'decision': 'allow_activation', 'method': METHOD, 'proofHash': approved_hash,
            'cloudOperations': 0, 'retiredLoginDisabled': not flags['login']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Validate CP evidence only; never deploy or enable lifecycle.')
    parser.add_argument('--bundle', required=True)
    parser.add_argument('--approved-proof-sha256', required=True)
    parser.add_argument('--accepted-implementation-sha', required=True)
    parser.add_argument('--reviewer', action='append', required=True)
    parser.add_argument('--approve-activation-decision', action='store_true')
    args = parser.parse_args()
    try:
        print(json.dumps(verify_bundle(load_json(args.bundle), approved_hash=args.approved_proof_sha256,
              accepted_implementation=args.accepted_implementation_sha, reviewers=args.reviewer,
              activation_approved=args.approve_activation_decision)))
    except (ValueError, TypeError, KeyError, OSError):
        parser.exit(1, 'CP proof rejected; inspect evidence privately. No cloud operations performed.\n')
