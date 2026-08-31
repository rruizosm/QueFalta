-- Convierte CANARY en un presupuesto global por activacion.
--
-- Limitar cada llamada a una peticion no era suficiente: el worker terminado
-- podia encadenar otra llamada y consumir la cola completa en serie. Ahora el
-- primer dispatcher consume el presupuesto bajo bloqueo de fila y los workers
-- siguientes reciben una lista vacia.

set lock_timeout = '5s';
set statement_timeout = '60s';

alter table comparator_internal.catalog_embedding_pipeline_control
  add column canary_remaining_requests integer not null default 0
    check (canary_remaining_requests between 0 and 3);

create or replace function comparator_internal.guard_catalog_embedding_canary_budget()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  if new.mode <> 'canary' then
    new.canary_remaining_requests := 0;
  elsif old.mode is distinct from 'canary' then
    new.canary_remaining_requests := new.canary_max_requests;
  elsif new.canary_max_requests is distinct from old.canary_max_requests then
    new.canary_remaining_requests := least(
      new.canary_remaining_requests,
      new.canary_max_requests
    );
  end if;
  return new;
end;
$function$;

revoke all on function comparator_internal.guard_catalog_embedding_canary_budget()
  from public, anon, authenticated;

drop trigger if exists catalog_embedding_canary_budget_guard
  on comparator_internal.catalog_embedding_pipeline_control;
create trigger catalog_embedding_canary_budget_guard
before update of mode, canary_max_requests
on comparator_internal.catalog_embedding_pipeline_control
for each row
execute function comparator_internal.guard_catalog_embedding_canary_budget();

create or replace function public.catalog_embedding_pipeline_status()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'mode', control.mode,
    'maxAutoJobs', control.max_auto_jobs,
    'maxAutoRatio', control.max_auto_ratio,
    'canaryMaxRequests', control.canary_max_requests,
    'canaryRemainingRequests', control.canary_remaining_requests,
    'reason', control.reason,
    'updatedAt', control.updated_at
  )
  from comparator_internal.catalog_embedding_pipeline_control as control
  where control.singleton;
$function$;

revoke all on function public.catalog_embedding_pipeline_status()
  from public, anon, authenticated;
grant execute on function public.catalog_embedding_pipeline_status()
  to service_role;

create or replace function public.catalog_set_embedding_pipeline_mode(
  p_mode text,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_control comparator_internal.catalog_embedding_pipeline_control%rowtype;
begin
  if p_mode is null or p_mode <> all (array['paused', 'canary', 'active']::text[]) then
    raise exception 'Modo de pipeline invalido: %', p_mode;
  end if;

  update comparator_internal.catalog_embedding_pipeline_control as control
  set mode = p_mode,
      canary_remaining_requests = case
        when p_mode = 'canary' then control.canary_max_requests
        else 0
      end,
      reason = nullif(pg_catalog.left(coalesce(p_reason, ''), 500), ''),
      updated_at = now()
  where control.singleton
  returning control.* into v_control;

  if not found then
    raise exception 'Falta catalog_embedding_pipeline_control';
  end if;

  return pg_catalog.jsonb_build_object(
    'mode', v_control.mode,
    'maxAutoJobs', v_control.max_auto_jobs,
    'maxAutoRatio', v_control.max_auto_ratio,
    'canaryMaxRequests', v_control.canary_max_requests,
    'canaryRemainingRequests', v_control.canary_remaining_requests,
    'reason', v_control.reason,
    'updatedAt', v_control.updated_at
  );
end;
$function$;

revoke all on function public.catalog_set_embedding_pipeline_mode(text, text)
  from public, anon, authenticated;
grant execute on function public.catalog_set_embedding_pipeline_mode(text, text)
  to service_role;

create or replace function public.catalog_dispatch_embedding_jobs(
  p_max_requests integer default 3
)
returns bigint[]
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_control comparator_internal.catalog_embedding_pipeline_control%rowtype;
  v_effective_requests integer;
begin
  if p_max_requests not between 1 and 10 then
    raise exception 'p_max_requests debe estar entre 1 y 10';
  end if;

  select control.*
  into v_control
  from comparator_internal.catalog_embedding_pipeline_control as control
  where control.singleton
  for update;

  if not found then
    raise exception 'Falta catalog_embedding_pipeline_control';
  end if;
  if v_control.mode = 'paused' then
    return array[]::bigint[];
  end if;
  if v_control.mode = 'canary' and v_control.canary_remaining_requests = 0 then
    return array[]::bigint[];
  end if;

  v_effective_requests := case
    when v_control.mode = 'canary' then least(
      p_max_requests,
      v_control.canary_remaining_requests
    )
    else p_max_requests
  end;

  if v_control.mode = 'canary' then
    update comparator_internal.catalog_embedding_pipeline_control as control
    set canary_remaining_requests = control.canary_remaining_requests - v_effective_requests,
        updated_at = now()
    where control.singleton;
  end if;

  return comparator_internal.dispatch_catalog_embedding_jobs(
    100,
    v_effective_requests,
    180,
    60000
  );
end;
$function$;

revoke all on function public.catalog_dispatch_embedding_jobs(integer)
  from public, anon, authenticated;
grant execute on function public.catalog_dispatch_embedding_jobs(integer)
  to service_role;

comment on function public.catalog_dispatch_embedding_jobs(integer) is
  'Despacho protegido: paused=0, canary=presupuesto global por activacion, active=concurrencia solicitada.';
