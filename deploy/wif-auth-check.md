# WIF authentication-only verification

This is a bounded preparation step for Issue #8. It does not replace the DB fence
or the historical-deployer retirement procedure in `lifecycle-release.md`.

## Review and release sequence

1. Review this change in a feature PR into `sprint2-staging`, then a release PR
   into `main`. No Cloud authentication is attempted by the PR checks.
2. The provider currently permits execution SHA
   `2d042455cf4e81793e0ba2103c9ed6572b676a91` only. A new main SHA will therefore
   not authenticate until its workflow has been reviewed and the operator
   explicitly approves that full execution SHA in the provider condition.
   Do not loosen the condition to all main commits to make a run pass.
3. Preserve the image/revision and writes=false state. Freeze deployments and
   complete the historical-deployer permission fence from the runbook before
   executing source-authentication tests. The `gather-deployer-v2` account must
   have no Cloud Run mutation, job execution, registry write, Secret Manager,
   Cloud SQL, or runtime-account impersonation permissions at this stage.
4. With explicit operator approval, allow the repository's reviewed federated
   identity to impersonate **only** `gather-deployer-v2` using
   `roles/iam.workloadIdentityUser` on that account. This is an IAM access change,
   separate from merely having permission to edit policies. Preserve the
   existing restrictive provider condition.
5. After permission propagation, open **Deploy demo -> Run workflow** on the
   reviewed `main` source. Select **verify_wif_only=true**, leave activation and
   both confirmation flags false, and leave image fields empty. This mode uses
   the v2 account explicitly; it does not read `WIF_SERVICE_ACCOUNT` to select
   the test identity. Do not switch the ordinary deployment variable merely
   to perform this positive test.
6. Expect only the `verify-wif` job to run. `test` and `deploy` must be skipped.
   Token generation must actually succeed in the pinned Google authentication
   action. The summary records source SHA, ref, run/attempt and identity without
   token values. No credential file is created and the requested access token
   has a 300-second lifetime and read-only OAuth scope.

This job must not be treated as safe solely because of its name: verify its
reviewed source and the v2 account's effective grants before running it.

## Historical-source negative proof remains separate

Do not replay old Deploy demo runs while the original deployer or other holders
still have resource mutation authority. Follow the permission-fenced historical
test in `lifecycle-release.md`, retaining run/attempt/source SHA, the actual
WIF/impersonation rejection and unchanged image/revision. Checking out an old
commit in this new workflow does not produce an old OIDC execution SHA.

Creating another workflow filename or using a feature-branch execution will also
not satisfy the current provider's exact `workflow_ref` and main restrictions.
The authentication-only job is therefore in the existing deploy workflow.

Only after positive/negative proofs and the rest of the runbook pass should the
operator grant the v2 identity its reviewed deployment permissions. Do not
activate lifecycle, execute migration/seed/reset jobs, or modify the database
as part of this verification.

## Offline checks

```sh
python3 -m pip install PyYAML==6.0.3
python3 deploy/tests/test_wif_workflow.py
```

These checks parse the actual YAML, exercise job routing, and protect the
authentication job's restricted step set. They do not obtain credentials or
prove that the live Google Cloud policy accepts or rejects a source.
