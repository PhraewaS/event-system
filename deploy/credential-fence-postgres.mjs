// Explicit operator-owned connection profiles only; no CLI, logging or automatic role changes.
import pg from 'pg';
const {Client} = pg;
const identifier = role => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error('Invalid role identifier.');
  return `"${role}"`;
};

export function postgresFenceInspection({adminUrl, oldUrl, newUrl, migratorUrl, ownerRole}) {
  const profiles = [adminUrl,oldUrl,newUrl,migratorUrl];
  // Compare driver's effective host/port/database, including URL query overrides.
  const parameters=profiles.map(connectionString=>new Client({connectionString}).connectionParameters);
  if(parameters.some(p=>p.host!==parameters[0].host || p.port!==parameters[0].port || p.database!==parameters[0].database))
    throw new Error('Same effective database endpoint required.');
  return inspection({profiles,usernames:parameters.map(p=>p.user),ownerRole,
    withClient:(connectionString,fn)=>withPgClient({connectionString},fn),boundInstance:null});
}

/** Caller supplies an official Google Cloud SQL Connector; no ambient auth or new dependency.
 * Every SQL connection is built from getOptions(fixed instanceConnectionName),
 * never a caller URL/host/stream override. Test doubles must remain test-only.
 */
export function cloudSqlConnectorInspection({connector,instanceConnectionName,profiles,ownerRole}) {
  if(typeof connector?.getOptions!=='function' || !/^[a-z][a-z0-9-]*:[a-z0-9-]+:[a-z][a-z0-9-]*$/.test(instanceConnectionName))
    throw new Error('Explicit instance-bound Cloud SQL Connector required.');
  if(!profiles || Object.keys(profiles).sort().join(',')!=='admin,migrator,old,runtime')throw new Error('Four private SQL profiles required.');
  const ordered=['admin','old','runtime','migrator'].map(name=>{
    const p=profiles[name];
    if(!p || Object.keys(p).sort().join(',')!=='database,password,user' ||
        ['database','password','user'].some(k=>typeof p[k]!=='string'||!p[k]))throw new Error('Profile host/URL/options overrides prohibited.');
    return Object.freeze({...p});
  });
  if(ordered.some(p=>p.database!==ordered[0].database))throw new Error('Same database required.');
  return inspection({profiles:ordered,usernames:ordered.map(p=>p.user),ownerRole,boundInstance:instanceConnectionName,
    withClient:async(profile,fn)=>withPgClient({...await connector.getOptions({instanceConnectionName}),...profile},fn)});
}

async function withPgClient(config,fn){
  const client=new Client({...config,connectionTimeoutMillis:5000,statement_timeout:10000});
  client.on('error',()=>{});
  try{await client.connect();return await fn(client);}finally{await client.end().catch(()=>{});}
}

