-- CE-105. Isolated PostgreSQL only. Never run the entire test suite in production.
BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '500ms';
DO $test$
DECLARE
  client_role text;
  object_name text;
  denied boolean;
  invalid_sql text;
  rejected boolean;
  test_count integer := 0;
BEGIN
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='comparator_strict' AND c.relkind='r' AND c.relrowsecurity) <> 4 THEN
    RAISE EXCEPTION 'Expected four RLS-enabled tables';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='comparator_strict') THEN
    RAISE EXCEPTION 'No client policy may enable CE-1 yet';
  END IF;
  IF EXISTS (SELECT 1 FROM comparator_strict.test_principals)
     OR EXISTS (SELECT 1 FROM comparator_strict.execution_control)
     OR EXISTS (SELECT 1 FROM comparator_strict.execution_jobs)
     OR EXISTS (SELECT 1 FROM comparator_strict.execution_budget) THEN
    RAISE EXCEPTION 'Foundation must start empty/inactive';
  END IF;
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_schema_privilege(client_role, 'comparator_strict', 'USAGE')
       OR has_schema_privilege(client_role, 'comparator_strict', 'CREATE') THEN
      RAISE EXCEPTION 'Unexpected schema permission for %', client_role;
    END IF;
    FOREACH object_name IN ARRAY ARRAY['execution_control','execution_jobs','execution_budget','test_principals'] LOOP
      IF has_table_privilege(client_role, 'comparator_strict.' || object_name,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'Unexpected table permission for % on %', client_role, object_name;
      END IF;
      EXECUTE format('SET LOCAL ROLE %I', client_role);
      denied := false;
      BEGIN
        EXECUTE format('SELECT 1 FROM comparator_strict.%I LIMIT 1', object_name);
      EXCEPTION WHEN insufficient_privilege THEN denied := true;
      END;
      RESET ROLE;
      IF NOT denied THEN RAISE EXCEPTION 'SELECT was not denied'; END IF;
      test_count := test_count + 1;
    END LOOP;
  END LOOP;

  INSERT INTO comparator_strict.execution_control(project_ref) VALUES ('gkffvigcnsesbaihycay');
  IF EXISTS (SELECT 1 FROM comparator_strict.execution_control WHERE enabled OR NOT halted) THEN
    RAISE EXCEPTION 'Control does not default to stopped';
  END IF;
  INSERT INTO comparator_strict.execution_jobs(id,project_ref,operation_key,sql_sha256,status,started_at,deadline_at)
    VALUES ('00000000-0000-4000-8000-000000000001','gkffvigcnsesbaihycay','fixture-only',repeat('a',64),
      'unknown','2026-09-02 23:55:00+00','2026-09-03 00:15:00+00');
  INSERT INTO comparator_strict.execution_budget(project_ref,budget_date)
    VALUES ('gkffvigcnsesbaihycay','2026-09-02');
  INSERT INTO comparator_strict.execution_budget(project_ref,budget_date,bytes_limit,approval_reference,bytes_reserved)
    VALUES ('gkffvigcnsesbaihycay','2026-09-03',23068672,'CE-100-22MiB-2026-09-03',21960142);
  IF (SELECT bytes_reserved FROM comparator_strict.execution_budget WHERE budget_date='2026-09-03') <> 21960142 THEN
    RAISE EXCEPTION 'Prior spend must be preserved';
  END IF;

  FOREACH invalid_sql IN ARRAY ARRAY[
    $q$UPDATE comparator_strict.execution_control SET enabled=true$q$,
    $q$UPDATE comparator_strict.execution_control SET project_ref='another-project'$q$,
    $q$UPDATE comparator_strict.execution_jobs SET deadline_at=started_at + interval '21 minutes'$q$,
    $q$UPDATE comparator_strict.execution_jobs SET started_at='-infinity'$q$,
    $q$UPDATE comparator_strict.execution_jobs SET sql_sha256='not-reviewed'$q$,
    $q$UPDATE comparator_strict.execution_jobs SET status='succeeded'$q$,
    $q$INSERT INTO comparator_strict.execution_jobs(id,project_ref,operation_key,sql_sha256,started_at,deadline_at)
       VALUES ('00000000-0000-4000-8000-000000000002','gkffvigcnsesbaihycay','second',repeat('b',64),
       '2026-09-03 00:20:00+00','2026-09-03 00:40:00+00')$q$,
    $q$UPDATE comparator_strict.execution_budget SET bytes_reserved=-1$q$,
    $q$UPDATE comparator_strict.execution_budget SET bytes_reserved=23068673$q$,
    $q$UPDATE comparator_strict.execution_budget SET sql_ms_reserved=300001$q$,
    $q$UPDATE comparator_strict.execution_budget SET read_rows_reserved=5001$q$,
    $q$UPDATE comparator_strict.execution_budget SET write_rows_reserved=2001$q$,
    $q$UPDATE comparator_strict.execution_budget SET bytes_limit=23068672 WHERE budget_date='2026-09-02'$q$,
    $q$UPDATE comparator_strict.execution_budget SET approval_reference=NULL WHERE budget_date='2026-09-03'$q$,
    $q$UPDATE comparator_strict.execution_budget SET budget_date='2026-09-04' WHERE budget_date='2026-09-03'$q$,
    $q$INSERT INTO comparator_strict.test_principals VALUES
      ('00000000-0000-4000-8000-000000000003',false,'2026-09-03','2026-09-02','fixture')$q$
  ] LOOP
    rejected := false;
    BEGIN
      EXECUTE invalid_sql;
    EXCEPTION WHEN check_violation OR unique_violation THEN rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'Invalid change accepted: %', invalid_sql; END IF;
    test_count := test_count + 1;
  END LOOP;
  RAISE NOTICE 'CE-105: % denial/constraint cases plus structural assertions passed', test_count;
END
$test$;
-- RLS remains deny-by-default even if a future SELECT grant slips in.
CREATE ROLE ce1_rls_probe NOLOGIN;
GRANT USAGE ON SCHEMA comparator_strict TO ce1_rls_probe;
GRANT SELECT ON comparator_strict.execution_budget TO ce1_rls_probe;
SET LOCAL ROLE ce1_rls_probe;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM comparator_strict.execution_budget) THEN
    RAISE EXCEPTION 'RLS leaked rows through a SELECT grant';
  END IF;
END
$test$;
RESET ROLE;
ROLLBACK;
SELECT 'CE-105 SQL assertions PASS; all fixture changes rolled back' AS result;
