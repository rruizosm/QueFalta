-- CE-106 compensating transaction. Preserve budget and job audit evidence.
-- Exact operation key + verified stopped control row; never broad cleanup.
BEGIN;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='500ms';
DO $revert$
DECLARE
  job_id uuid;
  affected integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('comparator_strict:foundation-canary',0)) THEN
    RAISE EXCEPTION 'Another foundation operation is running';
  END IF;
  SELECT id INTO STRICT job_id FROM comparator_strict.execution_jobs
    WHERE project_ref='gkffvigcnsesbaihycay' AND operation_key='CE-106-foundation-canary-2026-09-03'
      AND status='running' FOR UPDATE;
  DELETE FROM comparator_strict.execution_control
    WHERE project_ref='gkffvigcnsesbaihycay' AND active_job_id=job_id AND NOT enabled AND halted;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Control changed; stop and inspect without deleting anything'; END IF;
  UPDATE comparator_strict.execution_jobs SET status='rolled_back',finished_at=now(),
    stop_reason='CE-106 committed inactive control row removed; budget reservation retained'
    WHERE id=job_id;
  IF EXISTS (SELECT 1 FROM comparator_strict.execution_control WHERE active_job_id=job_id) THEN
    RAISE EXCEPTION 'Reversal validation failed before COMMIT';
  END IF;
END
$revert$;
COMMIT;
