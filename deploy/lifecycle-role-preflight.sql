-- psql only; catalog SELECTs inside a READ ONLY transaction. No secret payloads.
\set ON_ERROR_STOP on
\if :{?old_role}
\else
  \echo 'Required: -v old_role=ACTUAL_OLD_LOGIN'
  \quit 3
\endif
\if :{?new_role}
\else
  \echo 'Required: -v new_role=ACTUAL_REPLACEMENT_LOGIN'
  \quit 3
\endif
BEGIN READ ONLY;
SELECT current_setting('server_version') AS server_version,
       current_database() AS database, session_user, current_user,
       current_setting('transaction_read_only') AS read_only;

SELECT rolname, rolcanlogin, rolsuper, rolcreaterole, rolcreatedb,
       rolreplication, rolbypassrls
FROM pg_roles
WHERE rolname IN (session_user, current_user, :'old_role', :'new_role')
ORDER BY rolname;

-- Include inherited memberships: inspect every path, not only direct grants.
WITH RECURSIVE memberships AS (
  SELECT oid, rolname, ARRAY[oid] AS path FROM pg_roles WHERE rolname=:'old_role'
  UNION ALL
  SELECT parent.oid, parent.rolname, child.path || parent.oid
  FROM memberships child JOIN pg_auth_members m ON m.member=child.oid
  JOIN pg_roles parent ON parent.oid=m.roleid
  WHERE NOT parent.oid=ANY(child.path)
)
SELECT rolname AS old_role_or_ancestor FROM memberships ORDER BY rolname;

-- Raw privilege indicators, not an assertion that Cloud SQL permits the operation.
SELECT o.rolname AS operator_role, r.rolname AS old_role,
       o.rolsuper AS operator_superuser, o.rolcreaterole AS operator_createrole,
       EXISTS(SELECT 1 FROM pg_auth_members m
              WHERE m.roleid=r.oid AND m.member=o.oid AND m.admin_option)
         AS direct_admin_option_on_old_role,
       EXISTS(SELECT 1 FROM pg_auth_members m
              WHERE m.roleid=to_regrole('cloudsqlsuperuser')
                AND m.member=o.oid AND m.admin_option)
         AS direct_admin_option_on_cloudsqlsuperuser,
       pg_has_role(o.oid,r.oid,'MEMBER') AS operator_member_of_old_role,
       pg_has_role(o.oid,'pg_read_all_stats','USAGE') AS operator_read_all_stats,
       pg_has_role(o.oid,'pg_signal_backend','USAGE') AS operator_signal_backend,
       has_function_privilege(o.oid,'pg_catalog.pg_terminate_backend(integer,bigint)','EXECUTE')
         AS operator_terminate_function_execute
FROM pg_roles o LEFT JOIN pg_roles r ON r.rolname=:'old_role'
WHERE o.rolname=current_user;

SELECT datname, pg_get_userbyid(datdba) AS owner
FROM pg_database WHERE datdba=to_regrole(:'old_role');
SELECT n.nspname AS schema, c.relname AS relation, c.relkind
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relowner=to_regrole(:'old_role') AND n.nspname NOT LIKE 'pg_%'
ORDER BY n.nspname,c.relname;
SELECT usename,datname,state,count(*) AS sessions
FROM pg_stat_activity WHERE usename=:'old_role'
GROUP BY usename,datname,state ORDER BY datname,state;
COMMIT;
