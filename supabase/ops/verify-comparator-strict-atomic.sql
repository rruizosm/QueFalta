BEGIN READ ONLY;
SET LOCAL statement_timeout='1000ms'; SET LOCAL lock_timeout='250ms'; SET LOCAL transaction_timeout='2000ms';
DO $verify$
DECLARE r text; t text; denied boolean; checked integer:=0;
BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_schema_privilege(r,'comparator_strict','USAGE,CREATE') THEN RAISE EXCEPTION 'Unexpected schema access'; END IF;
  FOREACH t IN ARRAY ARRAY['execution_control','execution_jobs','execution_budget','test_principals'] LOOP
   IF has_table_privilege(r,'comparator_strict.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'Unexpected table access'; END IF;
   EXECUTE format('SET LOCAL ROLE %I',r); denied:=false;
   BEGIN EXECUTE format('SELECT 1 FROM comparator_strict.%I LIMIT 1',t);
   EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
   RESET ROLE;
   IF NOT denied THEN RAISE EXCEPTION 'Role read unexpectedly succeeded'; END IF;
   checked:=checked+1;
  END LOOP;
 END LOOP;
 PERFORM set_config('ce1.verified_denials',checked::text,true);
END $verify$;
SELECT jsonb_build_object('captured_at',clock_timestamp(),
'verified_role_denials',current_setting('ce1.verified_denials')::integer,
'budget',(SELECT to_jsonb(b) FROM comparator_strict.execution_budget b WHERE project_ref='gkffvigcnsesbaihycay' AND budget_date='2026-09-03'),
'unresolved',(SELECT count(*) FROM comparator_strict.execution_jobs WHERE status IN ('planned','running','halted','unknown')),
'control_rows',(SELECT count(*) FROM comparator_strict.execution_control),
'principals',(SELECT count(*) FROM comparator_strict.test_principals),
'jobs',(SELECT jsonb_agg(jsonb_build_object('id',id,'job_key',job_key,'status',status,'started_at',started_at,'finished_at',finished_at,'receipt_present',receipt IS NOT NULL) ORDER BY started_at) FROM comparator_strict.execution_jobs),
'rls_tables',(SELECT jsonb_agg(jsonb_build_object('name',relname,'rls',relrowsecurity) ORDER BY relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='comparator_strict' AND c.relkind='r'),
'policy_count',(SELECT count(*) FROM pg_policies WHERE schemaname='comparator_strict'),
'public_schema_grants',(SELECT count(*) FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a WHERE n.nspname='comparator_strict' AND a.grantee=0),
'public_table_grants',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE n.nspname='comparator_strict' AND a.grantee=0),
'blocked',(SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND pid<>pg_backend_pid()),
'active_older_30s',(SELECT count(*) FROM pg_stat_activity WHERE state='active' AND query_start<clock_timestamp()-interval '30 seconds' AND pid<>pg_backend_pid()),
'connections',(SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()),
'migrations',(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name) ORDER BY version) FROM supabase_migrations.schema_migrations WHERE version IN ('20260903080621','20260903084621')),
'legacy',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'hash',md5(pg_get_functiondef(p.oid))) ORDER BY n.nspname,p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='public' AND p.proname IN ('catalog_cheaper_products_v7','catalog_dispatch_embedding_jobs','catalog_finalize_embedding_batch')) OR (n.nspname='private' AND p.proname='claim_free_comparator_use'))
) evidence;
ROLLBACK;
