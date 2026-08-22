-- ─────────────────────────────────────────────────────────────
-- Distintivo público de QuéFalta Plus (insignia dorada) en `profiles`.
-- ─────────────────────────────────────────────────────────────
-- `premium_until` sigue siendo la fuente de verdad para autorizar funciones.
-- `verified` es únicamente su reflejo booleano público para poder mostrar la
-- insignia en Perfil, Amigos y Miembros de grupo sin publicar la fecha exacta
-- de vencimiento de la suscripción.
--
-- No requiere cambios de RLS: es una columna más de `profiles`, así
-- que la ve cualquiera que ya pueda ver esa fila según
-- policies/profiles_visibility.sql (yo mismo / co-miembro de grupo /
-- amistad / discoverable). No es secreta: es un sello público.
--
-- ⚠️ EJECUTAR/RE-EJECUTAR ANTES de desplegar el cliente nuevo: fetchProfile()
--    (src/api/profile.ts) ya SELECCIONA `verified` y FALLA si la
--    columna no existe (igual que premium_until / onboarded_at).
--
-- Idempotente. Ejecutar en: Supabase → SQL Editor.

alter table public.profiles
  add column if not exists verified boolean not null default false;

comment on column public.profiles.verified is
  'Insignia pública de QuéFalta Plus. La sincroniza el servidor desde premium_until.';

-- Migra cualquier marca manual anterior al estado real de la suscripción.
update public.profiles
set verified = coalesce(premium_until > now(), false)
where verified is distinct from coalesce(premium_until > now(), false);

-- El cliente puede editar su propia fila de profiles, por lo que `verified`
-- no puede quedar como un booleano modificable. El trigger lo deriva siempre
-- de premium_until y rechaza intentos directos desde anon/authenticated.
create or replace function public.sync_plus_verified()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.verified is distinct from old.verified
     and new.premium_until is not distinct from old.premium_until
     and current_user in ('anon', 'authenticated') then
    raise exception 'verified solo puede modificarse desde el servidor';
  end if;

  new.verified := coalesce(new.premium_until > now(), false);
  return new;
end;
$$;

revoke all on function public.sync_plus_verified() from public, anon, authenticated;

drop trigger if exists profiles_sync_plus_verified on public.profiles;
create trigger profiles_sync_plus_verified
  before insert or update of premium_until, verified on public.profiles
  for each row execute function public.sync_plus_verified();
