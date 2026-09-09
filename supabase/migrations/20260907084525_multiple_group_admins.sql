-- Administración múltiple de grupos.
--
-- `groups.created_by` sigue siendo la autoridad inmutable: solo esa cuenta
-- puede eliminar el grupo. Los permisos operativos viven en
-- `group_members.role`, de modo que puede haber varios administradores.

alter table public.group_members
  add column if not exists role text not null default 'member';

alter table public.group_members
  drop constraint if exists group_members_role_check;
alter table public.group_members
  add constraint group_members_role_check
  check (role in ('member', 'admin'));

comment on column public.group_members.role is
  'Rol operativo dentro del grupo. El creador siempre es admin cuando mantiene su membresía; created_by conserva en exclusiva el borrado del grupo.';

-- Conserva las dos autoridades históricas: el creador y el owner transferido.
-- No se recrean membresías que ya fueron abandonadas o eliminadas.
update public.group_members gm
set role = 'admin'
from public.groups g
where g.id = gm.group_id
  and gm.user_id in (g.created_by, g.owner_id)
  and gm.role <> 'admin';

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Los helpers SECURITY DEFINER viven fuera del esquema expuesto y fijan el
-- search_path. Así pueden consultar membresías sin recursión de RLS.
create or replace function private.is_group_admin(gid uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = gid
      and gm.user_id = (select auth.uid())
      and gm.role = 'admin'
  );
$$;

create or replace function private.is_group_creator(gid uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = gid
      and g.created_by = uid
  );
$$;

revoke all on function private.is_group_admin(uuid) from public, anon;
revoke all on function private.is_group_creator(uuid, uuid) from public, anon;
grant execute on function private.is_group_admin(uuid) to authenticated, service_role;
grant execute on function private.is_group_creator(uuid, uuid) to authenticated, service_role;

-- Invariante: si el creador pertenece al grupo, su rol es siempre admin. La
-- policy cliente impide eliminar esa membresía por separado; no se bloquean
-- cascades internos como el borrado de cuenta.
create or replace function private.enforce_group_creator_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator_id uuid;
begin
  select g.created_by
  into creator_id
  from public.groups g
  where g.id = new.group_id;

  if tg_op = 'UPDATE'
    and old.user_id = creator_id
    and (
      new.group_id is distinct from old.group_id
      or new.user_id is distinct from old.user_id
      or new.role <> 'admin'
    )
  then
    raise exception 'group creator must remain an administrator'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and new.user_id = creator_id then
    new.role := 'admin';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_group_creator_membership() from public, anon, authenticated;
grant execute on function private.enforce_group_creator_membership() to service_role;

drop trigger if exists group_members_protect_creator on public.group_members;
create trigger group_members_protect_creator
before insert or update on public.group_members
for each row execute function private.enforce_group_creator_membership();

-- Los nuevos miembros entran como `member`. La única inserción admin directa
-- es la membresía inicial del creador dentro de create_group_with_owner.
drop policy if exists "Users can join groups via invite" on public.group_members;
drop policy if exists "group_members insert: admin adds" on public.group_members;
drop policy if exists "group_members: el creador del grupo puede añadir miembros" on public.group_members;
drop policy if exists "group_members insert: allowed membership" on public.group_members;
create policy "group_members insert: allowed membership"
on public.group_members for insert to authenticated
with check (
  (
    role = 'member'
    and (
      user_id = (select auth.uid())
      or (
        (select private.is_group_admin(group_id))
        and public.is_discoverable(user_id)
      )
    )
  )
  or (
    role = 'admin'
    and user_id = (select auth.uid())
    and (select private.is_group_creator(group_id, user_id))
  )
);

drop policy if exists "group_members update: admins manage roles" on public.group_members;
create policy "group_members update: admins manage roles"
on public.group_members for update to authenticated
using (
  (select private.is_group_admin(group_id))
  and not (select private.is_group_creator(group_id, user_id))
)
with check (
  (select private.is_group_admin(group_id))
  and not (select private.is_group_creator(group_id, user_id))
);

drop policy if exists "group_members delete: leave or admin removes" on public.group_members;
drop policy if exists "group_members: el creador puede eliminar miembros" on public.group_members;
drop policy if exists "group_members delete: allowed removal" on public.group_members;
create policy "group_members delete: allowed removal"
on public.group_members for delete to authenticated
using (
  not (select private.is_group_creator(group_id, user_id))
  and (
    user_id = (select auth.uid())
    or (select private.is_group_admin(group_id))
  )
);

-- Solo se expone UPDATE sobre la columna de rol; group_id/user_id permanecen
-- inmutables desde el cliente.
revoke update on table public.group_members from authenticated;
grant update (role) on table public.group_members to authenticated;

-- Los administradores pueden editar nombre/icono, pero no created_by,
-- owner_id ni creation_key. owner_id queda como compatibilidad de lectura para
-- builds antiguas y deja de ser la fuente de autorización.
drop policy if exists "groups update: admin" on public.groups;
create policy "groups update: admin"
on public.groups for update to authenticated
using ((select private.is_group_admin(id)))
with check ((select private.is_group_admin(id)));

revoke update on table public.groups from authenticated;
grant update (name, icon_emoji) on table public.groups to authenticated;

drop policy if exists "groups: eliminar si eres creador" on public.groups;
create policy "groups: eliminar si eres creador"
on public.groups for delete to authenticated
using (created_by = (select auth.uid()));

drop policy if exists "groups: ver si eres miembro" on public.groups;
create policy "groups: ver si eres miembro"
on public.groups for select to authenticated
using (public.is_group_member(id));

-- La implementación privilegiada vive en el esquema no expuesto. Comprueba la
-- sesión y todos los argumentos antes de saltarse RLS para completar las dos
-- inserciones de forma atómica. El RPC público es solo un wrapper invoker.
create or replace function private.create_group_with_owner(
  group_name text,
  request_key text
)
returns uuid
language plpgsql
security definer
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
  do nothing
  returning id into new_group_id;

  if new_group_id is null then
    select g.id
    into new_group_id
    from public.groups g
    where g.created_by = caller_id
      and g.creation_key = normalized_key;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (new_group_id, caller_id, 'admin')
  on conflict do nothing;

  return new_group_id;
end;
$$;

revoke all on function private.create_group_with_owner(text, text) from public, anon;
grant execute on function private.create_group_with_owner(text, text) to authenticated, service_role;

create or replace function public.create_group_with_owner(
  group_name text,
  request_key text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_group_with_owner(group_name, request_key);
$$;

revoke all on function public.create_group_with_owner(text, text) from public, anon;
grant execute on function public.create_group_with_owner(text, text) to authenticated;

-- El helper histórico estaba en el esquema expuesto. Las policies nuevas usan
-- el helper privado, así que se retira para no conservar un SECURITY DEFINER
-- público innecesario.
drop function if exists public.is_group_admin(uuid);
