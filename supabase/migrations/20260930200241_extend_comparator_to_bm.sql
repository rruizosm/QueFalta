-- BM: una identidad semántica por producto y precio/disponibilidad resueltos
-- contra el catálogo provincial del código postal del perfil.
set lock_timeout = '5s';
set statement_timeout = '120s';

alter table public.catalog_product_embeddings
  drop constraint catalog_product_embeddings_store_check,
  add constraint catalog_product_embeddings_store_check check (
    store = any(array['alcampo','aldi','ametller','ahorramas','bm','bonarea','caprabo',
      'carrefour','condis','consum','dia','eroski','esclat','froiz','gadis',
      'hiperdino','lidl','mercadona','plusfresc','sorli']::text[])
  ) not valid;

alter table public.catalog_product_match_cache_status
  drop constraint catalog_product_match_cache_status_target_store_check,
  add constraint catalog_product_match_cache_status_target_store_check check (
    target_store = any(array['alcampo','aldi','ametller','ahorramas','bm','bonarea','caprabo',
      'carrefour','condis','consum','dia','eroski','esclat','froiz','gadis',
      'hiperdino','lidl','mercadona','plusfresc','sorli']::text[])
  ) not valid;

-- El lateral aporta metadatos de unidad de una ubicación viva, nunca un
-- precio nacional. El precio se resuelve más tarde para el perfil autenticado.
create or replace view public.bm_comparator_products
with (security_invoker = true) as
select
  product.id,
  product.display_name,
  product.brand,
  product.packaging,
  product.ean,
  product.category_name,
  metadata.price_per_unit_unit,
  product.published
from public.bm_products as product
cross join lateral (
  select price.price_per_unit_unit
  from public.catalog_location_prices as price
  join public.bm_locations as location
    on location.id = price.location_id
   and location.enabled
   and location.published
  where price.store = 'bm'
    and price.product_id = product.id
    and price.published
    and price.available
    and price.unit_price > 0
  order by price.location_id
  limit 1
) as metadata
where product.published;

revoke all on public.bm_comparator_products from public, anon, authenticated;
grant select on public.bm_comparator_products to service_role;

insert into comparator_internal.catalog_match_store_versions(store, generation, updated_at)
values ('bm', 1, now())
on conflict (store) do nothing;

-- Mantiene en SQL el mismo mapeo provincial que bmReferencePostalCode() en el
-- cliente. Solo devuelve una ubicación preferida, habilitada y publicada.
create or replace function comparator_internal.bm_profile_location_id_v1()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select postal_location.location_id
  from public.profiles as profile
  join public.bm_postal_locations as postal_location
    on postal_location.postal_code = case left(
      pg_catalog.regexp_replace(coalesce(profile.postal_code, ''), '\D', '', 'g'),
      2
    )
      when '01' then '01001'
      when '20' then '20009'
      when '26' then '26001'
      when '28' then '28008'
      when '31' then '31001'
      when '39' then '39001'
      when '48' then '48009'
      else null
    end
   and postal_location.is_preferred
   and postal_location.enabled
  join public.bm_locations as location
    on location.id = postal_location.location_id
   and location.enabled
   and location.published
  where profile.id = (select auth.uid())
  limit 1
$function$;

revoke all on function comparator_internal.bm_profile_location_id_v1()
  from public, anon;
grant execute on function comparator_internal.bm_profile_location_id_v1()
  to authenticated, service_role;

comment on function comparator_internal.bm_profile_location_id_v1() is
  'Preferred BM catalog location for the authenticated profile postal-code province.';

