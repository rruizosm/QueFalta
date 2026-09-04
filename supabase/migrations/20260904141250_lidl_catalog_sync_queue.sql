-- Cola privada y orquestacion del catalogo Lidl multitienda.
--
-- Los usuarios nunca leen ni escriben la cola. Al confirmar una tienda, un
-- trigger de profiles eleva esa tienda a prioridad 100 si no tiene catalogo o
-- lleva mas de siete dias sin actualizarse. Los workers usan RPCs exclusivas
-- de service_role para programar el barrido, reclamar con SKIP LOCKED y cerrar
-- cada trabajo sin mantener bloqueos durante las llamadas HTTP a Lidl.

set lock_timeout = '5s';
set statement_timeout = '120s';

do $preflight$
begin
  if to_regclass('public.lidl_stores') is null
     or to_regclass('public.lidl_store_products') is null
     or to_regclass('public.profiles') is null then
    raise exception 'lidl_catalog_sync_queue_preflight_failed: multistore schema is missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'lidl_store_id'
  ) then
    raise exception 'lidl_catalog_sync_queue_preflight_failed: profiles.lidl_store_id is missing';
  end if;
end
$preflight$;

create schema if not exists private;

create table private.lidl_catalog_sync_queue (
  store_id         text primary key references public.lidl_stores(id)
                     on update cascade on delete cascade,
  priority         smallint not null default 10,
  source           text not null default 'scheduled_refresh',
  status           text not null default 'pending',
  requested_at     timestamptz not null default now(),
  available_at     timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  lease_until      timestamptz,
  worker_id        text,
  attempts         smallint not null default 0,
  requested_count  integer not null default 1,
  last_error       text,
  updated_at       timestamptz not null default now(),
  constraint lidl_catalog_sync_queue_priority_check
    check (priority between 0 and 100),
  constraint lidl_catalog_sync_queue_source_check
    check (source in ('user_selection', 'scheduled_refresh', 'manual')),
  constraint lidl_catalog_sync_queue_status_check
    check (status in ('pending', 'running', 'retry', 'succeeded', 'dead')),
  constraint lidl_catalog_sync_queue_attempts_check
    check (attempts >= 0),
  constraint lidl_catalog_sync_queue_requested_count_check
    check (requested_count > 0),
  constraint lidl_catalog_sync_queue_worker_check
    check (worker_id is null or worker_id ~ '^[A-Za-z0-9._:-]{1,120}$'),
  constraint lidl_catalog_sync_queue_running_lease_check
    check (
      (status = 'running' and worker_id is not null and lease_until is not null)
      or
      (status <> 'running' and worker_id is null and lease_until is null)
    )
);

comment on table private.lidl_catalog_sync_queue is
  'Cola interna de sincronizacion Lidl; una fila por tienda y acceso exclusivo de service_role.';
comment on column private.lidl_catalog_sync_queue.priority is
  '100 para seleccion de usuario, 10 para refresco programado y 0-100 para operacion manual.';

alter table private.lidl_catalog_sync_queue enable row level security;

-- El claim filtra siempre por estado y disponibilidad y ordena por prioridad.
create index lidl_catalog_sync_queue_claim_idx
  on private.lidl_catalog_sync_queue (
    priority desc,
    available_at,
    requested_at,
    store_id
  )
  where status in ('pending', 'retry');

create index lidl_catalog_sync_queue_expired_lease_idx
  on private.lidl_catalog_sync_queue (lease_until, priority desc, store_id)
  where status = 'running';

-- Acelera tanto el trigger como el planificador al consultar el ultimo sync de
-- una tienda sin recorrer sus miles de productos.
create index if not exists lidl_store_products_latest_sync_idx
  on public.lidl_store_products (store_id, synced_at desc)
  where published;

