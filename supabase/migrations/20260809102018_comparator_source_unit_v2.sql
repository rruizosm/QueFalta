-- Comparador v2: obtiene la unidad canónica del producto origen en servidor y
-- solo devuelve candidatos con la misma base de precio. Convive con la RPC
-- antigua para no romper clientes publicados mientras la feature sigue apagada.

alter function public.catalog_clean_name(text)
  set search_path = pg_catalog, public, extensions;
alter function public.catalog_has_all_words(text, text)
  set search_path = pg_catalog, public, extensions;
alter function public.catalog_family_match(text, text)
  set search_path = pg_catalog, public, extensions;
alter function public.similar_products(text, text[])
  set search_path = pg_catalog, public, extensions;

create or replace function public.similar_products_v2(
  p_source_store text,
  p_source_id text,
  p_stores text[]
)
returns table (
  store text,
  id text,
  display_name text,
  thumbnail text,
  price_total numeric,
  price_per_unit numeric,
  price_per_unit_unit text,
  locked boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with source_product as (
    select 'mercadona'::text store, m.id::text id, m.display_name,
           m.price_per_unit_unit
    from public.mercadona_products m
    where p_source_store = 'mercadona' and m.id::text = p_source_id and m.published
    union all
    select 'esclat', b.id::text, b.display_name, b.price_per_unit_unit
    from public.bonpreu_products b
    where p_source_store = 'esclat' and b.id::text = p_source_id and b.published
    union all
    select 'carrefour', c.id::text, c.display_name, c.price_per_unit_unit
    from public.carrefour_products c
    where p_source_store = 'carrefour' and c.id::text = p_source_id and c.published
    union all
    select 'bonarea', n.id::text, n.display_name, n.price_per_unit_unit
    from public.bonarea_products n
    where p_source_store = 'bonarea' and n.id::text = p_source_id and n.published
    union all
    select 'consum', c.id::text, c.display_name, c.price_per_unit_unit
    from public.consum_products c
    where p_source_store = 'consum' and c.id::text = p_source_id and c.published
    union all
    select 'dia', d.id::text, d.display_name, d.price_per_unit_unit
    from public.dia_products d
    where p_source_store = 'dia' and d.id::text = p_source_id and d.published
    union all
    select 'sorli', s.id::text, s.display_name, s.price_per_unit_unit
    from public.sorli_products s
    where p_source_store = 'sorli' and s.id::text = p_source_id and s.published
    union all
    select 'eroski', e.id::text, e.display_name, e.price_per_unit_unit
    from public.eroski_products e
    where p_source_store = 'eroski' and e.id::text = p_source_id and e.published
    union all
    select 'caprabo', c.id::text, c.display_name, c.price_per_unit_unit
    from public.caprabo_products c
    where p_source_store = 'caprabo' and c.id::text = p_source_id and c.published
    union all
    select 'condis', c.id::text, c.display_name, c.price_per_unit_unit
    from public.condis_products c
    where p_source_store = 'condis' and c.id::text = p_source_id and c.published
    union all
    select 'ametller', a.id::text, a.display_name, a.price_per_unit_unit
    from public.ametller_products a
    where p_source_store = 'ametller' and a.id::text = p_source_id and a.published
    union all
    select 'aldi', a.id::text, a.display_name, a.price_per_unit_unit
    from public.aldi_products a
    where p_source_store = 'aldi' and a.id::text = p_source_id and a.published
    union all
    select 'hiperdino', h.id::text, h.display_name, h.price_per_unit_unit
    from public.hiperdino_products h
    where p_source_store = 'hiperdino' and h.id::text = p_source_id and h.published
    union all
    select 'alcampo', a.id::text, a.display_name, a.price_per_unit_unit
    from public.alcampo_products a
    where p_source_store = 'alcampo' and a.id::text = p_source_id and a.published
    union all
    select 'plusfresc', p.id::text, p.display_name, p.price_per_unit_unit
    from public.plusfresc_products p
    where p_source_store = 'plusfresc' and p.id::text = p_source_id and p.published
  ),
  source_valid as (
    select * from source_product
    where price_per_unit_unit in ('l', 'kg', 'ud')
  ),
  q as (
    select public.catalog_clean_name(display_name) needle,
           price_per_unit_unit source_unit
    from source_valid
  ),
  gate as (
    select public.paywall_enabled()
      and not public.is_premium(auth.uid()) as locked
  ),
  all_products as (
    select 'mercadona'::text store, m.id::text id, m.display_name, m.thumbnail,
           m.unit_price price_total, m.price_per_unit, m.price_per_unit_unit
    from public.mercadona_products m
    where 'mercadona' = any(p_stores) and p_source_store <> 'mercadona' and m.published
    union all
    select 'esclat', b.id::text, b.display_name, b.thumbnail,
           b.unit_price, b.price_per_unit, b.price_per_unit_unit
    from public.bonpreu_products b
    where 'esclat' = any(p_stores) and p_source_store <> 'esclat' and b.published
    union all
    select 'carrefour', c.id::text, c.display_name, c.thumbnail,
           c.unit_price, c.price_per_unit, c.price_per_unit_unit
    from public.carrefour_products c
    where 'carrefour' = any(p_stores) and p_source_store <> 'carrefour' and c.published
    union all
    select 'bonarea', n.id::text, n.display_name, n.thumbnail,
           n.unit_price, n.price_per_unit, n.price_per_unit_unit
    from public.bonarea_products n
    where 'bonarea' = any(p_stores) and p_source_store <> 'bonarea' and n.published
    union all
    select 'consum', c.id::text, c.display_name, c.thumbnail,
           c.unit_price, c.price_per_unit, c.price_per_unit_unit
    from public.consum_products c
    where 'consum' = any(p_stores) and p_source_store <> 'consum' and c.published
    union all
    select 'dia', d.id::text, d.display_name, d.thumbnail,
           d.unit_price, d.price_per_unit, d.price_per_unit_unit
    from public.dia_products d
    where 'dia' = any(p_stores) and p_source_store <> 'dia' and d.published
    union all
    select 'sorli', s.id::text, s.display_name, s.thumbnail,
           s.unit_price, s.price_per_unit, s.price_per_unit_unit
    from public.sorli_products s
    where 'sorli' = any(p_stores) and p_source_store <> 'sorli' and s.published
    union all
    select 'eroski', e.id::text, e.display_name, e.thumbnail,
           e.unit_price, e.price_per_unit, e.price_per_unit_unit
    from public.eroski_products e
    where 'eroski' = any(p_stores) and p_source_store <> 'eroski' and e.published
    union all
    select 'caprabo', c.id::text, c.display_name, c.thumbnail,
           c.unit_price, c.price_per_unit, c.price_per_unit_unit
    from public.caprabo_products c
    where 'caprabo' = any(p_stores) and p_source_store <> 'caprabo' and c.published
    union all
    select 'condis', c.id::text, c.display_name, c.thumbnail,
           c.unit_price, c.price_per_unit, c.price_per_unit_unit
    from public.condis_products c
    where 'condis' = any(p_stores) and p_source_store <> 'condis' and c.published
    union all
    select 'ametller', a.id::text, a.display_name, a.thumbnail,
           a.unit_price, a.price_per_unit, a.price_per_unit_unit
    from public.ametller_products a
    where 'ametller' = any(p_stores) and p_source_store <> 'ametller' and a.published
    union all
    select 'aldi', a.id::text, a.display_name, a.thumbnail,
           a.unit_price, a.price_per_unit, a.price_per_unit_unit
    from public.aldi_products a
    where 'aldi' = any(p_stores) and p_source_store <> 'aldi' and a.published
    union all
    select 'hiperdino', h.id::text, h.display_name, h.thumbnail,
           h.unit_price, h.price_per_unit, h.price_per_unit_unit
    from public.hiperdino_products h
    where 'hiperdino' = any(p_stores) and p_source_store <> 'hiperdino' and h.published
    union all
    select 'alcampo', a.id::text, a.display_name, a.thumbnail,
           a.unit_price, a.price_per_unit, a.price_per_unit_unit
    from public.alcampo_products a
    where 'alcampo' = any(p_stores) and p_source_store <> 'alcampo' and a.published
    union all
    select 'plusfresc', p.id::text, p.display_name, p.thumbnail,
           p.unit_price, p.price_per_unit, p.price_per_unit_unit
    from public.plusfresc_products p
    where 'plusfresc' = any(p_stores) and p_source_store <> 'plusfresc' and p.published
  ),
  candidates as (
    select p.*,
           public.similarity(q.needle, lower(p.display_name)) sim
    from all_products p
    cross join q
    where p.price_per_unit is not null
      and p.price_per_unit_unit = q.source_unit
      and public.catalog_family_match(lower(p.display_name), q.needle)
  ),
  ranked as (
    select *, min(price_per_unit) over (partition by store) min_ppu
    from candidates
  )
  select distinct on (r.store)
    r.store,
    case when g.locked then null else r.id end,
    case when g.locked then null else r.display_name end,
    case when g.locked then null else r.thumbnail end,
    case when g.locked then null else r.price_total end,
    case when g.locked then null else r.price_per_unit end,
    case when g.locked then null else r.price_per_unit_unit end,
    g.locked
  from ranked r
  cross join gate g
  order by
    r.store,
    (r.price_per_unit > r.min_ppu * 1.05),
    r.price_total asc nulls last,
    r.price_per_unit asc,
    r.sim desc;
$$;

revoke all on function public.similar_products_v2(text, text, text[]) from public;
grant execute on function public.similar_products_v2(text, text, text[])
  to anon, authenticated;
