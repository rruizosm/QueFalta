-- Refuerzo integral del onboarding:
--   1. progreso reanudable por usuario;
--   2. creación de grupo + membresía en una sola transacción e idempotente;
--   3. cierre validado y fechado por el servidor.

alter table public.profiles
  add column if not exists onboarding_step smallint not null default 0;

alter table public.profiles
  drop constraint if exists profiles_onboarding_step_range;
alter table public.profiles
  add constraint profiles_onboarding_step_range
  check (onboarding_step between 0 and 5);

-- Los usuarios ya incorporados nunca deben volver a abrir el asistente.
update public.profiles
set onboarding_step = 5
where onboarded_at is not null and onboarding_step <> 5;

comment on column public.profiles.onboarding_step is
  'Siguiente paso del onboarding: 0 usuario, 1 súpers, 2 avatar, 3 amigos, 4 grupo, 5 completado.';

alter table public.groups
  add column if not exists creation_key text;

create unique index if not exists groups_created_by_creation_key_uq
  on public.groups (created_by, creation_key)
  where creation_key is not null;

comment on column public.groups.creation_key is
  'Clave idempotente generada por el cliente para evitar grupos duplicados al reintentar.';

create or replace function public.create_group_with_owner(
  group_name text,
  request_key text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_name text := btrim(group_name);
  normalized_key text := nullif(btrim(request_key), '');
  new_group_id uuid;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(normalized_name) < 1 or char_length(normalized_name) > 80 then
    raise exception 'invalid group name' using errcode = '22023';
  end if;
  if normalized_key is null or char_length(normalized_key) > 160 then
    raise exception 'invalid request key' using errcode = '22023';
  end if;

  insert into public.groups (name, created_by, owner_id, creation_key)
  values (normalized_name, caller_id, caller_id, normalized_key)
  on conflict (created_by, creation_key) where creation_key is not null
  do update set creation_key = excluded.creation_key
  returning id into new_group_id;

  insert into public.group_members (group_id, user_id)
  values (new_group_id, caller_id)
  on conflict do nothing;

  return new_group_id;
end;
$$;

revoke all on function public.create_group_with_owner(text, text) from public, anon;
grant execute on function public.create_group_with_owner(text, text) to authenticated;

create or replace function public.complete_onboarding()
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  completed_at timestamptz;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.profiles
  set onboarded_at = coalesce(onboarded_at, statement_timestamp()),
      onboarding_step = 5
  where id = caller_id
    and username ~ '^[a-z0-9_.]{3,20}$'
    and region is not null
    and catalog_stores is not null
    and cardinality(catalog_stores) > 0
  returning onboarded_at into completed_at;

  if completed_at is null then
    raise exception 'onboarding requirements are incomplete' using errcode = '23514';
  end if;

  return completed_at;
end;
$$;

revoke all on function public.complete_onboarding() from public, anon;
grant execute on function public.complete_onboarding() to authenticated;
