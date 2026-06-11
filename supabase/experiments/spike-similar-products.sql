-- ─────────────────────────────────────────────────────────────────────────────
-- SPIKE (Fase 0 de COMPARATIVA.md) — Validar el matching de "producto similar".
-- NO es esquema de producción: funciones de PRUEBA para el SQL Editor. Read-only;
-- la RLS de los espejos ya permite SELECT. Borrables al acabar (DROP al final).
--
-- DECISIÓN (Fase 0): se muestra el EQUIVALENTE MÁS BARATO por €/unidad de la
-- familia. Pipeline (rev. 4):
--   1. FILTRO DE FAMILIA = TODAS las palabras del núcleo presentes en el nombre
--      (no solo una) → "leche entera" exige "leche" Y "entera". Esto echa fuera
--      "café con leche", "leche perro", "gel de leche y miel"… (bug rev. 3).
--   2. orden por €/unidad ASC → el más barato arriba.
--   3. desempates: similarity(nombre) DESC, luego unit_price ASC (pack más chico).
--
-- ⚠️ OJO con las UNIDADES: parse_eur saca el número pero NO la base (€/ml vs €/l
--    vs €/kg vs €/ud). Mezclarlas al ordenar miente (un gel a 0,01 €/ml parece más
--    barato que leche a 0,96 €/l). Dentro de una familia limpia suelen coincidir,
--    pero la normalización a base canónica (€/L, €/kg) es trabajo de Fase 1a.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_trgm;

-- Limpia el nombre del producto ORIGEN ("needle"): minúsculas, fuera marca y
-- tokens de tamaño, colapsa espacios. Solo se aplica al needle, NO a los candidatos.
create or replace function public.catalog_clean_name(p text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      btrim(
        regexp_replace(
          regexp_replace(
            lower(coalesce(p, '')),
            '\y(hacendado|bonpreu|bon[àa]rea|carrefour|deliplus|aliada|bosque\s+verde)\y',
            ' ', 'g'
          ),
          '\y\d+([.,]\d+)?\s*(kg|g|gr|ml|cl|l|ud|uds|u|pack|x)\y',
          ' ', 'g'
        )
      ),
      '\s+', ' ', 'g'
    ),
    ''
  );
$$;

-- FILTRO DE FAMILIA: ¿están TODAS las palabras (≥3 letras) del needle en el nombre?
-- Independiente del orden y admite palabras en medio. Caller pasa el nombre en
-- minúsculas; el needle ya viene en minúsculas de catalog_clean_name.
create or replace function public.name_has_all_words(p_name text, p_needle text)
returns boolean language sql immutable as $$
  select coalesce(bool_and(p_name like '%' || w || '%'), false)
  from unnest(string_to_array(coalesce(p_needle, ''), ' ')) as w
  where length(w) >= 3;
$$;

-- Saca el primer número de un texto de precio. "1,17 €/l" → 1.17, "2.47 EUR/litre"
-- → 2.47, "0,94 €" → 0.94. (best-effort; NO interpreta la base €/ml vs €/l: rev. 3)
create or replace function public.parse_eur(t text)
returns numeric language sql immutable as $$
  select substring(replace(coalesce(t, ''), ',', '.') from '[0-9]+\.?[0-9]*')::numeric;
$$;

drop function if exists public.spike_similar(text, text[], real, int);