-- Encola automaticamente la tienda que un usuario acaba de confirmar. La
-- funcion es SECURITY DEFINER porque authenticated no puede tocar la cola.
create or replace function private.enqueue_lidl_catalog_sync_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_last_synced_at timestamptz;
begin
  if new.lidl_store_id is null
     or new.lidl_store_id is not distinct from old.lidl_store_id then
    return new;
  end if;

  if not exists (
    select 1
    from public.lidl_stores as s
    where s.id = new.lidl_store_id
      and s.published
      and s.selectable
  ) then
    return new;
  end if;

  select sp.synced_at
    into v_last_synced_at
  from public.lidl_store_products as sp
  where sp.store_id = new.lidl_store_id
    and sp.published
  order by sp.synced_at desc
  limit 1;

  if v_last_synced_at is not null
     and v_last_synced_at >= now() - interval '7 days' then
    return new;
  end if;

  insert into private.lidl_catalog_sync_queue as q (
    store_id,
    priority,
    source,
    status,
    requested_at,
    available_at,
    attempts,
    requested_count,
    updated_at
  )
  values (
    new.lidl_store_id,
    100,
    'user_selection',
    'pending',
    now(),
    now(),
    0,
    1,
    now()
  )
  on conflict (store_id) do update
  set priority = 100,
      source = 'user_selection',
      status = case
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

  return new;
end
$function$;

drop trigger if exists enqueue_lidl_catalog_sync on public.profiles;
create trigger enqueue_lidl_catalog_sync
after update of lidl_store_id on public.profiles
for each row
when (
  new.lidl_store_id is not null
  and new.lidl_store_id is distinct from old.lidl_store_id
)
execute function private.enqueue_lidl_catalog_sync_from_profile();

