// Operator-only cutover. No URLs/passwords are printed or written to evidence.
import pg from 'pg';
import {pathToFileURL} from 'node:url';
const {Client}=pg;
const quoted=value=>'"'+value.replaceAll('"','""')+'"';

export async function fenceLegacyDatabase({adminUrl,oldUrl,newUrl}) {
  const urls=[adminUrl,oldUrl,newUrl].map(value=>new URL(value));
  if(urls.some(u=>u.hostname!==urls[0].hostname||u.port!==urls[0].port||u.pathname!==urls[0].pathname))
    throw new Error('All connections must target the same database endpoint.');
  const clients=urls.map(u=>new Client({connectionString:u.href,connectionTimeoutMillis:10000}));
  const [admin,old,fresh]=clients;
  // Termination is expected; suppress asynchronous socket errors only on old client.
  old.on('error',()=>{});
  let verifier;
  try {
    for(const c of clients) await c.connect();
    const identities=await Promise.all(clients.map(c=>c.query('SELECT session_user AS role,current_database() AS db,pg_backend_pid() AS pid')));
    const [a,o,n]=identities.map(r=>r.rows[0]);
    if(new Set([a.role,o.role,n.role]).size!==3) throw new Error('Admin, retired runtime and replacement runtime must use distinct login roles.');
    const role=(await admin.query('SELECT rolcanlogin,rolsuper,rolcreaterole FROM pg_roles WHERE rolname=$1',[o.role])).rows[0];
    if(!role?.rolcanlogin||role.rolsuper||role.rolcreaterole) throw new Error('Retired runtime must be an ordinary login role, never an administrator.');
    // Persist NOLOGIN before terminating sessions: old credentials cannot reconnect.
    await admin.query(`ALTER ROLE ${quoted(o.role)} NOLOGIN`);
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename=$1 AND pid<>pg_backend_pid()',[o.role]);
    const until=Date.now()+10000;
    let remaining;
    do {
      remaining=Number((await admin.query('SELECT count(*) FROM pg_stat_activity WHERE usename=$1',[o.role])).rows[0].count);
      if(remaining) await new Promise(r=>setTimeout(r,25));
    } while(remaining&&Date.now()<until);
    if(remaining) throw new Error('Retired runtime still has database sessions; activation must remain blocked.');
    verifier=new Client({connectionString:oldUrl,connectionTimeoutMillis:10000});
    let rejected=false;
    try {await verifier.connect();} catch(error) {
      // Connection/network failures or a wrong password are not retirement proof.
      if(error.code==='28000') rejected=true; else throw new Error('Could not establish explicit NOLOGIN rejection.');
    }
    if(!rejected) throw new Error('Retired credentials can still connect.');
    await fresh.query('SELECT 1');
    return {method:'POSTGRES_ROLE_NOLOGIN_AND_TERMINATE',verifiedAt:new Date().toISOString(),
      database:a.db,retiredRole:o.role,replacementRole:n.role,retiredLoginDisabled:true,
      retiredSessionCount:remaining,oldConnectionRejected:true,replacementConnectionReady:true};
  } finally {
    await Promise.allSettled([...clients,...(verifier?[verifier]:[])].map(c=>c.end()));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv[2]!=='--fence'){
    console.error('Operator action requires --fence; read deploy/lifecycle-release.md first.');process.exitCode=1;
  } else {
    try {
      const proof=await fenceLegacyDatabase({adminUrl:process.env.LIFECYCLE_ADMIN_DATABASE_URL,
        oldUrl:process.env.LIFECYCLE_OLD_DATABASE_URL,newUrl:process.env.LIFECYCLE_NEW_DATABASE_URL});
      console.log(JSON.stringify(proof,null,2));
    } catch {console.error('Database fence not verified. Keep lifecycle writes disabled; inspect privately without publishing connection strings.');process.exitCode=1;}
  }
}
