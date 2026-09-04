-- CE-BU-002: owner's explicit removal of accumulated SQL time limit and
-- one-corpus extension. Never reset consumed/reserved resources or app grants.
BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '500ms';
DO $authority$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('comparator_strict:atomic-v1', 0))
    OR EXISTS (SELECT 1 FROM comparator_strict.execution_jobs
      WHERE status IN ('planned','running','halted','unknown')) THEN
    RAISE EXCEPTION 'ce200_unresolved_work';
  END IF;
  ALTER TABLE comparator_strict.execution_budget
    DROP CONSTRAINT execution_budget_sql_ms_reserved_check,
    ADD CONSTRAINT execution_budget_sql_ms_reserved_check CHECK (sql_ms_reserved >= 0),
    ADD COLUMN read_rows_limit bigint NOT NULL DEFAULT 5000,
    DROP CONSTRAINT execution_budget_read_rows_reserved_check,
    ADD CONSTRAINT execution_budget_read_rows_reserved_check
      CHECK (read_rows_reserved >= 0 AND read_rows_reserved <= read_rows_limit),
    DROP CONSTRAINT execution_budget_check1,
    ADD CONSTRAINT execution_budget_transfer_authority CHECK (
      (bytes_limit = 10485760 AND read_rows_limit = 5000)
      OR (budget_date = DATE '2026-09-03' AND bytes_limit = 23068672
        AND read_rows_limit = 5000 AND approval_reference IS NOT NULL
        AND approval_reference = 'CE-100-22MiB-2026-09-03')
      OR (bytes_limit = 134217728 AND read_rows_limit = 50000
        AND approval_reference IS NOT NULL AND approval_reference = 'CE-200-corpus-v1')
    );
  UPDATE comparator_strict.execution_budget SET
    bytes_limit = 134217728, read_rows_limit = 50000,
    approval_reference = 'CE-200-corpus-v1', updated_at = clock_timestamp(),
    -- Conservative charge for the two initial diagnostics and this migration.
    sql_ms_reserved = sql_ms_reserved + 15000,
    read_rows_reserved = read_rows_reserved + 500,
    bytes_reserved = bytes_reserved + 131072,
    write_rows_reserved = write_rows_reserved + 1
  WHERE project_ref = 'gkffvigcnsesbaihycay' AND budget_date = DATE '2026-09-03'
    AND approval_reference = 'CE-100-22MiB-2026-09-03'
    AND bytes_reserved = 22623694 AND sql_ms_reserved = 299920
    AND read_rows_reserved = 4128 AND write_rows_reserved = 35;
  IF NOT FOUND THEN RAISE EXCEPTION 'ce200_review_budget_changed'; END IF;
END
$authority$;
COMMIT;
