-- Lidl se sincroniza como un censo completo semanal. La eleccion de tienda del
-- usuario solo decide que catalogo lee la app: nunca crea ni prioriza trabajos.

set lock_timeout = '5s';
set statement_timeout = '120s';

do $preflight$
begin
  if to_regclass('private.lidl_catalog_sync_queue') is null
     or to_regclass('public.lidl_stores') is null then
    raise exception 'lidl_weekly_full_fleet_preflight_failed: sync queue is missing';
  end if;
end
$preflight$;

-- Retira completamente el acoplamiento perfil -> sincronizacion.
drop trigger if exists enqueue_lidl_catalog_sync on public.profiles;
drop function if exists private.enqueue_lidl_catalog_sync_from_profile();

-- Las RPC y columnas de prioridad dejan de formar parte del contrato.
drop function if exists public.schedule_lidl_catalog_sync_jobs(integer,interval);
drop function if exists public.enqueue_lidl_catalog_sync_job(text,integer,text);
drop function if exists public.claim_lidl_catalog_sync_jobs(text,integer,integer,integer,integer);

-- No habia trabajos en produccion al aplicar este cambio. En instalaciones que
-- hubieran recibido una seleccion durante el despliegue, se descarta solo ese
-- trabajo derivado del perfil; el lote semanal volvera a incluir la tienda.
delete from private.lidl_catalog_sync_queue
where source = 'user_selection';

drop index if exists private.lidl_catalog_sync_queue_claim_idx;
drop index if exists private.lidl_catalog_sync_queue_expired_lease_idx;

alter table private.lidl_catalog_sync_queue
  drop column priority,
  drop column source;

comment on table private.lidl_catalog_sync_queue is
  'Cola tecnica interna que reparte el censo Lidl semanal entre workers service_role.';

create index lidl_catalog_sync_queue_claim_idx
  on private.lidl_catalog_sync_queue (available_at, requested_at, store_id)
  where status in ('pending', 'retry');

create index lidl_catalog_sync_queue_expired_lease_idx
  on private.lidl_catalog_sync_queue (lease_until, store_id)
  where status = 'running';

-- Cada ejecucion semanal vuelve a poner en pending todas las tiendas abiertas,
-- aunque alguna se hubiera sincronizado manualmente durante la semana. Un job
-- con lease vigente se conserva para no duplicar una descarga ya iniciada.
create or replace function public.schedule_all_lidl_catalog_sync_jobs()
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_count integer;
begin
  delete from private.lidl_catalog_sync_queue as q
  where not exists (
    select 1
    from public.lidl_stores as s
    where s.id = q.store_id
      and s.published
      and s.selectable
  )
    and not (q.status = 'running' and q.lease_until > now());

  insert into private.lidl_catalog_sync_queue as q (
    store_id,
    status,
    requested_at,
    available_at,
    attempts,
    requested_count,
    updated_at
  )
  select
    s.id,
    'pending',
    now(),
    now(),
    0,
    1,
    now()
  from public.lidl_stores as s
  where s.published
    and s.selectable
  order by s.id
  on conflict (store_id) do update
  set status = case
        when q.status = 'running' and q.lease_until > now() then 'running'
        else 'pending'
      end,
      requested_at = now(),
      available_at = case
        when q.status = 'running' and q.lease_until > now()
          then q.available_at
        else now()
      end,
      started_at = case
        when q.status = 'running' and q.lease_until > now()
          then q.started_at
        else null
      end,
      finished_at = null,
      lease_until = case
        when q.status = 'running' and q.lease_until > now()
          then q.lease_until
        else null
      end,
      worker_id = case
        when q.status = 'running' and q.lease_until > now()
          then q.worker_id
        else null
      end,
      attempts = case
        when q.status = 'running' and q.lease_until > now()
          then q.attempts
        else 0
      end,
      requested_count = q.requested_count + 1,
      last_error = case
        when q.status = 'running' and q.lease_until > now()
          then q.last_error
        else null
      end,
      updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end
$function$;

create or replace function public.claim_lidl_catalog_sync_jobs(
  p_worker_id text,
  p_limit integer default 1,
  p_lease_minutes integer default 45,
  p_max_attempts integer default 3
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

  update private.lidl_catalog_sync_queue as q
  set status = 'dead',
      finished_at = now(),
      lease_until = null,
      worker_id = null,
      last_error = coalesce(q.last_error, 'worker lease expired after maximum attempts'),
      updated_at = now()
  where q.attempts >= least(greatest(coalesce(p_max_attempts, 3), 1), 10)
    and (
      (q.status = 'running' and q.lease_until <= now())
      or
      (q.status = 'retry' and q.available_at <= now())
    );

  return query
  with picked as (
    select q.store_id
    from private.lidl_catalog_sync_queue as q
    where q.attempts < least(greatest(coalesce(p_max_attempts, 3), 1), 10)
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

revoke all on function public.schedule_all_lidl_catalog_sync_jobs()
  from public, anon, authenticated;
grant execute on function public.schedule_all_lidl_catalog_sync_jobs()
  to service_role;

revoke all on function public.claim_lidl_catalog_sync_jobs(text,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.claim_lidl_catalog_sync_jobs(text,integer,integer,integer)
  to service_role;

notify pgrst, 'reload schema';
