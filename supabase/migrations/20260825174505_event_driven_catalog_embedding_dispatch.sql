-- Sustituye el polling continuo del pipeline de embeddings por un arranque
-- event-driven desde el materializador. Cada worker reclama un único lote
-- adicional al terminar, manteniendo la concurrencia inicial sin ramificarse.
-- El cron queda como red de seguridad para trabajos visibles que no reciban
-- el impulso inicial o deban reintentarse tras su visibility timeout.

set lock_timeout = '5s';
set statement_timeout = '60s';

do $checks$
begin
  if to_regprocedure(
    'comparator_internal.dispatch_catalog_embedding_jobs(integer,integer,integer,integer)'
  ) is null then
    raise exception 'La migración comparator_embedding_pipeline no está desplegada';
  end if;
end
$checks$;

-- El materializador y catalog-embed usan service_role. La función expuesta
-- permanece SECURITY INVOKER: service_role recibe solo los permisos internos
-- imprescindibles y anon/authenticated no pueden arrancar el worker.
grant usage on schema comparator_internal to service_role;
grant execute on function comparator_internal.dispatch_catalog_embedding_jobs(
  integer, integer, integer, integer
) to service_role;

create or replace function public.catalog_dispatch_embedding_jobs(
  p_max_requests integer default 3
)
returns bigint[]
language sql
volatile
security invoker
set search_path = ''
as $function$
  select comparator_internal.dispatch_catalog_embedding_jobs(
    100,
    p_max_requests,
    180,
    60000
  );
$function$;

revoke all on function public.catalog_dispatch_embedding_jobs(integer)
  from public, anon, authenticated;
grant execute on function public.catalog_dispatch_embedding_jobs(integer)
  to service_role;

comment on function public.catalog_dispatch_embedding_jobs(integer) is
  'Arranca de 1 a 10 lotes del worker de embeddings. Solo service_role; el materializador usa 3 y cada worker encadena 1.';

-- pg_cron no permite editar cron.job directamente. Se reemplaza el polling de
-- 10 segundos por un respaldo cada 15 minutos para recuperar impulsos fallidos
-- y reintentar mensajes que vuelvan a estar visibles.
do $unschedule$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'catalog-embedding-dispatch'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$unschedule$;

select cron.schedule(
  'catalog-embedding-dispatch',
  '*/15 * * * *',
  $cron$select comparator_internal.dispatch_catalog_embedding_jobs(100, 3, 180, 60000);$cron$
);
