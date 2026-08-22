-- Conserva el selector conjunto de supermercados para quienes ya estaban
-- registrados antes del despliegue de QuéFalta 1.3. La migración debe aplicarse
-- inmediatamente antes de publicar esa versión: el UPDATE fotografía las
-- cuentas existentes y el DEFAULT deja bloqueadas las altas posteriores.

alter table public.profiles
  add column legacy_all_stores_access boolean not null default false;

update public.profiles
set legacy_all_stores_access = true;

comment on column public.profiles.legacy_all_stores_access is
  'Permite usar Todos en Catálogo, Novedades, Ofertas y Cambios de precio a cuentas anteriores a la versión 1.3.';

-- La policy UPDATE del perfil permite modificar columnas propias. Este permiso
-- es una concesión del servidor y no puede quedar editable desde el cliente.
create or replace function public.protect_legacy_all_stores_access()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.legacy_all_stores_access is distinct from old.legacy_all_stores_access
     and current_user in ('anon', 'authenticated') then
    raise exception 'legacy_all_stores_access solo puede modificarse desde el servidor';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_legacy_all_stores_access()
  from public, anon, authenticated;

create trigger profiles_protect_legacy_all_stores_access
  before update of legacy_all_stores_access on public.profiles
  for each row execute function public.protect_legacy_all_stores_access();
