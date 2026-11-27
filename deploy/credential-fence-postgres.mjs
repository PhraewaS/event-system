// Explicit operator-owned connection profiles only; no CLI, logging or automatic role changes.
import pg from 'pg';
const {Client} = pg;
const identifier = role => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error('Invalid role identifier.');
  return `"${role}"`;
};

export function postgresFenceInspection({adminUrl, oldUrl, newUrl, migratorUrl, ownerRole}) {
  const urls = [adminUrl,oldUrl,newUrl,migratorUrl].map(v => new URL(v));
  if (urls.some(u => !['postgres:','postgresql:'].includes(u.protocol) || u.hostname !== urls[0].hostname ||
      u.port !== urls[0].port || u.pathname !== urls[0].pathname)) throw new Error('Same database endpoint required.');
  const owner = identifier(ownerRole);
  const withClient = async (url, fn) => {
    const client = new Client({connectionString:url,connectionTimeoutMillis:5000,statement_timeout:10000});
    client.on('error',()=>{});
    try { await client.connect(); return await fn(client); } finally { await client.end().catch(()=>{}); }
  };
  return {
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
