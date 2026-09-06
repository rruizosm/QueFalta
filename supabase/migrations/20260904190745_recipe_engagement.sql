-- Interacciones de las recetas de la comunidad.
-- Los contadores se materializan en recipes para que el feed no exponga las
-- identidades de quienes dan Me gusta o guardan una receta.

set lock_timeout = '5s';
set statement_timeout = '120s';

alter table public.recipes
  add column like_count integer not null default 0,
  add column save_count integer not null default 0;

alter table public.recipes
  add constraint recipes_like_count_nonnegative check (like_count >= 0),
  add constraint recipes_save_count_nonnegative check (save_count >= 0);

comment on column public.recipes.like_count is
  'Número materializado de usuarios que han dado Me gusta; solo lo actualizan triggers.';
comment on column public.recipes.save_count is
  'Número materializado de usuarios que han guardado la receta; solo lo actualizan triggers.';

create table public.recipe_likes (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

create table public.recipe_saves (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

comment on table public.recipe_likes is
  'Me gusta de recetas. Cada usuario solo puede consultar y modificar sus propias filas.';
comment on table public.recipe_saves is
  'Recetas guardadas. La identidad de quien guarda permanece privada.';

create index recipe_likes_user_id_created_at_idx
  on public.recipe_likes (user_id, created_at desc);
create index recipe_saves_user_id_created_at_idx
  on public.recipe_saves (user_id, created_at desc);

alter table public.recipe_likes enable row level security;
alter table public.recipe_saves enable row level security;

create policy "recipe likes select: own"
  on public.recipe_likes for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "recipe likes insert: own"
  on public.recipe_likes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "recipe likes delete: own"
  on public.recipe_likes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "recipe saves select: own"
  on public.recipe_saves for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "recipe saves insert: own"
  on public.recipe_saves for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "recipe saves delete: own"
  on public.recipe_saves for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.recipe_likes, public.recipe_saves
  from public, anon, authenticated;
grant select, insert, delete on table public.recipe_likes, public.recipe_saves
  to authenticated;
grant all on table public.recipe_likes, public.recipe_saves
  to service_role;

-- Los autores conservan la edición de contenido, pero el cliente no puede
-- falsificar autoría ni contadores materializados.
revoke update on table public.recipes from authenticated;
grant update (title, image_path, ingredients, steps, updated_at)
  on table public.recipes to authenticated;

create schema if not exists private;

create function private.sync_recipe_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.recipes
       set like_count = like_count + 1
     where id = new.recipe_id;
    return new;
  end if;

  update public.recipes
     set like_count = greatest(like_count - 1, 0)
   where id = old.recipe_id;
  return old;
end;
$$;

create function private.sync_recipe_save_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.recipes
       set save_count = save_count + 1
     where id = new.recipe_id;
    return new;
  end if;

  update public.recipes
     set save_count = greatest(save_count - 1, 0)
   where id = old.recipe_id;
  return old;
end;
$$;

revoke all on function private.sync_recipe_like_count()
  from public, anon, authenticated;
revoke all on function private.sync_recipe_save_count()
  from public, anon, authenticated;

create trigger recipe_likes_sync_count
after insert or delete on public.recipe_likes
for each row execute function private.sync_recipe_like_count();

create trigger recipe_saves_sync_count
after insert or delete on public.recipe_saves
for each row execute function private.sync_recipe_save_count();
