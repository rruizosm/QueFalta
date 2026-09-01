-- Recetas creadas por usuarios de QuéFalta.
-- Versión alineada con el historial productivo 20260831124403.
-- Los ingredientes se guardan como snapshots de productos de los catálogos:
-- no existe una tabla común de productos entre todos los supermercados y sus
-- ids solo son únicos dentro de cada tienda.

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  image_path text not null,
  ingredients jsonb not null,
  steps jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipes_title_length check (
    char_length(btrim(title)) between 1 and 120
  ),
  constraint recipes_image_path_length check (
    char_length(btrim(image_path)) between 1 and 500
  ),
  constraint recipes_ingredients_array check (
    jsonb_typeof(ingredients) = 'array'
    and jsonb_array_length(ingredients) between 1 and 50
  ),
  constraint recipes_steps_array check (
    jsonb_typeof(steps) = 'array'
    and jsonb_array_length(steps) between 1 and 30
  )
);

comment on table public.recipes is
  'Recetas de la comunidad. Ingredientes y pasos son snapshots JSON para conservar el contenido publicado.';
comment on column public.recipes.image_path is
  'Ruta relativa dentro del bucket público recipe-images; nunca una URL aportada por el cliente.';

create index if not exists recipes_created_at_idx
  on public.recipes (created_at desc);
create index if not exists recipes_author_id_created_at_idx
  on public.recipes (author_id, created_at desc);

alter table public.recipes enable row level security;

create policy "recipes select: authenticated"
  on public.recipes for select
  to authenticated
  using (true);

create policy "recipes insert: own"
  on public.recipes for insert
  to authenticated
  with check ((select auth.uid()) = author_id);

create policy "recipes update: own"
  on public.recipes for update
  to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

create policy "recipes delete: own"
  on public.recipes for delete
  to authenticated
  using ((select auth.uid()) = author_id);

revoke all on table public.recipes from anon;
grant select, insert, update, delete on table public.recipes to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images',
  'recipe-images',
  true,
  6291456,
  array['image/jpeg']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "recipe images select: authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'recipe-images');

create policy "recipe images insert: own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "recipe images update: own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and owner_id = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "recipe images delete: own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and owner_id = (select auth.uid()::text)
  );