function inspection({profiles,usernames,ownerRole,withClient,boundInstance}) {
  const [adminUrl,oldUrl,newUrl,migratorUrl]=profiles;
  const urls=usernames.map(username=>({username}));
  const owner=identifier(ownerRole);
  return {
    // TCP/proxy URLs prove no Cloud SQL instance identity, even if DB/roles match.
    async verifyInstance(connectionName){return boundInstance!==null && boundInstance===connectionName;},
    async sessionTerminationAuthority(expected){
      return withClient(adminUrl,async admin=>{
        const result=await admin.query(`SELECT session_user AS login,current_user AS effective,
          op.rolsuper AS operator_super,target.rolsuper AS target_super,
          has_function_privilege(current_user,'pg_catalog.pg_terminate_backend(integer,bigint)','EXECUTE') AS can_execute,
          pg_has_role(current_user,target.oid,'USAGE') AS target_privileges,
          pg_has_role(current_user,'pg_signal_backend','USAGE') AS signal_privileges
          FROM pg_roles op CROSS JOIN pg_roles target WHERE op.rolname=current_user AND target.rolname=$1`,[expected.oldRole]);
        const r=result.rows[0];
        return Boolean(r && r.login===expected.operatorRole && r.effective===r.login && r.can_execute &&
          (r.operator_super || (!r.target_super && (r.target_privileges || r.signal_privileges))));
      });
    },
    async inspect(expected) {
      return withClient(adminUrl, async admin => {
        const identity = (await admin.query('SELECT session_user AS role,current_database() AS db')).rows[0];
        const roleNames = [expected.oldRole,expected.runtimeRole,expected.migratorRole];
        const rows = (await admin.query('SELECT oid,rolname,rolcanlogin,rolsuper,rolreplication,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=ANY($1)',[roleNames])).rows;
        const old = rows.find(r=>r.rolname === expected.oldRole);
        const fresh = rows.find(r=>r.rolname === expected.runtimeRole);
        const migrator = rows.find(r=>r.rolname === expected.migratorRole);
        const memberships = (await admin.query(`SELECT parent.rolname AS parent,child.rolname AS child,
          m.admin_option,m.set_option,m.inherit_option FROM pg_auth_members m
          JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles child ON child.oid=m.member
          `)).rows;
        const reachable = (name, setOnly=false, stopAt=null) => {
          const found=new Set([name]);let size;
          do{size=found.size;for(const edge of memberships)if(edge.child!==stopAt&&found.has(edge.child)&&(!setOnly||edge.set_option))found.add(edge.parent);}while(size!==found.size);
          return found;
        };
        const migratorSet=reachable(expected.migratorRole,true);
        const indirectAdmin=memberships.some(m=>m.parent===expected.oldRole && m.admin_option && migratorSet.has(m.child));
        const edge = memberships.filter(m=>m.child===expected.migratorRole && m.parent===expected.oldRole);
        const inheritedRuntime = (await admin.query('SELECT pg_has_role($1,$2,\'MEMBER\') AS member', [expected.runtimeRole,expected.oldRole])).rows[0].member;
        const runtimeCreate = (await admin.query("SELECT has_schema_privilege($1,'public','CREATE') AS allowed",[expected.runtimeRole])).rows[0].allowed;
        let actualMigrator;
        await withClient(migratorUrl, async c => {
          actualMigrator = (await c.query('SELECT session_user AS role')).rows[0].role;
          await c.query('BEGIN READ ONLY');
          try {
            await c.query(`SET LOCAL ROLE ${owner}`);
            const schema = (await c.query("SELECT has_schema_privilege(current_user,'public','USAGE') AND has_schema_privilege(current_user,'public','CREATE') AS ready")).rows[0].ready;
            if (!schema) throw new Error('Owner schema ACL missing.');
          } finally { await c.query('ROLLBACK'); }
        });
        const actualRuntime = await withClient(newUrl, async c => (await c.query('SELECT session_user AS role')).rows[0].role);
        return {database:identity.db,operatorRole:identity.role,oldRole:old?.rolname,runtimeRole:actualRuntime,migratorRole:actualMigrator,
          profileVerified:Boolean(old && fresh && migrator && !old.rolsuper && !old.rolreplication && ownerRole===expected.oldRole &&
            urls[0].username===expected.operatorRole && urls[1].username===expected.oldRole && urls[2].username===expected.runtimeRole &&
            urls[3].username===expected.migratorRole && edge.length===1 && edge[0].set_option && !edge[0].admin_option && !indirectAdmin &&
            !inheritedRuntime && !runtimeCreate && !reachable(expected.runtimeRole).has('cloudsqlsuperuser') &&
            fresh.rolcanlogin && !fresh.rolsuper && !fresh.rolreplication && !fresh.rolbypassrls && !fresh.rolcreaterole && !fresh.rolcreatedb &&
            migrator.rolcanlogin && !migrator.rolsuper && !migrator.rolreplication && !migrator.rolbypassrls && !migrator.rolcreaterole && !migrator.rolcreatedb &&
            !reachable(expected.migratorRole,false,expected.oldRole).has('cloudsqlsuperuser')),
          oldMemberships:memberships.filter(m=>m.child===expected.oldRole).map(m=>m.parent).sort(),
          oldRoleAttributes:old ? {login:old.rolcanlogin,createrole:old.rolcreaterole,createdb:old.rolcreatedb} : null};
      });
    },
    async oldCredentialWorks() { return withClient(oldUrl, async c => (await c.query('SELECT session_user AS role')).rows[0].role === urls[1].username); },
    async snapshot() {
      return withClient(migratorUrl, async c => {
        await c.query('BEGIN READ ONLY');
        try {
          await c.query(`SET LOCAL ROLE ${owner}`);
          const owners = (await c.query("SELECT c.oid,c.relname,c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname")).rows;
          const ledger = (await c.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
          const columns = (await c.query(`SELECT a.attrelid,a.attnum,a.attname,a.atttypid,a.attnotnull,
            pg_get_expr(d.adbin,d.adrelid) AS default_expr FROM pg_attribute a
            JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
            LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
            WHERE n.nspname='public' AND t.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attrelid,a.attnum`)).rows;
          const tables=[];
          for(const table of owners){
            // Only aggregate hashes/counts leave PostgreSQL; never collect user hashes/session payloads.
            const row=(await c.query(`SELECT count(*)::int AS count,
              encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,'|' ORDER BY to_jsonb(r)::text),''),'UTF8')),'hex') AS fingerprint
              FROM public.${identifier(table.relname)} r`)).rows[0];
            tables.push({table:table.relname,...row});
          }
          return {owners,columns,ledger,tables};
        } finally { await c.query('ROLLBACK'); }
      });
    },
    async terminateOldSessions() {
      if(boundInstance===null)throw new Error('Instance-bound connector required for session changes.');
      return withClient(adminUrl, async c => {
        const result = await c.query('SELECT pg_terminate_backend(pid) AS stopped FROM pg_stat_activity WHERE usename=$1 AND pid<>pg_backend_pid()', [urls[1].username]);
        if (result.rows.some(row=>row.stopped !== true)) throw new Error('Could not terminate old session.');
      });
    },
    async oldSessionCount() { return withClient(adminUrl, async c => Number((await c.query('SELECT count(*) FROM pg_stat_activity WHERE usename=$1',[urls[1].username])).rows[0].count)); },
    async oldCredentialSqlstate() {
      try { await withClient(oldUrl, async()=>{}); return 'CONNECTED'; }
      catch(error) { return error.code ?? 'UNKNOWN_CONNECTION_FAILURE'; }
    },
    async replacementReady() { return withClient(newUrl, async c => (await c.query('SELECT 1 AS ready')).rows[0].ready === 1); },
  };
}
