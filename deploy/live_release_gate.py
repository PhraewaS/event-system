"""Operator-only CP release coordinator. Imports never authenticate or mutate.

Live observations are collected through an in-process client, never loaded from
a supplied 'passed' receipt. Default execution is check-only. The offline proof
parser retains its original scope and is not promoted into a cloud verifier.
"""
import json
import os
import re
import sys
from datetime import datetime, timezone
from verify_credential_fence import METHOD, instant, load_json, require, verify_bundle


def evaluate_live_release(bundle, trust, client, *, execute=False, clock=None):
    require(type(execute) is bool, 'Invalid execution mode.')
    clock = clock or (lambda: datetime.now(timezone.utc))
    proof_trust = {k: trust[k] for k in ('approved_hash','accepted_implementation','reviewers','activation_approved')}
    accepted_gate = trust.get('accepted_gate_sha','')
    config_hash = trust.get('approved_config_hash','')
    require(re.fullmatch(r'[0-9a-f]{40}', accepted_gate or ''), 'Accepted gate source required.')
    require(re.fullmatch(r'sha256:[0-9a-f]{64}', config_hash or ''), 'Independent full-configuration approval required.')
    verify_bundle(bundle, **proof_trust, now=clock())
    target = bundle['request']

    def validate_source():
        source=client.execution_source()
        require(source == {'sha':accepted_gate,'clean':True}, 'Dirty or unaccepted execution source.')

    def observe():
        verify_bundle(bundle, **proof_trust, now=clock())
        validate_source()
        cloud=client.cloud_configuration(target)
        require(cloud.get('cloudFieldsMatch') is True and cloud.get('readOnly') is True and
                cloud.get('releaseActivationAllowed') is False, 'Authoritative cloud observation failed.')
        require(cloud.get('configReviewHash') == config_hash, 'Full cloud configuration differs from approved content.')
        observed=instant(cloud.get('observedAt'))
        require(instant(bundle['review']['reviewedAt']) <= observed <= clock() and
                (clock()-observed).total_seconds() <= 60, 'Live cloud observation stale or precedes review.')
        facts=cloud.get('observed',{})
        require(all(isinstance(facts.get(k),str) and facts[k] for k in
                    ('serviceEtag','serviceUid','jobEtag','jobUid','servingRevision')), 'Cloud identity/concurrency facts missing.')
        require(client.image_digest(target) == target['image_digest'], 'SHA tag/digest mapping changed.')
        sql=client.sql_configuration(target)
        require(sql.get('instance') == target['instance_connection_name'] and sql.get('database') == target['database']
                and sql.get('roles') == target['roles'], 'Live SQL instance/database/role OID binding differs.')
        require(sql.get('replacementProfilesVerified') is True, 'Replacement SQL authority/isolation unverified.')
        require(type(sql.get('oldSessionCount')) is int and sql['oldSessionCount'] == 0, 'Old SQL sessions remain or are unknown.')
        require(sql.get('oldRoleAttributes') == bundle['proof']['oldRoleAttributes'] and
                sql.get('oldMemberships') == bundle['proof']['oldMemberships'], 'Old SQL attributes/memberships changed.')
        profile=bundle['proof']['migrationProfile']
        require(all(sql.get('migrationProfile',{}).get(k) == profile[k] for k in ('ownerRole','set','admin','inherit')),
                'Controlled migration profile changed.')
        validate_source()
        verify_bundle(bundle, **proof_trust, now=clock())
        return cloud

    initial=observe()
    result={'decision':'live_preflight_verified','method':METHOD,'proofHash':trust['approved_hash'],
            'liveConfigurationVerified':True,'activationExecuted':False,'checkOnly':not execute,
            'acceptedGateSha':accepted_gate,'approvedConfigurationHash':config_hash,
            'scope':'LIVE_RELEASE_PREFLIGHT_WITH_REVIEWED_HISTORICAL_ATTESTATIONS'}
    if not execute:
        return result
    # Unlike a saved preflight receipt, this observation cannot be replayed into
    # release.sh. The approved execution holds the DB write barrier and re-reads.
    with client.write_freeze(target) as enforced:
        require(enforced is True, 'Enforceable database write barrier required.')
        final=observe()
        require(final['observed'] == initial['observed'] and final['configReviewHash'] == initial['configReviewHash'],
                'Configuration changed between preflight and execution.')
        try:
            outcome=client.activate(target,final)
            require(outcome.get('verified') is True and isinstance(outcome.get('revision'),str)
                    and outcome['revision'].startswith(target['service']+'/revisions/'), 'Activation result unknown or mismatched.')
        except Exception:
            # Never automatically release our data barrier merely because a
            # PATCH timed out or a postcheck failed. The real client waits under
            # the held locks for independently observable compatible gate=false.
            # It retries reads only; a manual recovery remains the operator's job.
            if getattr(client,'mutation_may_have_started',False):
                client.wait_until_disabled(target)
            raise
    return {**result,'decision':'activation_verified','activationExecuted':True,'revision':outcome['revision']}


def configuration_from_environment(env):
    require(env.get('LIFECYCLE_DB_FENCE_METHOD') == METHOD, 'Explicit CP method required; no legacy fallback.')
    require(env.get('ROLLBACK') == 'true' and env.get('ACTIVATE_LIFECYCLE') == 'true',
            'CP supports only explicit reuse of an already reviewed state-aware candidate.')
    check=env.get('CP_CHECK_ONLY','true')
    execute=env.get('CP_EXECUTE_APPROVED_ACTIVATION','false')
    require(check in ('true','false') and execute in ('true','false'), 'Invalid CP execution flags.')
    require((check,execute) in (('true','false'),('false','true')), 'Choose check-only or separately approved execution.')
    bundle=load_json(env['CP_FENCE_BUNDLE_PATH'])
    trust={'approved_hash':env['CP_APPROVED_PROOF_SHA256'],
           'accepted_implementation':env['CP_ACCEPTED_IMPLEMENTATION_SHA'],
           'reviewers':[env['CP_APPROVED_REVIEWER']],
           'activation_approved':env.get('CP_ACTIVATION_APPROVED') == 'true',
           'accepted_gate_sha':env['CP_ACCEPTED_RELEASE_GATE_SHA'],
           'approved_config_hash':env['CP_APPROVED_CONFIG_SHA256']}
    verify_bundle(bundle, **{k:v for k,v in trust.items() if k not in ('accepted_gate_sha','approved_config_hash')})
    t=bundle['request']
    region=t['instance_connection_name'].split(':')[1]
    require(env.get('PROJECT_ID') == t['project'] and env.get('REGION') == region and
            env.get('SERVICE_NAME','gather') == t['service'].split('/')[-1] and
            env.get('MIGRATE_JOB_NAME','gather-migrate') == t['job'].split('/')[-1] and
            env.get('IMAGE_TAG') == t['image_sha'] and env.get('EXPECTED_IMAGE_DIGEST') == t['image_digest'],
            'Release environment differs from approved request.')
    return bundle,trust,execute == 'true'


def main():
    # Validate proof/mode/request before constructing any authenticated client.
    bundle,trust,execute=configuration_from_environment(os.environ)
    from live_release_client import GoogleLiveReleaseClient
    with GoogleLiveReleaseClient() as client:
        result=evaluate_live_release(bundle,trust,client,execute=execute)
    print(json.dumps(result,sort_keys=True))


if __name__=='__main__':
    try:main()
    except Exception:
        # No raw HTTP, SQL, subprocess or private payload exceptions in CI logs.
        print('CP live release blocked or outcome unverified; inspect the private operator context. No automatic retry.',file=sys.stderr)
        sys.exit(1)
