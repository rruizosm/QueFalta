-- Estado público dentro de la app de la última sincronización exitosa por supermercado.
create table if not exists public.catalog_sync_status (
  store text primary key,
  synced_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_catalog_sync_status_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists catalog_sync_status_set_updated_at on public.catalog_sync_status;
create trigger catalog_sync_status_set_updated_at
before update on public.catalog_sync_status
for each row execute function public.set_catalog_sync_status_updated_at();

revoke all on function public.set_catalog_sync_status_updated_at() from public;
grant execute on function public.set_catalog_sync_status_updated_at() to service_role;

alter table public.catalog_sync_status enable row level security;

drop policy if exists "Authenticated users can read catalog sync status" on public.catalog_sync_status;
create policy "Authenticated users can read catalog sync status"
on public.catalog_sync_status for select to authenticated
using (true);

grant select on public.catalog_sync_status to authenticated, service_role;
grant insert, update on public.catalog_sync_status to service_role;