create or replace function public.catalog_public_product_v1(
  p_store text,
  p_product_id text
)
returns table(
  store text,
  id text,
  display_name text,
  thumbnail text,
  price_total numeric,
  price_per_unit numeric,
  price_per_unit_unit text
)
language sql
stable
set search_path = ''
as $function$
  select 'mercadona', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.mercadona_products p where p_store = 'mercadona' and p.id = p_product_id and p.published
  union all
  select 'esclat', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.bonpreu_products p where p_store = 'esclat' and p.id = p_product_id and p.published
  union all
  select 'carrefour', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.carrefour_products p where p_store = 'carrefour' and p.id = p_product_id and p.published
  union all
  select 'bonarea', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.bonarea_products p where p_store = 'bonarea' and p.id = p_product_id and p.published
  union all
  select 'consum', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.consum_products p where p_store = 'consum' and p.id = p_product_id and p.published
  union all
  select 'dia', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.dia_products p where p_store = 'dia' and p.id = p_product_id and p.published
  union all
  select 'sorli', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.sorli_products p where p_store = 'sorli' and p.id = p_product_id and p.published
  union all
  select 'eroski', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.eroski_products p where p_store = 'eroski' and p.id = p_product_id and p.published
  union all
  select 'caprabo', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.caprabo_products p where p_store = 'caprabo' and p.id = p_product_id and p.published
  union all
  select 'condis', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.condis_products p where p_store = 'condis' and p.id = p_product_id and p.published
  union all
  select 'ametller', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.ametller_products p where p_store = 'ametller' and p.id = p_product_id and p.published
  union all
  select 'aldi', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.aldi_products p where p_store = 'aldi' and p.id = p_product_id and p.published
  union all
  select 'hiperdino', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.hiperdino_products p where p_store = 'hiperdino' and p.id = p_product_id and p.published
  union all
  select 'alcampo', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.alcampo_products p where p_store = 'alcampo' and p.id = p_product_id and p.published
  union all
  select 'plusfresc', p.id, p.display_name, p.thumbnail, p.unit_price, p.price_per_unit, lower(p.price_per_unit_unit)
  from public.plusfresc_products p where p_store = 'plusfresc' and p.id = p_product_id and p.published
  union all
  select 'gadis', p.id, p.display_name, p.thumbnail, p.unit_price, reference.price_per_unit, reference.canonical_unit
  from public.gadis_products p
  cross join lateral comparator_internal.catalog_reference_price_v1(
    p.display_name, p.packaging, p.price_per_unit, p.price_per_unit_unit
  ) as reference
  where p_store = 'gadis' and p.id = p_product_id and p.published
  union all
  select 'froiz', p.id, p.display_name, p.thumbnail, p.unit_price, reference.price_per_unit, reference.canonical_unit
  from public.froiz_products p
  cross join lateral comparator_internal.catalog_reference_price_v1(
    p.display_name, null, p.price_per_unit, p.price_per_unit_unit
  ) as reference
  where p_store = 'froiz' and p.id = p_product_id and p.published
  union all
  select 'ahorramas', p.id, p.display_name, p.thumbnail, p.unit_price, reference.price_per_unit, reference.canonical_unit
  from public.ahorramas_products p
  cross join lateral comparator_internal.catalog_reference_price_v1(
    p.display_name, p.packaging, p.price_per_unit, p.price_per_unit_unit
  ) as reference
  where p_store = 'ahorramas' and p.id = p_product_id and p.published
  union all
  select 'lidl', m.id, m.display_name, m.thumbnail,
         price.effective_total,
         case when sp.unit_price > 0 then sp.price_per_unit * price.effective_total / sp.unit_price end,
         lower(sp.price_per_unit_unit)
  from public.profiles profile
  join public.lidl_store_products sp on sp.store_id = profile.lidl_store_id
  join public.lidl_product_master m on m.id = sp.product_id
  cross join lateral (
    select case
      when sp.promo_name is not null and sp.promo_price > 0
        and (sp.promo_start is null or sp.promo_start <= (now() at time zone 'Europe/Madrid')::date)
        and (sp.promo_end is null or sp.promo_end >= (now() at time zone 'Europe/Madrid')::date)
        and concat_ws(' ', sp.promo_name, sp.promo_text) !~* '\m[0-9]+\s*[x×]\s*[0-9]+([.,][0-9]+)?'
        and concat_ws(' ', sp.promo_name, sp.promo_text) !~* '\mcompra\s+m[ií]n(imo|\.)?\s*[0-9]+'
      then sp.promo_price else sp.unit_price end as effective_total
  ) price
  where p_store = 'lidl' and m.id = p_product_id
    and profile.id = (select auth.uid())
    and public.is_premium(profile.id)
    and m.published and sp.published and sp.available
    and sp.price_per_unit > 0 and lower(sp.price_per_unit_unit) in ('kg','l','ud')
    and price.effective_total > 0
  union all
  select 'bm', product.id, product.display_name, product.thumbnail,
         location_price.unit_price,
         location_price.price_per_unit,
         lower(location_price.price_per_unit_unit)
  from public.bm_products as product
  join public.catalog_location_prices as location_price
    on location_price.store = 'bm'
   and location_price.product_id = product.id
   and location_price.location_id = comparator_internal.bm_profile_location_id_v1()
  where p_store = 'bm'
    and product.id = p_product_id
    and product.published
    and location_price.published
    and location_price.available
    and location_price.unit_price > 0
    and location_price.price_per_unit > 0
    and lower(location_price.price_per_unit_unit) in ('kg','l','ud');
