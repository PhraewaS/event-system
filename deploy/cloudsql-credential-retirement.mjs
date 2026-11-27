// Operator library only. Importing this module performs no I/O. No CLI/auto credentials.
import {createHash} from 'node:crypto';

const gates = ['contractAccepted','changeApproved','freezeConfirmed','backupVerified','lifecycleWritesDisabled',
  'inventoryComplete','noUncontrolledPaths','oldRoutesDisabled','replacementSecretIsolationVerified',
  'migrationProfileVerified'];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = stage => { throw new Error(`Credential fence stopped at ${stage}; keep lifecycle writes false.`); };

export async function retireCredentials({authorization, expected, management, database,
  clock = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 10000}) {
  const authorize = () => {
    const now = clock();
    if (!authorization || gates.some(k => authorization[k] !== true) ||
        !Number.isFinite(Date.parse(authorization.windowStart)) || !Number.isFinite(Date.parse(authorization.windowEnd)) ||
        now < Date.parse(authorization.windowStart) || now > Date.parse(authorization.windowEnd)) fail('authorization');
  };
  authorize();
  if (!expected?.project || !expected?.instance || management?.resource?.project !== expected.project ||
      management?.resource?.instance !== expected.instance) fail('management target binding');
  if (!expected || new Set([expected.oldRole,expected.runtimeRole,expected.migratorRole,expected.operatorRole]).size !== 4 ||
      [expected.oldRole,expected.runtimeRole,expected.migratorRole,expected.operatorRole].some(r => !/^[a-z_][a-z0-9_]{0,62}$/.test(r)) ||
      !Array.isArray(expected.finalMemberships) || expected.finalMemberships.includes('cloudsqlsuperuser')) fail('role inventory');
  let stage = 'preflight';
  try {
    // Adapters inspect actual DB identities/profile. Their output is not a claim of GCP instance provenance.
    const before = await database.inspect(expected);
    if (before.database !== expected.database || before.operatorRole !== expected.operatorRole ||
        before.oldRole !== expected.oldRole || before.runtimeRole !== expected.runtimeRole ||
        before.migratorRole !== expected.migratorRole || before.profileVerified !== true) fail(stage);
    stage = 'old credential positive control';
    if (await database.oldCredentialWorks() !== true) fail(stage);
    const baseline = await database.snapshot();
    authorize(); stage = 'password rotation';
    const rotation = await management.rotatePassword(expected.oldRole);
    if (rotation?.status !== 'DONE' || rotation.error) fail(stage);
    authorize(); stage = 'membership replacement';
    const membership = await management.replaceMemberships(expected.oldRole, expected.finalMemberships);
    if (membership?.status !== 'DONE' || membership.error) fail(stage);
    stage = 'membership readback';
    const after = await database.inspect(expected);
    if (after.profileVerified !== true || JSON.stringify([...after.oldMemberships].sort()) !== JSON.stringify([...expected.finalMemberships].sort())) fail(stage);
    authorize(); stage = 'session termination';
    await database.terminateOldSessions();
    const until = clock() + timeoutMs;
    let sessions;
    do {
      authorize();
      sessions = await database.oldSessionCount();
      if (!Number.isInteger(sessions) || sessions < 0) fail('session visibility');
      if (sessions === 0) break;
      if (clock() >= until) fail(stage);
      await sleep(25);
    } while (true);
    stage = 'old credential rejection';
    if (await database.oldCredentialSqlstate() !== '28P01') fail(stage);
    stage = 'replacement readiness';
    if (await database.replacementReady() !== true) fail(stage);
    stage = 'data preservation';
    if (hash(baseline) !== hash(await database.snapshot())) fail(stage);
    return {method:'CLOUDSQL_CREDENTIAL_RETIREMENT_V1', status:'FACTS_ONLY_REQUIRES_PROOF_REVIEW',
      verifiedAt:new Date(clock()).toISOString(), database:expected.database,
      retiredRole:expected.oldRole, oldCredentialPositiveControl:true, oldCredentialSqlstate:'28P01',
      retiredSessionCount:sessions, oldRoleAttributes:after.oldRoleAttributes,
      retiredLoginDisabled:after.oldRoleAttributes.login === false,
      oldMemberships:after.oldMemberships, replacementConnectionReady:true, baselinePreserved:true,
      managementOperations:[rotation.name,membership.name].filter(Boolean), lifecycleEnabled:false};
  } catch {
    // Never echo API payloads, URLs, passwords or raw SQL errors to evidence.
    fail(stage);
  }
}

/** Explicitly injected bearer-token provider + password provider; no gcloud/env discovery. */
export function cloudSqlUserManagement({project, instance, tokenProvider, passwordProvider,
  fetchImpl = globalThis.fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), maxPolls = 60}) {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) || !/^[a-z][a-z0-9-]*$/.test(instance)) throw new Error('Invalid Cloud SQL resource.');
  const root = `https://sqladmin.googleapis.com/v1/projects/${project}`;
  const call = async (url, method, body) => {
    const response = await fetchImpl(url, {method, redirect:'error', headers:{Authorization:`Bearer ${await tokenProvider()}`,
      'Content-Type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('Cloud SQL management request failed.');
    return response.json();
  };
  const wait = async operation => {
    if (!operation || !/^[a-zA-Z0-9_-]+$/.test(operation.name ?? '')) throw new Error('Invalid operation receipt.');
    for (let attempt=0; attempt<maxPolls; attempt++) {
      if (operation.error) throw new Error('Cloud SQL operation failed.');
      if (operation.status === 'DONE') return {name:operation.name,status:'DONE'};
      await sleep(1000);
      operation = await call(`${root}/operations/${operation.name}`, 'GET');
    }
    throw new Error('Cloud SQL operation timed out.');
  };
  const userUrl = role => {
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error('Invalid role.');
    return `${root}/instances/${instance}/users?name=${encodeURIComponent(role)}`;
  };
  return {
    resource:Object.freeze({project,instance}),
    async rotatePassword(role) {
      // The caller supplies a newly generated controlled password privately, never the retired one.
      const password = await passwordProvider();
      if (typeof password !== 'string' || password.length < 32) throw new Error('Replacement control password required.');
      return wait(await call(userUrl(role), 'PUT', {name:role,type:'BUILT_IN',password}));
    },
    async replaceMemberships(role, roles) {
      if (!Array.isArray(roles) || roles.some(r => !/^[a-z_][a-z0-9_]{0,62}$/.test(r))) throw new Error('Invalid membership inventory.');
      const query = new URL(userUrl(role));
      query.searchParams.set('revokeExistingRoles','true');
      for (const member of roles) query.searchParams.append('databaseRoles',member);
      return wait(await call(query.href, 'PUT', {name:role,type:'BUILT_IN'}));
    },
  };
}
