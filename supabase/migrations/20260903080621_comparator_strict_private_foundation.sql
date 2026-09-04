-- CE-103: private, inactive foundation only. No catalog or legacy changes.
-- Apply this file alone, transactionally. Absence of any row means disabled.
-- Do not make this migration idempotent: an existing schema requires review.
BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '500ms';

-- One server-side statement bounds the complete DDL body to five seconds.
DO $foundation$
BEGIN
CREATE SCHEMA comparator_strict AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA comparator_strict FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE comparator_strict.execution_jobs (
  id uuid PRIMARY KEY,
  project_ref text NOT NULL CHECK (project_ref = 'gkffvigcnsesbaihycay'),
  operation_key text NOT NULL CHECK (length(operation_key) BETWEEN 1 AND 120),
  sql_sha256 text NOT NULL CHECK (sql_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'running', 'succeeded', 'rolled_back', 'halted', 'unknown')),
  started_at timestamptz NOT NULL,
  deadline_at timestamptz NOT NULL,
  finished_at timestamptz,
  stop_reason text CHECK (length(stop_reason) <= 2000),
  CHECK (isfinite(started_at) AND isfinite(deadline_at)),
  CHECK (deadline_at > started_at AND deadline_at <= started_at + interval '20 minutes'),
  CHECK ((status IN ('succeeded', 'rolled_back')) = (finished_at IS NOT NULL)),
  CHECK (finished_at IS NULL OR (isfinite(finished_at) AND finished_at >= started_at))
);
-- Unknown/halted work blocks another job; expiry never silently releases it.
CREATE UNIQUE INDEX execution_jobs_one_unresolved_per_project
  ON comparator_strict.execution_jobs (project_ref)
  WHERE status IN ('planned', 'running', 'halted', 'unknown');

CREATE TABLE comparator_strict.execution_control (
  project_ref text PRIMARY KEY CHECK (project_ref = 'gkffvigcnsesbaihycay'),
  enabled boolean NOT NULL DEFAULT false,
  halted boolean NOT NULL DEFAULT true,
  active_job_id uuid REFERENCES comparator_strict.execution_jobs(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR NOT halted)
);

CREATE TABLE comparator_strict.execution_budget (
  project_ref text NOT NULL CHECK (project_ref = 'gkffvigcnsesbaihycay'),
  budget_date date NOT NULL CHECK (isfinite(budget_date)),
  bytes_limit bigint NOT NULL DEFAULT 10485760,
  approval_reference text,
  bytes_reserved bigint NOT NULL DEFAULT 0 CHECK (bytes_reserved >= 0 AND bytes_reserved <= bytes_limit),
  sql_ms_reserved bigint NOT NULL DEFAULT 0 CHECK (sql_ms_reserved BETWEEN 0 AND 300000),
  read_rows_reserved bigint NOT NULL DEFAULT 0 CHECK (read_rows_reserved BETWEEN 0 AND 5000),
  write_rows_reserved bigint NOT NULL DEFAULT 0 CHECK (write_rows_reserved BETWEEN 0 AND 2000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_ref, budget_date),
  CHECK (bytes_limit = 10485760 OR
    (budget_date = DATE '2026-09-03' AND bytes_limit = 23068672
     AND approval_reference IS NOT NULL AND approval_reference = 'CE-100-22MiB-2026-09-03'))
);

CREATE TABLE comparator_strict.test_principals (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  verified_at timestamptz NOT NULL CHECK (isfinite(verified_at)),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  verification_reference text NOT NULL CHECK (length(verification_reference) BETWEEN 1 AND 200),
  CHECK (expires_at > verified_at)
);

ALTER TABLE comparator_strict.execution_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparator_strict.execution_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparator_strict.execution_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparator_strict.test_principals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA comparator_strict FROM PUBLIC, anon, authenticated, service_role;
-- Scoped defaults only; never change defaults in public or any shared schema.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA comparator_strict
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA comparator_strict
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA comparator_strict
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

-- No rows, policies, RPC, queues, cron, extensions or grants to app roles.
-- These tables do not by themselves implement the CE-102 remote coordinator.
END
$foundation$;
COMMIT;
