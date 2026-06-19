-- ─────────────────────────────────────────────────────────────
-- Límites de longitud (CHECK) en columnas de texto libres.
-- ─────────────────────────────────────────────────────────────
-- Las columnas `text` sin tope permiten que un cliente (saltándose la UI, con
-- la anon key y un POST directo a PostgREST) inserte payloads enormes →
-- abultan la BD y los bundles que la app descarga. Estos topes son generosos
-- (no rompen datos existentes) y cortan el abuso. La validación fina de formato
-- (charset del @usuario, etc.) sigue en la app.
--
-- Patrón idempotente: drop if exists + add (revalida en cada ejecución).
-- Ejecutar en: Supabase → SQL Editor.

-- ── groups.name ───────────────────────────────────────────────
alter table public.groups drop constraint if exists groups_name_len;
alter table public.groups add constraint groups_name_len
  check (char_length(btrim(name)) between 1 and 80);

-- ── profiles.name / username ──────────────────────────────────
alter table public.profiles drop constraint if exists profiles_name_len;
alter table public.profiles add constraint profiles_name_len
  check (char_length(name) <= 80);

alter table public.profiles drop constraint if exists profiles_username_len;
alter table public.profiles add constraint profiles_username_len
  check (username is null or char_length(username) between 2 and 30);

-- ── list_items ────────────────────────────────────────────────
alter table public.list_items drop constraint if exists list_items_name_len;
alter table public.list_items add constraint list_items_name_len
  check (char_length(product_name) <= 200);

alter table public.list_items drop constraint if exists list_items_unit_len;
alter table public.list_items add constraint list_items_unit_len
  check (char_length(unit) <= 20);

alter table public.list_items drop constraint if exists list_items_qty_max;
alter table public.list_items add constraint list_items_qty_max
  check (quantity <= 9999);

alter table public.list_items drop constraint if exists list_items_emoji_len;
alter table public.list_items add constraint list_items_emoji_len
  check (category_emoji is null or char_length(category_emoji) <= 16);

-- ── purchase_items (historial) ────────────────────────────────
alter table public.purchase_items drop constraint if exists purchase_items_name_len;
alter table public.purchase_items add constraint purchase_items_name_len
  check (char_length(product_name) <= 200);

-- ── friendships.status: solo valores válidos ──────────────────
alter table public.friendships drop constraint if exists friendships_status_valid;
alter table public.friendships add constraint friendships_status_valid
  check (status in ('pending', 'accepted'));