$function$;

revoke all on function public.catalog_public_product_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.catalog_public_product_v1(text, text)
  to service_role;

-- Extiende el motor vigente sin duplicar su ruta para las 19 cadenas actuales.
-- v5 sigue resolviendo cualquier origen (incluido BM) contra esas cadenas; esta
-- capa añade BM como destino y conserva exactamente el mismo contrato de salida.
create or replace function comparator_internal.catalog_cheaper_products_v6(
  p_source_store text,
  p_source_product_id text,
  p_stores text[]
)
returns table(
  store text,
  id text,
  display_name text,
  thumbnail text,
  price_total numeric,
  price_per_unit numeric,
  price_per_unit_unit text,
  match_kind text,
  match_score real,
  vector_score real,
  lexical_score real,
  quantity_ratio numeric,
  is_cheaper boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_match_version constant text := 'embedding_hybrid_v3_0_60';
  v_source record;
  v_target_generation bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_source_store = 'bm' and not exists (
    select 1 from public.catalog_public_product_v1(p_source_store, p_source_product_id)
  ) then
    return;
  end if;

  return query
  select legacy.*
  from comparator_internal.catalog_cheaper_products_v5(
    p_source_store,
    p_source_product_id,
    pg_catalog.array_remove(coalesce(p_stores, array[]::text[]), 'bm')
  ) as legacy;

  if p_source_store = 'bm'
    or not ('bm' = any(coalesce(p_stores, array[]::text[])))
    or comparator_internal.bm_profile_location_id_v1() is null
  then
    return;
  end if;

  select source.content_hash, source.embedded_at
  into v_source
  from public.catalog_product_embeddings as source
  where source.store = p_source_store
    and source.product_id = p_source_product_id
    and source.published
    and source.embedding is not null
    and source.embedded_at is not null
    and coalesce(
      source.embedded_content_hash,
      source.embedding_input_hash,
      source.content_hash
    ) = coalesce(source.embedding_input_hash, source.content_hash);

  if not found then
    return;
  end if;

  select version.generation
  into v_target_generation
  from comparator_internal.catalog_match_store_versions as version
  where version.store = 'bm';

  if not exists (
    select 1
    from public.catalog_product_match_cache_status as status
    where status.source_store = p_source_store
      and status.source_product_id = p_source_product_id
      and status.target_store = 'bm'
      and status.match_version = v_match_version
      and status.source_content_hash = v_source.content_hash
      and status.source_embedded_at = v_source.embedded_at
      and status.target_generation = coalesce(v_target_generation, 1)
  ) then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        p_source_store || ':' || p_source_product_id || ':bm:' || v_match_version,
        0
      )
    );

    select version.generation
    into v_target_generation
    from comparator_internal.catalog_match_store_versions as version
    where version.store = 'bm';

    if not exists (
      select 1
      from public.catalog_product_match_cache_status as status
      where status.source_store = p_source_store
        and status.source_product_id = p_source_product_id
        and status.target_store = 'bm'
        and status.match_version = v_match_version
        and status.source_content_hash = v_source.content_hash
        and status.source_embedded_at = v_source.embedded_at
        and status.target_generation = coalesce(v_target_generation, 1)
    ) then
      perform comparator_internal.refresh_catalog_match_cache_pair_v3(
        p_source_store,
        p_source_product_id,
        'bm'
      );
    end if;
  end if;

  return query
  with source_embedding as (
    select source.display_name, source.category
    from public.catalog_product_embeddings as source
    where source.store = p_source_store
      and source.product_id = p_source_product_id
      and source.published
      and source.embedding is not null
      and coalesce(
        source.embedded_content_hash,
        source.embedding_input_hash,
        source.content_hash
      ) = coalesce(source.embedding_input_hash, source.content_hash)
  ),
  source_price as (
    select case
      when source.store = any(array['caprabo','eroski','hiperdino'])
        then source.price_total
      else source.price_per_unit
    end as comparison_price
    from public.catalog_public_product_v1(
      p_source_store,
      p_source_product_id
    ) as source
  ),
  compatible as (
    select
      match.target_store,
      match.target_product_id,
      match.relation,
      match.confidence,
      match.vector_score,
      match.lexical_score,
      nullif(match.evidence ->> 'quantity_ratio', '')::numeric as quantity_ratio,
      detail.display_name,
      detail.thumbnail,
      detail.price_total,
      detail.price_per_unit,
      detail.price_per_unit_unit
    from source_embedding as source
    join public.catalog_product_matches as match
      on match.source_store = p_source_store
     and match.source_product_id = p_source_product_id
     and match.target_store = 'bm'
     and match.match_version = v_match_version
     and match.relation in ('identico', 'comparable')
     and match.review_decision is distinct from 'rechazado'
    join public.catalog_product_embeddings as target
      on target.store = match.target_store
     and target.product_id = match.target_product_id
     and target.published
     and target.embedding is not null
     and coalesce(
       target.embedded_content_hash,
       target.embedding_input_hash,
       target.content_hash
     ) = coalesce(target.embedding_input_hash, target.content_hash)
    cross join lateral public.catalog_public_product_v1(
      match.target_store,
      match.target_product_id
    ) as detail
    where match.relation = 'identico'
       or match.review_decision = 'aprobado'
       or public.catalog_product_identity_compatible_v1(
         source.display_name,
         source.category,
         target.display_name,
         target.category
       )
  ),
  ranked as (
    select
      compatible.*,
      row_number() over (
        order by
          compatible.price_per_unit asc nulls last,
          compatible.price_total asc nulls last,
          (compatible.relation = 'identico') desc,
          compatible.confidence desc,
          compatible.target_product_id
      ) as store_rank
    from compatible
  )
  select
    ranked.target_store,
    ranked.target_product_id,
    ranked.display_name,
    ranked.thumbnail,
    ranked.price_total,
    ranked.price_per_unit,
    ranked.price_per_unit_unit,
    case when ranked.relation = 'identico' then 'exact_gtin' else 'semantic' end,
    ranked.confidence,
    ranked.vector_score,
    ranked.lexical_score,
    ranked.quantity_ratio,
    coalesce(ranked.price_per_unit < source_price.comparison_price, false)
  from ranked
  cross join source_price
  where ranked.store_rank <= 2
  order by ranked.store_rank;
