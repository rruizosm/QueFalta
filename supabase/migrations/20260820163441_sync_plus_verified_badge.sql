-- La insignia dorada identifica públicamente una suscripción QuéFalta Plus
-- activa sin exponer premium_until. El acceso sigue autorizado únicamente por
-- la fecha; verified es un reflejo protegido para Perfil, Amigos y Grupos.

alter table public.profiles
  add column if not exists verified boolean not null default false;

comment on column public.profiles.verified is
  'Insignia pública de QuéFalta Plus. La sincroniza el servidor desde premium_until.';

-- Sustituye cualquier marca manual anterior por el estado Plus real.
update public.profiles
set verified = coalesce(premium_until > now(), false)
where verified is distinct from coalesce(premium_until > now(), false);

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