create or replace function public.spike_similar(
  p_query     text,
  p_stores    text[] default array['mercadona', 'esclat', 'carrefour', 'bonarea'],
  p_threshold real    default 0.30,  -- piso suave de word_similarity (2º filtro)
  p_per_store int     default 3
)
returns table (
  store        text,
  id           text,
  display_name text,
  eur_unit     numeric,  -- €/unidad parseado → ORDENA (asc = más barato)
  price_info   text,     -- texto original de precio/unidad (incluye la base)
  unit_price   numeric,  -- precio total (desempate: pack más pequeño)
  sim          real      -- cercanía de nombre (desempate)
)
language sql stable as $$
  with q as (select public.catalog_clean_name(p_query) as needle)
  select * from (
    select 'mercadona'::text as store, m.id, m.display_name,
           (m.raw #>> '{price_instructions,reference_price}')::numeric as eur_unit,
           coalesce(m.raw #>> '{price_instructions,reference_format}', m.packaging) as price_info,
           m.unit_price,
           similarity(q.needle, lower(m.display_name)) as sim
    from public.mercadona_products m cross join q
    where 'mercadona' = any (p_stores) and m.published
      and public.name_has_all_words(lower(m.display_name), q.needle)
      and word_similarity(q.needle, m.display_name) >= p_threshold
    order by eur_unit asc nulls last, sim desc, m.unit_price asc nulls last
    limit p_per_store
  ) a
  union all
  select * from (
    select 'esclat'::text as store, b.id, b.display_name,
           public.parse_eur(b.price_format) as eur_unit,
           b.price_format as price_info, b.unit_price,
           similarity(q.needle, lower(b.display_name)) as sim
    from public.bonpreu_products b cross join q
    where 'esclat' = any (p_stores) and b.published
      and public.name_has_all_words(lower(b.display_name), q.needle)
      and word_similarity(q.needle, b.display_name) >= p_threshold
    order by eur_unit asc nulls last, sim desc, b.unit_price asc nulls last
    limit p_per_store
  ) b
  union all
  select * from (
    -- Carrefour: hoy raw->>'price_per_unit' suele venir NULL → eur_unit null →
    -- cae al final del orden. Es el HUECO que arregla su sync en Fase 1a.
    select 'carrefour'::text as store, c.id, c.display_name,
           public.parse_eur(c.raw ->> 'price_per_unit') as eur_unit,
           c.price_format as price_info, c.unit_price,
           similarity(q.needle, lower(c.display_name)) as sim
    from public.carrefour_products c cross join q
    where 'carrefour' = any (p_stores) and c.published
      and public.name_has_all_words(lower(c.display_name), q.needle)
      and word_similarity(q.needle, c.display_name) >= p_threshold
    order by eur_unit asc nulls last, sim desc, c.unit_price asc nulls last
    limit p_per_store
  ) c
  union all
  select * from (
    select 'bonarea'::text as store, n.id, n.display_name,
           public.parse_eur(n.raw ->> 'unitPrice') as eur_unit,
           (n.raw ->> 'unitPrice') as price_info, n.unit_price,
           similarity(q.needle, lower(n.display_name)) as sim
    from public.bonarea_products n cross join q
    where 'bonarea' = any (p_stores) and n.published
      and public.name_has_all_words(lower(n.display_name), q.needle)
      and word_similarity(q.needle, n.display_name) >= p_threshold
    order by eur_unit asc nulls last, sim desc, n.unit_price asc nulls last
    limit p_per_store
  ) n
  order by store, eur_unit asc nulls last, sim desc;
$$;

-- ─── Cómo probarlo ───────────────────────────────────────────────────────────
-- 1) Familia limpia, ordenada por €/unidad:
--    select * from public.spike_similar('leche entera');
--    -- Ahora NO deben salir "café con leche", "leche perro" ni geles.
--
-- 2) Top-1 por tienda (lo que mostrará la UI): el más barato de cada super.
--    select distinct on (store) store, display_name, eur_unit, price_info, unit_price
--    from public.spike_similar('leche entera')
--    order by store, eur_unit asc nulls last, sim desc;
--
-- 3) FLUJO REAL — dado un producto, sus parecidos más baratos en las OTRAS tiendas:
--    select s.* from public.mercadona_products m
--    cross join lateral public.spike_similar(m.display_name,
--                 array['esclat','carrefour','bonarea']) s
--    where m.id = '<id-de-mercadona_products>';
--
-- 4) Validación: ~20 productos. Vigila 2 cosas:
--    (a) ¿el top-1 por tienda es de la MISMA familia? (precisión del filtro)
--    (b) ¿el más barato tiene la MISMA base de unidad? (si ves €/ml mezclado con
--        €/l, anótalo: lo arregla la normalización de Fase 1a).

-- ─── Limpieza tras el spike ──────────────────────────────────────────────────
-- drop function if exists public.spike_similar(text, text[], real, int);
-- drop function if exists public.parse_eur(text);
-- drop function if exists public.name_has_all_words(text, text);
-- drop function if exists public.catalog_clean_name(text);