end;
$function$;

revoke all on function comparator_internal.catalog_cheaper_products_v6(text, text, text[])
  from public, anon;
grant execute on function comparator_internal.catalog_cheaper_products_v6(text, text, text[])
  to authenticated, service_role;

create or replace function public.catalog_cheaper_products_v7(
  p_source_store text,
  p_source_product_id text,
  p_stores text[],
  p_language text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  entitlement record;
  matches jsonb;
begin
  select * into entitlement
  from private.claim_free_comparator_use();

  if not entitlement.allowed then
    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'results', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(result) || jsonb_build_object(
        'display_name',
        coalesce(
          comparator_internal.catalog_localized_product_name_v1(
            result.store,
            result.id,
            p_language
          ),
          result.display_name
        )
      )
    ),
    '[]'::jsonb
  )
  into matches
  from comparator_internal.catalog_cheaper_products_v6(
    p_source_store,
    p_source_product_id,
    p_stores
  ) as result;

  return jsonb_build_object(
    'allowed', true,
    'remaining', entitlement.remaining,
    'results', matches
  );
end
$function$;

alter function public.catalog_cheaper_products_v7(text, text, text[], text)
  set statement_timeout = '60s';

revoke all on function public.catalog_cheaper_products_v7(text, text, text[], text)
  from public, anon;
grant execute on function public.catalog_cheaper_products_v7(text, text, text[], text)
  to authenticated, service_role;

comment on function public.catalog_cheaper_products_v7(text, text, text[], text) is
  'Savings Radar v7 with profile-local BM prices, localized names and atomic free-tier allowance.';

alter table public.catalog_product_embeddings
  validate constraint catalog_product_embeddings_store_check;
alter table public.catalog_product_match_cache_status
  validate constraint catalog_product_match_cache_status_target_store_check;

notify pgrst, 'reload schema';