-- Programa como maximo p_limit tiendas sin catalogo o con catalogo obsoleto.
-- Los trabajos activos y los fallos agotados no se duplican ni se reaniman.
create or replace function public.schedule_lidl_catalog_sync_jobs(
  p_limit integer default 103,
  p_max_age interval default interval '7 days'
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_count integer;
begin
  if p_max_age is null or p_max_age <= interval '0 seconds' then
    raise exception 'p_max_age must be greater than zero';
  end if;

  with candidates as (
    select s.id, latest.synced_at
    from public.lidl_stores as s
    left join lateral (
      select sp.synced_at
      from public.lidl_store_products as sp
      where sp.store_id = s.id
        and sp.published
      order by sp.synced_at desc
      limit 1
    ) as latest on true
    where s.published
      and s.selectable
      and (latest.synced_at is null or latest.synced_at < now() - p_max_age)
      and not exists (
        select 1
        from private.lidl_catalog_sync_queue as existing
        where existing.store_id = s.id
          and existing.status <> 'succeeded'
      )
    order by latest.synced_at asc nulls first, s.id
    limit least(greatest(coalesce(p_limit, 103), 1), 500)
  )
  insert into private.lidl_catalog_sync_queue as q (
    store_id,
    priority,
    source,
    status,
    requested_at,
    available_at,
    attempts,
    requested_count,
    updated_at
  )
  select
    candidates.id,
    10,
    'scheduled_refresh',
    'pending',
    now(),
    now(),
    0,
    1,
    now()
  from candidates
  on conflict (store_id) do update
  set priority = 10,
      source = 'scheduled_refresh',
      status = 'pending',
      requested_at = now(),
      available_at = now(),
      started_at = null,
      finished_at = null,
      lease_until = null,
      worker_id = null,
      attempts = 0,
      requested_count = q.requested_count + 1,
      last_error = null,
      updated_at = now()
  where q.status = 'succeeded';

  get diagnostics v_count = row_count;
  return v_count;
end
$function$;

-- El claim y el cambio a running ocurren en una unica transaccion corta. Los
-- workers concurrentes saltan las filas bloqueadas en vez de esperarse.
create or replace function public.claim_lidl_catalog_sync_jobs(
  p_worker_id text,
  p_limit integer default 1,
  p_min_priority integer default 0,
  p_lease_minutes integer default 45,
  p_max_attempts integer default 3
)
returns table (
  job_store_id text,
  job_priority smallint,
  job_source text,
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
    where q.priority >= least(greatest(coalesce(p_min_priority, 0), 0), 100)
      and q.attempts < least(greatest(coalesce(p_max_attempts, 3), 1), 10)
      and (
        (q.status in ('pending', 'retry') and q.available_at <= now())
        or
        (q.status = 'running' and q.lease_until <= now())
      )
    order by q.priority desc, q.available_at, q.requested_at, q.store_id
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
    returning
      q.store_id,
      q.priority,
      q.source,
      q.attempts,
      q.requested_at,
      q.lease_until
  )
  select
    claimed.store_id,
    claimed.priority,
    claimed.source,
    claimed.attempts,
    claimed.requested_at,
    claimed.lease_until
  from claimed
  order by claimed.priority desc, claimed.requested_at, claimed.store_id;
end
$function$;

create or replace function public.complete_lidl_catalog_sync_job(
  p_store_id text,
  p_worker_id text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  update private.lidl_catalog_sync_queue as q
  set status = 'succeeded',
      finished_at = now(),
      lease_until = null,
      worker_id = null,
      last_error = null,
      updated_at = now()
  where q.store_id = p_store_id
    and q.status = 'running'
    and q.worker_id = p_worker_id;

  return found;
end
$function$;

create or replace function public.fail_lidl_catalog_sync_job(
  p_store_id text,
  p_worker_id text,
  p_error text,
  p_max_attempts integer default 3
)
returns text
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_status text;
begin
  update private.lidl_catalog_sync_queue as q
  set status = case
        when q.attempts >= least(greatest(coalesce(p_max_attempts, 3), 1), 10)
          then 'dead'
        else 'retry'
      end,
      available_at = case
        when q.attempts >= least(greatest(coalesce(p_max_attempts, 3), 1), 10)
          then q.available_at
        else now() + make_interval(
          mins => 15 * (2 ^ least(greatest(q.attempts - 1, 0), 4))::integer
        )
      end,
      finished_at = case
        when q.attempts >= least(greatest(coalesce(p_max_attempts, 3), 1), 10)
          then now()
        else null
      end,
      lease_until = null,
      worker_id = null,
      last_error = left(coalesce(nullif(trim(p_error), ''), 'unknown sync error'), 2000),
      updated_at = now()
  where q.store_id = p_store_id
    and q.status = 'running'
    and q.worker_id = p_worker_id
  returning q.status into v_status;

  return v_status;
end
$function$;

-- Operacion explicita para recuperar un dead job o adelantar una tienda sin
-- modificar el perfil de ningun usuario.
create or replace function public.enqueue_lidl_catalog_sync_job(
  p_store_id text,
  p_priority integer default 50,
  p_source text default 'manual'
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_priority smallint := least(greatest(coalesce(p_priority, 50), 0), 100)::smallint;
  v_source text := case
    when p_source in ('user_selection', 'scheduled_refresh', 'manual')
      then p_source
    else 'manual'
  end;
begin
  if not exists (
    select 1
    from public.lidl_stores as s
    where s.id = p_store_id
      and s.published
      and s.selectable
  ) then
    return false;
  end if;

  insert into private.lidl_catalog_sync_queue as q (
    store_id, priority, source, status, requested_at, available_at,
    attempts, requested_count, updated_at
  ) values (
    p_store_id, v_priority, v_source, 'pending', now(), now(), 0, 1, now()
  )
  on conflict (store_id) do update
  set priority = greatest(q.priority, v_priority),
      source = case when v_priority >= q.priority then v_source else q.source end,
      status = case
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

  return true;
end
$function$;

-- La cola no aparece en la Data API. Las RPC publicas quedan visibles en el
-- schema cache, pero solo service_role puede ejecutarlas.
revoke all on table private.lidl_catalog_sync_queue
  from public, anon, authenticated;
grant select, insert, update on table private.lidl_catalog_sync_queue
  to service_role;
grant usage on schema private to service_role;

revoke all on function private.enqueue_lidl_catalog_sync_from_profile()
  from public, anon, authenticated, service_role;

revoke all on function public.schedule_lidl_catalog_sync_jobs(integer,interval)
  from public, anon, authenticated;
grant execute on function public.schedule_lidl_catalog_sync_jobs(integer,interval)
  to service_role;

revoke all on function public.claim_lidl_catalog_sync_jobs(text,integer,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.claim_lidl_catalog_sync_jobs(text,integer,integer,integer,integer)
  to service_role;

revoke all on function public.complete_lidl_catalog_sync_job(text,text)
  from public, anon, authenticated;
grant execute on function public.complete_lidl_catalog_sync_job(text,text)
  to service_role;

revoke all on function public.fail_lidl_catalog_sync_job(text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.fail_lidl_catalog_sync_job(text,text,text,integer)
  to service_role;

revoke all on function public.enqueue_lidl_catalog_sync_job(text,integer,text)
  from public, anon, authenticated;
grant execute on function public.enqueue_lidl_catalog_sync_job(text,integer,text)
  to service_role;

notify pgrst, 'reload schema';
