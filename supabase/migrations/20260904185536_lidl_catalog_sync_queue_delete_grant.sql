-- schedule_all_lidl_catalog_sync_jobs() se ejecuta como SECURITY INVOKER y
-- elimina de la cola las tiendas que ya no son seleccionables. La migracion
-- inicial concedia SELECT/INSERT/UPDATE a service_role, pero omitio DELETE.

set lock_timeout = '5s';
set statement_timeout = '30s';

do $preflight$
begin
  if to_regclass('private.lidl_catalog_sync_queue') is null then
    raise exception 'lidl_catalog_sync_queue_delete_grant_preflight_failed: sync queue is missing';
  end if;
end
$preflight$;

revoke delete on table private.lidl_catalog_sync_queue
  from public, anon, authenticated;
grant delete on table private.lidl_catalog_sync_queue
  to service_role;
