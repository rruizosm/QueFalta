-- Fase 1b de COMPARATIVA.md — RPC "producto similar más barato" entre supers.
-- Dado el nombre de un producto y una lista de tiendas objetivo, devuelve el
-- equivalente MÁS BARATO por €/unidad en cada tienda (1 fila por tienda).
--
-- Pipeline (validado en el spike, ahora sobre datos reales):
--   1. needle = catalog_clean_name(nombre)         (quita marca y tamaño)
--   2. FAMILIA = catalog_has_all_words(nombre, needle)  (todas las palabras del núcleo)
--   3. orden por price_per_unit (columna canónica de Fase 1a), con GUARD de empate:
--      dentro del 5% del más barato → gana el de menor precio total (envase pequeño).
--
-- Ejecutar en: Supabase → SQL Editor. Requiere las columnas price_per_unit
-- (migración catalog_price_per_unit.sql) ya pobladas por los syncs, y las
-- funciones de paywall_gates.sql (paywall_enabled/is_premium): ejecutar ESA antes.
--
-- Teaser free (Fase 2 de MONETIZACION.md): con el paywall activo, a los
-- usuarios sin Plus las filas les salen `locked` — se conserva la tienda
-- («hay algo más barato en X») y se anulan producto y precios. Con el paywall
-- apagado (hoy) locked es siempre false y la respuesta es la de siempre.

create extension if not exists pg_trgm;

-- Limpia el nombre del producto origen: minúsculas, fuera paréntesis (notas tipo
-- "(Mantener refrigerado)" de bonÀrea), marca, tokens de tamaño y palabras de ENVASE.
-- El envase (brik/cartón/botella/lata…) es ruido para la familia: "leche entera en
-- cartón" debe casar con "leche entera Hacendado" — si "cartón" queda en el needle,
-- el filtro todas-las-palabras lo veta y la comparativa sale vacía.
create or replace function public.catalog_clean_name(p text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(lower(coalesce(p, '')), '\([^)]*\)', ' ', 'g'),
              '\y(hacendado|bonpreu|bon[àa]rea|carrefour|consum|selecci[oó]n\s+de\s+dia|dia\s+l[áa]ctea|dia\s+mari\s+marinera|dia|deliplus|aliada|bosque\s+verde)\y',
              ' ', 'g'
            ),
            '\y\d+([.,]\d+)?\s*(kg|g|gr|ml|cl|l|ud|uds|u|pack|x)\y',
            ' ', 'g'
          ),
          '\y(brik|brick|cart[oó]n|botella|garrafa|lata|tarro|bote|bolsa|paquete|bandeja|envase|granel)\y',
          ' ', 'g'
        )
      ),
      '\s+', ' ', 'g'
    ),
    ''
  );
$$;

-- FAMILIA: ¿están TODAS las palabras (≥3 letras) del needle en el nombre?
-- Da precisión sin taxonomía común: "leche entera" exige "leche" Y "entera"
-- → fuera "café con leche", "leche perro", "gel de leche y miel".
create or replace function public.catalog_has_all_words(p_name text, p_needle text)
returns boolean language sql immutable as $$
  select coalesce(bool_and(p_name like '%' || w || '%'), false)
  from unnest(string_to_array(coalesce(p_needle, ''), ' ')) as w
  where length(w) >= 3;
$$;

-- La columna `locked` cambia el tipo de retorno: hay que dropear antes de crear.
drop function if exists public.similar_products(text, text[]);

create function public.similar_products(
  p_name   text,
  p_stores text[]
)
returns table (
  store               text,
  id                  text,
  display_name        text,
  thumbnail           text,
  price_total         numeric,  -- precio del envase (unit_price)
  price_per_unit      numeric,  -- € por unidad canónica
  price_per_unit_unit text,     -- 'l' | 'kg' | 'ud'
  locked              boolean   -- teaser free: existe más barato, sin detalle
)
language sql stable as $$
  with q as (select public.catalog_clean_name(p_name) as needle),
  gate as (
    select public.paywall_enabled() and not public.is_premium(auth.uid()) as locked
  ),
  cand as (
    select 'mercadona'::text store, m.id, m.display_name, m.thumbnail,
           m.unit_price as price_total, m.price_per_unit, m.price_per_unit_unit,
           similarity(q.needle, lower(m.display_name)) as sim
    from public.mercadona_products m cross join q
    where 'mercadona' = any (p_stores) and m.published
      and public.catalog_has_all_words(lower(m.display_name), q.needle)
    union all
    select 'esclat', b.id, b.display_name, b.thumbnail,
           b.unit_price, b.price_per_unit, b.price_per_unit_unit,
           similarity(q.needle, lower(b.display_name))
    from public.bonpreu_products b cross join q
    where 'esclat' = any (p_stores) and b.published
      and public.catalog_has_all_words(lower(b.display_name), q.needle)
    union all
    select 'carrefour', c.id, c.display_name, c.thumbnail,
           c.unit_price, c.price_per_unit, c.price_per_unit_unit,
           similarity(q.needle, lower(c.display_name))
    from public.carrefour_products c cross join q
    where 'carrefour' = any (p_stores) and c.published
      and public.catalog_has_all_words(lower(c.display_name), q.needle)
    union all
    select 'bonarea', n.id, n.display_name, n.thumbnail,
           n.unit_price, n.price_per_unit, n.price_per_unit_unit,
           similarity(q.needle, lower(n.display_name))
    from public.bonarea_products n cross join q
    where 'bonarea' = any (p_stores) and n.published
      and public.catalog_has_all_words(lower(n.display_name), q.needle)
    union all
    select 'consum', s.id, s.display_name, s.thumbnail,
           s.unit_price, s.price_per_unit, s.price_per_unit_unit,
           similarity(q.needle, lower(s.display_name))
    from public.consum_products s cross join q
    where 'consum' = any (p_stores) and s.published
      and public.catalog_has_all_words(lower(s.display_name), q.needle)
    union all
    select 'dia', d.id, d.display_name, d.thumbnail,
           d.unit_price, d.price_per_unit, d.price_per_unit_unit,
           similarity(q.needle, lower(d.display_name))
    from public.dia_products d cross join q
    where 'dia' = any (p_stores) and d.published
      and public.catalog_has_all_words(lower(d.display_name), q.needle)
  ),
  ranked as (
    select *, min(price_per_unit) over (partition by store) as min_ppu
    from cand
  )
  select distinct on (store)
    store,
    case when g.locked then null else id end,
    case when g.locked then null else display_name end,
    case when g.locked then null else thumbnail end,
    case when g.locked then null else price_total end,
    case when g.locked then null else price_per_unit end,
    case when g.locked then null else price_per_unit_unit end,
    g.locked
  from ranked cross join gate g
  order by
    store,
    (price_per_unit is null),                 -- con €/unidad primero
    (price_per_unit > min_ppu * 1.05),        -- dentro del 5% del más barato primero
    price_total asc nulls last,               -- guard anti-pack: envase más pequeño
    price_per_unit asc nulls last,
    sim desc;
$$;

grant execute on function public.similar_products(text, text[]) to anon, authenticated;
