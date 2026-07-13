-- Fase 1b de COMPARATIVA.md — RPC "producto similar más barato" entre supers.
-- Dado el nombre de un producto y una lista de tiendas objetivo, devuelve el
-- equivalente MÁS BARATO por €/unidad en cada tienda (1 fila por tienda).
--
-- Pipeline (validado en el spike, ahora sobre datos reales):
--   1. needle = catalog_clean_name(nombre)         (quita marca y tamaño)
--   2. FAMILIA = catalog_family_match(nombre, needle)  (núcleo del needle: puede
--      faltar 1 palabra; needles de 2 palabras exigen las 2 — ver la función)
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
              '\y(hacendado|bonpreu|bon[àa]rea|carrefour|consum|selecci[oó]n\s+de\s+dia|dia\s+l[áa]ctea|dia\s+mari\s+marinera|dia|deliplus|aliada|bosque\s+verde|eroski|caprabo|sorli|ametller\s+origen|ametller|producto\s+alcampo|alcampo\s+cultivamos\s+lo\s+bueno|alcampo|auchan)\y',
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

-- FAMILIA (recall mejorado): exigir TODAS las palabras (catalog_has_all_words) era
-- demasiado estricto entre cadenas — la marca blanca nombra el mismo producto
-- distinto en cada súper. Ej.: needle "salsa original ligeresa" NO casaba con
-- "salsa fina ligeresa" (falta "original") ni con "mayonesa sabor original
-- ligeresa" (falta "salsa"), siendo la misma familia. Ahora se permite que falte
-- como mucho 1 palabra del núcleo:
--   needle de 1 palabra  → exige esa palabra
--   needle de 2 palabras → exige las 2 (NO relajar: "leche entera" ≠ "leche desnatada")
--   needle de N≥3        → exige N-1 (mínimo 2)
-- Sube el recall sin abrir la mano del todo; el orden por €/unidad + similarity
-- sigue eligiendo el mejor candidato. Si aparecen falsos positivos, el siguiente
-- dial es un suelo de similarity o el match semántico por embeddings (Fase 3).
create or replace function public.catalog_family_match(p_name text, p_needle text)
returns boolean language sql immutable as $$
  with words as (
    select w
    from unnest(string_to_array(coalesce(p_needle, ''), ' ')) as w
    where length(w) >= 3
  ),
  c as (
    select count(*) as total,
           count(*) filter (where p_name like '%' || w || '%') as present
    from words
  )
  select total > 0 and present >= least(total, greatest(2, total - 1))
  from c;
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
      and public.catalog_family_match(lower(m.display_name), q.needle)
    union all
    select 'esclat', b.id, b.display_name, b.thumbnail,
           b.unit_price, b.price_per_unit, b.price_per_unit_unit,
           similarity(q.needle, lower(b.display_name))
    from public.bonpreu_products b cross join q
    where 'esclat' = any (p_stores) and b.published
      and public.catalog_family_match(lower(b.display_name), q.needle)
    union all
    select 'carrefour', c.id, c.display_name, c.thumbnail,
           c.unit_price, c.price_per_unit, c.price_per_unit_unit,
           similarity(q.needle, lower(c.display_name))
    from public.carrefour_products c cross join q
    where 'carrefour' = any (p_stores) and c.published
      and public.catalog_family_match(lower(c.display_name), q.needle)
    union all
    select 'bonarea', n.id, n.display_name, n.thumbnail,
           n.unit_price, n.price_per_unit, n.price_per_unit_unit,
           similarity(q.needle, lower(n.display_name))
    from public.bonarea_products n cross join q
    where 'bonarea' = any (p_stores) and n.published
      and public.catalog_family_match(lower(n.display_name), q.needle)
    union all
    select 'consum', s.id, s.display_name, s.thumbnail,
           s.unit_price, s.price_per_unit, s.price_per_unit_unit,
           similarity(q.needle, lower(s.display_name))
    from public.consum_products s cross join q
    where 'consum' = any (p_stores) and s.published
      and public.catalog_family_match(lower(s.display_name), q.needle)
    union all
    select 'dia', d.id, d.display_name, d.thumbnail,
           d.unit_price, d.price_per_unit, d.price_per_unit_unit,
           similarity(q.needle, lower(d.display_name))
    from public.dia_products d cross join q
    where 'dia' = any (p_stores) and d.published
      and public.catalog_family_match(lower(d.display_name), q.needle)
    union all
    select 'sorli', o.id, o.display_name, o.thumbnail,
           o.unit_price, o.price_per_unit, o.price_per_unit_unit,
           similarity(q.needle, lower(o.display_name))
    from public.sorli_products o cross join q
    where 'sorli' = any (p_stores) and o.published
      and public.catalog_family_match(lower(o.display_name), q.needle)
    union all
    select 'eroski', e.id, e.display_name, e.thumbnail,
           e.unit_price, e.price_per_unit, e.price_per_unit_unit,
           similarity(q.needle, lower(e.display_name))
    from public.eroski_products e cross join q
    where 'eroski' = any (p_stores) and e.published
      and public.catalog_family_match(lower(e.display_name), q.needle)
    union all
    select 'caprabo', k.id, k.display_name, k.thumbnail,
           k.unit_price, k.price_per_unit, k.price_per_unit_unit,
           similarity(q.needle, lower(k.display_name))
    from public.caprabo_products k cross join q
    where 'caprabo' = any (p_stores) and k.published
      and public.catalog_family_match(lower(k.display_name), q.needle)
    union all
    select 'condis', n.id, n.display_name, n.thumbnail,
           n.unit_price, n.price_per_unit, n.price_per_unit_unit,
           similarity(q.needle, lower(n.display_name))
    from public.condis_products n cross join q
    where 'condis' = any (p_stores) and n.published
      and public.catalog_family_match(lower(n.display_name), q.needle)
    union all
    select 'ametller', a.id, a.display_name, a.thumbnail,
           a.unit_price, a.price_per_unit, a.price_per_unit_unit,
           similarity(q.needle, lower(a.display_name))
    from public.ametller_products a cross join q
    where 'ametller' = any (p_stores) and a.published
      and public.catalog_family_match(lower(a.display_name), q.needle)
    union all
    select 'aldi', l.id, l.display_name, l.thumbnail,
           l.unit_price, l.price_per_unit, l.price_per_unit_unit,
           similarity(q.needle, lower(l.display_name))
    from public.aldi_products l cross join q
    where 'aldi' = any (p_stores) and l.published
      and public.catalog_family_match(lower(l.display_name), q.needle)
    union all
    select 'hiperdino', h.id, h.display_name, h.thumbnail,
           h.unit_price, h.price_per_unit, h.price_per_unit_unit,
           similarity(q.needle, lower(h.display_name))
    from public.hiperdino_products h cross join q
    where 'hiperdino' = any (p_stores) and h.published
      and public.catalog_family_match(lower(h.display_name), q.needle)
    union all
    select 'alcampo', p.id, p.display_name, p.thumbnail,
           p.unit_price, p.price_per_unit, p.price_per_unit_unit,
           similarity(q.needle, lower(p.display_name))
    from public.alcampo_products p cross join q
    where 'alcampo' = any (p_stores) and p.published
      and public.catalog_family_match(lower(p.display_name), q.needle)
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
