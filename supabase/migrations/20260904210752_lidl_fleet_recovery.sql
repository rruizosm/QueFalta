-- Bounded recovery and private queue inspection. No catalog or queue rows are changed.
set lock_timeout = '5s';
set statement_timeout = '120s';

create or replace function public.claim_lidl_catalog_sync_jobs_filtered(
  p_worker_id text,
  p_limit integer default 1,
  p_lease_minutes integer default 45,
  p_max_attempts integer default 3,
  p_store_ids text[] default null
)
returns table (
  job_store_id text,
  job_attempts smallint,
  job_requested_at timestamptz,
  job_lease_until timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if p_worker_id is null
     or p_worker_id !~ '^[A-Za-z0-9._:-]{1,120}$' then
    raise exception 'p_worker_id is invalid';
  end if;

  if p_store_ids is not null and (cardinality(p_store_ids) = 0 or exists (select 1 from unnest(p_store_ids) as id where id is null or id !~ '^ES[0-9]+$')) then
    raise exception 'invalid store filter';
  end if;

  update private.lidl_catalog_sync_queue as q
  set status = 'dead',
      finished_at = now(),
      lease_until = null,
      worker_id = null,
      last_error = coalesce(q.last_error, 'worker lease expired after maximum attempts'),
      updated_at = now()
  where (p_store_ids is null or q.store_id = any(p_store_ids))
    and q.attempts >= least(greatest(coalesce(p_max_attempts, 3), 1), 10)
    and (
      (q.status = 'running' and q.lease_until <= now())
      or
      (q.status = 'retry' and q.available_at <= now())
    );

  return query
  with picked as (
    select q.store_id
    from private.lidl_catalog_sync_queue as q
    where (p_store_ids is null or q.store_id = any(p_store_ids))
      and q.attempts < least(greatest(coalesce(p_max_attempts, 3), 1), 10)
      and (
        (q.status in ('pending', 'retry') and q.available_at <= now())
        or
        (q.status = 'running' and q.lease_until <= now())
      )
    order by q.available_at, q.requested_at, q.store_id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 1), 1), 20)
  ), claimed as (
    update private.lidl_catalog_sync_queue as q
    set status = 'running',
        started_at = now(),
        finished_at = null,
        lease_until = now() + make_interval(
          mins => least(greatest(coalesce(p_lease_minutes, 45), 5), 120)
        ),
        worker_id = p_worker_id,
        attempts = q.attempts + 1,
        last_error = null,
        updated_at = now()
    from picked
    where q.store_id = picked.store_id
    returning q.store_id, q.attempts, q.requested_at, q.lease_until
  )
  select
    claimed.store_id,
    claimed.attempts,
    claimed.requested_at,
    claimed.lease_until
  from claimed
  order by claimed.requested_at, claimed.store_id;
end
$function$;


revoke all on function public.claim_lidl_catalog_sync_jobs_filtered(text,integer,integer,integer,text[]) from public, anon, authenticated;
grant execute on function public.claim_lidl_catalog_sync_jobs_filtered(text,integer,integer,integer,text[]) to service_role;

-- Read-only queue inspection, also used for the mandatory workflow final check.
create or replace function public.lidl_catalog_sync_report(p_store_ids text[] default null)
returns table(store_id text, status text, attempts smallint, available_at timestamptz, lease_until timestamptz, last_error text)
language sql stable security invoker set search_path = ''
as $function$
  select q.store_id, q.status, q.attempts, q.available_at, q.lease_until, q.last_error
  from private.lidl_catalog_sync_queue q
  where p_store_ids is null or q.store_id = any(p_store_ids)
  order by q.store_id;
$function$;
revoke all on function public.lidl_catalog_sync_report(text[]) from public, anon, authenticated;
grant execute on function public.lidl_catalog_sync_report(text[]) to service_role;

-- Explicit operator recovery only. Never reset successful jobs or active leases.
create or replace function public.retry_dead_lidl_catalog_sync_jobs(p_store_ids text[])
returns integer language plpgsql security invoker set search_path = ''
as $function$
declare v_count integer;
begin
  if p_store_ids is null or cardinality(p_store_ids) = 0 or cardinality(p_store_ids) > 1000
     or exists (select 1 from unnest(p_store_ids) as id where id is null or id !~ '^ES[0-9]+$') then
    raise exception 'explicit store IDs required';
  end if;
  update private.lidl_catalog_sync_queue q
  set status = 'retry', attempts = 0, available_at = now(), started_at = null,
      finished_at = null, lease_until = null, worker_id = null, updated_at = now()
  where q.status = 'dead' and q.store_id = any(p_store_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
revoke all on function public.retry_dead_lidl_catalog_sync_jobs(text[]) from public, anon, authenticated;
grant execute on function public.retry_dead_lidl_catalog_sync_jobs(text[]) to service_role;
notify pgrst, 'reload schema';
