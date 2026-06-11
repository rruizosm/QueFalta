-- Borrado de grupo por el administrador (Miembros → "Eliminar grupo").
--
-- La policy DELETE sobre groups ya existe (groups_owner.sql la realinea a
-- owner_id = auth.uid()). Lo que falta es que borrar el grupo ARRASTRE lo que
-- cuelga de él: miembros, listas e ítems. Los FK del esquema base no se crearon
-- con ON DELETE CASCADE → aquí se recrean con cascade.
--
-- Nota RLS: las acciones referenciales (CASCADE) las ejecuta el sistema y NO
-- pasan por las policies de las tablas hijas — exactamente lo que se quiere
-- (el admin borra el grupo aunque los ítems los crearan otros miembros).
--
-- Idempotente: localiza los FK por tablas origen/destino (sin asumir nombres)
-- y solo los toca si aún no son CASCADE. Ejecutar en: Supabase → SQL Editor.

do $$
declare r record;
begin
  -- 1. Tirar los FK existentes que no sean ON DELETE CASCADE.
  for r in
    select con.conname, rel.relname as tbl
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and con.contype = 'f'
      and con.confdeltype <> 'c'  -- 'c' = cascade: ya está bien, no tocar
      and (
        (rel.relname = 'group_members'  and con.confrelid = 'public.groups'::regclass)
        or (rel.relname = 'shopping_lists' and con.confrelid = 'public.groups'::regclass)
        or (rel.relname = 'list_items'     and con.confrelid = 'public.shopping_lists'::regclass)
      )
  loop
    execute format('alter table public.%I drop constraint %I', r.tbl, r.conname);
  end loop;

  -- 2. Recrearlos con CASCADE si faltan.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.group_members'::regclass
      and confrelid = 'public.groups'::regclass and contype = 'f'
  ) then
    alter table public.group_members
      add constraint group_members_group_id_fkey
      foreign key (group_id) references public.groups(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.shopping_lists'::regclass
      and confrelid = 'public.groups'::regclass and contype = 'f'
  ) then
    alter table public.shopping_lists
      add constraint shopping_lists_group_id_fkey
      foreign key (group_id) references public.groups(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.list_items'::regclass
      and confrelid = 'public.shopping_lists'::regclass and contype = 'f'
  ) then
    alter table public.list_items
      add constraint list_items_list_id_fkey
      foreign key (list_id) references public.shopping_lists(id) on delete cascade;
  end if;
end $$;
