-- Estado premium "QuéFalta Plus" (modelo freemium, ver MONETIZACION.md).
-- NULL o fecha pasada = plan gratuito; fecha futura = premium activo hasta entonces.
-- En Fase 3 la escribirá la Edge Function del webhook de RevenueCat; hasta
-- entonces solo se lee (ProfileContext.isPremium) y se puede conceder a mano:
--   update public.profiles set premium_until = '2099-01-01' where id = '<uuid>';
--
-- Ejecutar en: Supabase → SQL Editor.

alter table public.profiles
  add column if not exists premium_until timestamptz;

comment on column public.profiles.premium_until is
  'Fin de la suscripción QuéFalta Plus. NULL o pasado = free.';

-- La policy UPDATE existente de profiles deja al usuario editar su propia fila
-- entera, así que sin esto cualquiera podría auto-asignarse premium desde la
-- API. El trigger bloquea cambios de premium_until hechos por los roles de
-- cliente (anon/authenticated); el SQL Editor (postgres) y las Edge Functions
-- con service_role pasan sin problema.
create or replace function public.protect_premium_until()
returns trigger
language plpgsql
as $$
begin
  if new.premium_until is distinct from old.premium_until
     and current_user in ('anon', 'authenticated') then
    raise exception 'premium_until solo puede modificarse desde el servidor';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_premium on public.profiles;
create trigger profiles_protect_premium
  before update on public.profiles
  for each row execute function public.protect_premium_until();
