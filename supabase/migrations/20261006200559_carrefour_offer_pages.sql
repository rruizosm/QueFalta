-- Additive read API. No catalogue writes and no changes to existing RPCs.
-- Matches src/lib/carrefourOffers.ts, including legacy and regional overrides.
create or replace function public.carrefour_offer_promotions_v1(
  p_source jsonb, p_legacy jsonb, p_today text
) returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare
  candidates jsonb;
  promo jsonb;
  result jsonb := '[]'::jsonb;
  label text;
  kind text;
  starts text;
  ends text;
begin
  if jsonb_typeof(p_source->'promotions') = 'array' then
    candidates := p_source->'promotions';
  else
    promo := coalesce(p_source, p_legacy);
    label := nullif(btrim(promo->>'promo_name'), '');
    if label ~* '^(air\s*fryer|innovaci[oó]n|novedad)$' then return result; end if;
    kind := case
      when label ~* '\y[2-9]\s*x\s*[1-9]\y' then 'multibuy'
      when label ~* '2[ªa]?\s*(ud|unidad)|segunda unidad' then 'second_unit'
      when label ~* '\yclub\y|cup[oó]n|tarjeta|acumul|socio' then 'club'
      when label ~* 'env[ií]o\s+gratis|portes\s+gratis' then 'shipping'
      when p_legacy->'strikethrough_price' <> 'null'::jsonb
        or label ~* 'descuento|rebajado|%' then 'discount'
      else null end;
    if kind is null or (p_source is not null and label is null) then return result; end if;
    candidates := jsonb_build_array(jsonb_build_object(
      'name', coalesce(label, 'Precio rebajado'), 'kind', kind,
      'text', promo->'promo_text', 'start', promo->'promo_start',
      'end', promo->'promo_end', 'link', null));
  end if;
  for promo in select value from jsonb_array_elements(candidates) loop
    if jsonb_typeof(promo->'name') <> 'string' then continue; end if;
    label := nullif(btrim(promo->>'name'), '');
    kind := promo->>'kind';
    if label is null or label ~* '^(air\s*fryer|innovaci[oó]n|novedad)$'
      or kind is null or kind not in ('multibuy','second_unit','discount','club','shipping')
      then continue; end if;
    starts := case when promo->>'start' ~ '^\d{4}-\d{2}-\d{2}($|T)'
      then left(promo->>'start', 10) end;
    ends := case when promo->>'end' ~ '^\d{4}-\d{2}-\d{2}($|T)'
      then left(promo->>'end', 10) end;
    if (starts is null or starts <= p_today) and (ends is null or ends >= p_today) then
      result := result || jsonb_build_array(promo);
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.carrefour_offer_page_v1(
  p_community text default null,
  p_today text default to_char(now() at time zone 'Europe/Madrid', 'YYYY-MM-DD'),
  p_limit integer default 50,
  p_cursor jsonb default null,
  p_tokens text[] default '{}',
  p_categories text[] default '{}',
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_sort text default 'name',
  p_types text[] default '{}',
  p_categories_only boolean default false
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with regional as (
    select p.id, p.display_name, p.display_name_norm, p.thumbnail, p.category_name,
      p.unit_price, p.price_format, p.price_per_unit, p.price_per_unit_unit,
      p.promo_name, p.promo_text, p.promo_start, p.promo_end, p.strikethrough_price,
      p.raw->'quefalta_offers' as base,
      case when jsonb_typeof(p.regional_prices->p_community) = 'object'
        then p.regional_prices->p_community end as regional
    from public.carrefour_products p
    where p.published
      and (p_community is null or p.regions is null or p.regions = '{}' or p_community = any(p.regions))
      and (coalesce(cardinality(p_categories), 0) = 0 or p.category_name = any(p_categories))
      and not exists (select 1 from unnest(p_tokens) token
        where p.display_name_norm not like '%' || token || '%')
  ), effective as (
    select r.*,
      coalesce((r.regional->>'p')::numeric, r.unit_price) as price,
      coalesce(r.regional->>'pf', r.price_format) as price_label,
      case when r.regional->>'ppu' is not null then (r.regional->>'ppu')::numeric
        else r.price_per_unit end as ppu,
      case when r.regional->>'ppu' is not null then r.regional->>'ppuu'
        else r.price_per_unit_unit end as ppu_unit,
      case when r.regional is not null then
        case when r.regional->'offers'->'version' = '1'::jsonb then r.regional->'offers' end
        else case when r.base->'version' = '1'::jsonb then r.base end end as source
    from regional r
  ), previous as (
    select e.*,
      case when coalesce(e.source->>'strikethrough_price',
        case when e.regional is null and e.source is null then e.strikethrough_price::text end)
        ~ '^\s*[+]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$'
      then coalesce(e.source->>'strikethrough_price', e.strikethrough_price::text)::numeric end as old_price
    from effective e
  ), resolved as materialized (
    select e.*,
      public.carrefour_offer_promotions_v1(e.source,
        jsonb_build_object(
          'promo_name', case when e.regional is null and e.source is null then e.promo_name end,
          'promo_text', case when e.regional is null and e.source is null then e.promo_text end,
          'promo_start', case when e.regional is null and e.source is null then e.promo_start end,
          'promo_end', case when e.regional is null and e.source is null then e.promo_end end,
          'strikethrough_price', case when e.old_price > e.price and e.price > 0 then e.old_price end),
        p_today) as promotions,
      case when e.ppu_unit is not null and e.ppu_unit <> '' then round(e.ppu, 2) end as unit_sort_price
    from previous e
    where (p_price_min is null or e.price > p_price_min)
      and (p_price_max is null or e.price <= p_price_max)
      -- Empty v1 arrays are explicit absence, never legacy fallback.
      and (case when jsonb_typeof(e.source->'promotions') = 'array'
        then jsonb_array_length(e.source->'promotions') > 0
        else e.source is not null or (e.regional is null and
          (e.promo_name is not null or e.strikethrough_price is not null)) end)
  ), live as (
    select r.*,
      case when p_sort like 'unit_%' then unit_sort_price else price end as sort_price
    from resolved r
    where jsonb_array_length(r.promotions) > 0
      and (coalesce(cardinality(p_types), 0) = 0 or exists (
        select 1 from jsonb_array_elements(r.promotions) promo where promo->>'kind' = any(p_types)))
  ), page as materialized (
    select l.* from live l
    where not p_categories_only and (p_cursor is null or p_cursor = 'null'::jsonb or
      case when p_sort = 'name' then
        (l.display_name_norm, l.id) > (p_cursor->>'name', p_cursor->>'id')
      else
        case when p_cursor->'name' = 'null'::jsonb then
          l.sort_price is null and l.id > p_cursor->>'id'
        else l.sort_price is null or
          (case when p_sort in ('price_desc','unit_desc') then l.sort_price < (p_cursor->>'name')::numeric
            else l.sort_price > (p_cursor->>'name')::numeric end)
          or (l.sort_price = (p_cursor->>'name')::numeric and l.id > p_cursor->>'id') end
      end)
    order by
      case when p_sort = 'name' then l.display_name_norm end asc,
      case when p_sort in ('price_asc','unit_asc') then l.sort_price end asc nulls last,
      case when p_sort in ('price_desc','unit_desc') then l.sort_price end desc nulls last,
      l.id asc
    limit greatest(1, least(coalesce(p_limit, 50), 200)) + 1
  ), numbered as (
    select p.*, row_number() over (order by
      case when p_sort = 'name' then p.display_name_norm end asc,
      case when p_sort in ('price_asc','unit_asc') then p.sort_price end asc nulls last,
      case when p_sort in ('price_desc','unit_desc') then p.sort_price end desc nulls last,
      p.id asc) as position from page p
  ), payload as (
    select n.position, jsonb_build_object(
      'id', n.id, 'display_name', n.display_name, 'thumbnail', n.thumbnail,
      'category_name', n.category_name, 'unit_price', n.price, 'price_format', n.price_label,
      'price_per_unit', n.ppu, 'price_per_unit_unit', n.ppu_unit,
      'quefalta_offers', jsonb_build_object('version', 1, 'promotions', n.promotions,
        'strikethrough_price', case when n.old_price > n.price and n.price > 0 then n.old_price end)
    ) as product,
    jsonb_build_object('id', n.id, 'name', case when p_sort = 'name'
      then to_jsonb(n.display_name_norm) else to_jsonb(n.sort_price) end) as cursor
    from numbered n where n.position <= greatest(1, least(coalesce(p_limit, 50), 200))
  )
  select case when p_categories_only then jsonb_build_object('categories', coalesce(
    (select jsonb_agg(category_name order by category_name) from
      (select distinct category_name from live where category_name is not null and category_name <> '') c), '[]'::jsonb))
  else jsonb_build_object('rows', coalesce((select jsonb_agg(product order by position) from payload), '[]'::jsonb),
    'nextCursor', case when (select count(*) from page) > greatest(1, least(coalesce(p_limit, 50), 200))
      then (select cursor from payload order by position desc limit 1) else null end) end;
$$;

revoke all on function public.carrefour_offer_promotions_v1(jsonb,jsonb,text) from public;
revoke all on function public.carrefour_offer_page_v1(text,text,integer,jsonb,text[],text[],numeric,numeric,text,text[],boolean) from public;
grant execute on function public.carrefour_offer_promotions_v1(jsonb,jsonb,text) to anon, authenticated, service_role;
grant execute on function public.carrefour_offer_page_v1(text,text,integer,jsonb,text[],text[],numeric,numeric,text,text[],boolean) to anon, authenticated, service_role;
