-- Favoritos del usuario: categorías N1 y productos de Mercadona.
--   kind   → 'category' | 'product'
--   ref_id → id de la categoría N1 (p.ej. '1') o id de producto (string)
--   name/emoji/color → snapshot para pintar sin re-fetch (categorías)
--   name/image_url/price → snapshot (productos; price es el unit_price tal cual)
--
-- Ejecutar en: Supabase → SQL Editor.

create table if not exists public.favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('category', 'product')),
  ref_id     text not null,
  name       text not null,
  emoji      text,
  color      text,
  image_url  text,
  price      text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref_id)
);

alter table public.favorites enable row level security;

-- Ver mis favoritos.
drop policy if exists "favorites select: mine" on public.favorites;
create policy "favorites select: mine"
on public.favorites for select to authenticated
using (user_id = auth.uid());

-- Añadir un favorito mío.
drop policy if exists "favorites insert: mine" on public.favorites;
create policy "favorites insert: mine"
on public.favorites for insert to authenticated
with check (user_id = auth.uid());

-- Quitar un favorito mío.
drop policy if exists "favorites delete: mine" on public.favorites;
create policy "favorites delete: mine"
on public.favorites for delete to authenticated
using (user_id = auth.uid());
