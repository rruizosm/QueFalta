-- CE-105: durable identity/reservation/receipt for the bounded atomic executor.
-- Only own table, nullable for the already retained bootstrap audit record.
BEGIN;
SET LOCAL statement_timeout='1s';
SET LOCAL lock_timeout='500ms';
DO $upgrade$
BEGIN
-- Carry the prior accounting forward; reserve diagnostics + DDL bookkeeping.
-- Headroom includes the two forthcoming 6000 ms / 32768-byte atomic jobs.
IF (clock_timestamp() AT TIME ZONE 'UTC')::date<>DATE '2026-09-03' THEN
  RAISE EXCEPTION 'ce1_upgrade_authority_expired';
END IF;
UPDATE comparator_strict.execution_budget SET sql_ms_reserved=sql_ms_reserved+5000,
  bytes_reserved=bytes_reserved+32768,read_rows_reserved=read_rows_reserved+100,
  write_rows_reserved=write_rows_reserved+2,updated_at=clock_timestamp()
WHERE project_ref='gkffvigcnsesbaihycay' AND budget_date='2026-09-03'
  AND bytes_limit=23068672 AND approval_reference='CE-100-22MiB-2026-09-03'
  AND sql_ms_reserved+17000<=300000 AND bytes_reserved+98304<=bytes_limit
  AND read_rows_reserved+164<=5000 AND write_rows_reserved+10<=2000;
IF NOT FOUND THEN RAISE EXCEPTION 'ce1_upgrade_budget_missing_or_insufficient'; END IF;
ALTER TABLE comparator_strict.execution_jobs
  ADD COLUMN job_key text UNIQUE CHECK (job_key ~ '^ce1-[a-z0-9-]{1,72}$'),
  ADD COLUMN operation_hash text CHECK (operation_hash ~ '^[0-9a-f]{64}$'),
  ADD COLUMN budget_date date,
  ADD COLUMN reservation jsonb CHECK (jsonb_typeof(reservation)='object'),
  ADD COLUMN receipt jsonb CHECK (jsonb_typeof(receipt)='object'),
  ADD CONSTRAINT execution_jobs_budget_fk FOREIGN KEY (project_ref,budget_date)
    REFERENCES comparator_strict.execution_budget(project_ref,budget_date) ON DELETE RESTRICT,
  ADD CONSTRAINT execution_jobs_atomic_identity CHECK (
    (job_key IS NULL AND operation_hash IS NULL AND budget_date IS NULL AND reservation IS NULL AND receipt IS NULL)
    OR (job_key IS NOT NULL AND operation_hash IS NOT NULL AND budget_date IS NOT NULL AND reservation IS NOT NULL)
  );
END
$upgrade$;
COMMIT;
