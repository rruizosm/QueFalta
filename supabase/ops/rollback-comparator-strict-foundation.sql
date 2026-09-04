-- CE-103 emergency rollback: ONLY if all four tables are still empty.
-- Review dependencies and export any real operational evidence before use.
-- Never run automatically; no CASCADE and no migration-history repair here.
BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '500ms';
LOCK TABLE comparator_strict.execution_control, comparator_strict.execution_jobs,
  comparator_strict.execution_budget, comparator_strict.test_principals IN ACCESS EXCLUSIVE MODE;
DO $rollback$
BEGIN
  IF EXISTS (SELECT 1 FROM comparator_strict.execution_control)
     OR EXISTS (SELECT 1 FROM comparator_strict.execution_jobs)
     OR EXISTS (SELECT 1 FROM comparator_strict.execution_budget)
     OR EXISTS (SELECT 1 FROM comparator_strict.test_principals) THEN
    RAISE EXCEPTION 'CE-103 rollback refused: preserve operational evidence; tables are not empty';
  END IF;
END
$rollback$;
DROP TABLE comparator_strict.execution_control;
DROP TABLE comparator_strict.execution_jobs;
DROP TABLE comparator_strict.execution_budget;
DROP TABLE comparator_strict.test_principals;
DROP SCHEMA comparator_strict;
COMMIT;
