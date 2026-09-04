-- CE-106 ONE-TIME canary. Do not rerun, generalize or reset today's budget.
-- Only three own rows; no app flag, account, product or commercial function.
BEGIN;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='500ms';
DO $canary$
DECLARE
  job_id uuid := gen_random_uuid();
  canary_sql constant text := 'INSERT INTO comparator_strict.execution_control(project_ref,enabled,halted,active_job_id) VALUES (''gkffvigcnsesbaihycay'',false,true,$1)';
BEGIN
  IF (now() AT TIME ZONE 'UTC')::date <> DATE '2026-09-03' THEN
    RAISE EXCEPTION 'One-time budget authority expired';
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('comparator_strict:foundation-canary',0)) THEN
    RAISE EXCEPTION 'Another foundation operation is running';
  END IF;
  IF EXISTS (SELECT 1 FROM comparator_strict.execution_control)
     OR EXISTS (SELECT 1 FROM comparator_strict.execution_jobs)
     OR EXISTS (SELECT 1 FROM comparator_strict.execution_budget)
     OR EXISTS (SELECT 1 FROM comparator_strict.test_principals) THEN
    RAISE EXCEPTION 'Canary requires verified empty foundation; never retry blindly';
  END IF;
  -- Includes earlier read-only work + the reserved continuation and reversal.
  INSERT INTO comparator_strict.execution_budget(project_ref,budget_date,bytes_limit,approval_reference,
    bytes_reserved,sql_ms_reserved,read_rows_reserved,write_rows_reserved)
  VALUES ('gkffvigcnsesbaihycay','2026-09-03',23068672,'CE-100-22MiB-2026-09-03',
    22484430,280520,3900,20);
  INSERT INTO comparator_strict.execution_jobs(id,project_ref,operation_key,sql_sha256,status,started_at,deadline_at)
  VALUES (job_id,'gkffvigcnsesbaihycay','CE-106-foundation-canary-2026-09-03',
    encode(sha256(convert_to(canary_sql,'UTF8')),'hex'),'running',now(),now()+interval '20 minutes');
  EXECUTE canary_sql USING job_id;
  IF NOT EXISTS (SELECT 1 FROM comparator_strict.execution_control WHERE project_ref='gkffvigcnsesbaihycay'
    AND active_job_id=job_id AND NOT enabled AND halted) THEN
    RAISE EXCEPTION 'Canary validation failed before COMMIT';
  END IF;
END
$canary$;
COMMIT;
