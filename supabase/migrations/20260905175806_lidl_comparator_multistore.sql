-- Lidl: una identidad semántica por producto y precio resuelto por perfil.
-- Conserva el contrato v7, los hashes vigentes y las reglas del motor existente.
set lock_timeout = '5s';
set statement_timeout = '60s';

alter table public.catalog_product_embeddings
  drop constraint catalog_product_embeddings_store_check,
  add constraint catalog_product_embeddings_store_check check (
    store = any(array['alcampo','aldi','ametller','ahorramas','bonarea','caprabo',
      'carrefour','condis','consum','dia','eroski','esclat','froiz','gadis',
      'hiperdino','lidl','mercadona','plusfresc','sorli']::text[])
  ) not valid;
alter table public.catalog_product_match_cache_status
  drop constraint catalog_product_match_cache_status_target_store_check,
  add constraint catalog_product_match_cache_status_target_store_check check (
    target_store = any(array['alcampo','aldi','ametller','ahorramas','bonarea','caprabo',
      'carrefour','condis','consum','dia','eroski','esclat','froiz','gadis',
      'hiperdino','lidl','mercadona','plusfresc','sorli']::text[])
  ) not valid;

-- El lateral selecciona únicamente metadatos, nunca un precio nacional.
-- Filtra también los masters cuyo último surtido publicado haya desaparecido.
create or replace view public.lidl_comparator_products
with (security_invoker = true) as
select m.id, m.display_name, m.brand, m.packaging, m.ean,
       metadata.category_name, metadata.price_per_unit_unit, m.published
from public.lidl_product_master m
cross join lateral (
  select sp.category_name, sp.price_per_unit_unit
  from public.lidl_store_products sp
  where sp.product_id = m.id and sp.published
  order by sp.store_id
  limit 1
) metadata
where m.published;
revoke all on public.lidl_comparator_products from public, anon, authenticated;
grant select on public.lidl_comparator_products to service_role;

insert into comparator_internal.catalog_match_store_versions(store,generation,updated_at)
values ('lidl',1,now()) on conflict (store) do nothing;

CREATE OR REPLACE FUNCTION public.catalog_public_product_v1(p_store text, p_product_id text)
 RETURNS TABLE(store text, id text, display_name text, thumbnail text, price_total numeric, price_per_unit numeric, price_per_unit_unit text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
    and price.effective_total > 0;
$function$
;
CREATE OR REPLACE FUNCTION comparator_internal.catalog_cheaper_products_v3(p_source_store text, p_source_product_id text, p_stores text[])
 RETURNS TABLE(store text, id text, display_name text, thumbnail text, price_total numeric, price_per_unit numeric, price_per_unit_unit text, match_kind text, match_score real, vector_score real, lexical_score real, quantity_ratio numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_match_version constant text := 'embedding_hybrid_v3_0_60';
  v_source record;
  v_requested record;
  v_target_generation bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
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

  for v_requested in
    select requested.store, min(requested.ordinality) as store_order
    from unnest(coalesce(p_stores, array[]::text[])) with ordinality
      as requested(store, ordinality)
    where requested.store = any (array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc',
      'gadis','froiz','ahorramas','lidl'
    ])
      and requested.store <> p_source_store
    group by requested.store
    order by min(requested.ordinality)
  loop
    select version.generation
    into v_target_generation
    from comparator_internal.catalog_match_store_versions as version
    where version.store = v_requested.store;

    if not exists (
      select 1
      from public.catalog_product_match_cache_status as status
      where status.source_store = p_source_store
        and status.source_product_id = p_source_product_id
        and status.target_store = v_requested.store
        and status.match_version = v_match_version
        and status.source_content_hash = v_source.content_hash
        and status.source_embedded_at = v_source.embedded_at
        and status.target_generation = coalesce(v_target_generation, 1)
    ) then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          p_source_store || ':' || p_source_product_id || ':' || v_requested.store || ':' || v_match_version,
          0
        )
      );

      select version.generation
      into v_target_generation
      from comparator_internal.catalog_match_store_versions as version
      where version.store = v_requested.store;

      if not exists (
        select 1
        from public.catalog_product_match_cache_status as status
        where status.source_store = p_source_store
          and status.source_product_id = p_source_product_id
          and status.target_store = v_requested.store
          and status.match_version = v_match_version
          and status.source_content_hash = v_source.content_hash
          and status.source_embedded_at = v_source.embedded_at
          and status.target_generation = coalesce(v_target_generation, 1)
      ) then
        perform comparator_internal.refresh_catalog_match_cache_pair_v3(
          p_source_store,
          p_source_product_id,
          v_requested.store
        );
      end if;
    end if;
  end loop;

  return query
  with requested_stores as (
    select requested.store, min(requested.ordinality) as store_order
    from unnest(coalesce(p_stores, array[]::text[])) with ordinality
      as requested(store, ordinality)
    where requested.store = any (array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc',
      'gadis','froiz','ahorramas','lidl'
    ])
      and requested.store <> p_source_store
    group by requested.store
  ),
  cached as (
    select
      requested.store_order,
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
    from requested_stores as requested
    join public.catalog_product_matches as match
      on match.source_store = p_source_store
     and match.source_product_id = p_source_product_id
     and match.target_store = requested.store
     and match.match_version = v_match_version
     and match.relation in ('identico', 'comparable')
     and match.review_decision is distinct from 'rechazado'
    cross join lateral public.catalog_public_product_v1(
      match.target_store,
      match.target_product_id
    ) as detail
  ),
  ranked as (
    select
      cached.*,
      row_number() over (
        partition by cached.target_store
        order by
          case
            when cached.target_store = any (array['caprabo','eroski','hiperdino'])
              then cached.price_total
            else cached.price_per_unit
          end asc nulls last,
          case
            when cached.target_store = any (array['caprabo','eroski','hiperdino'])
              then null
            else cached.price_total
          end asc nulls last,
          (cached.relation = 'identico') desc,
          cached.confidence desc,
          cached.target_product_id
      ) as store_rank
    from cached
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
    ranked.quantity_ratio
  from ranked
  where ranked.store_rank <= 2
  order by ranked.store_order, ranked.store_rank;
end;
$function$
;

CREATE OR REPLACE FUNCTION comparator_internal.catalog_cheaper_products_v5(p_source_store text, p_source_product_id text, p_stores text[])
 RETURNS TABLE(store text, id text, display_name text, thumbnail text, price_total numeric, price_per_unit numeric, price_per_unit_unit text, match_kind text, match_score real, vector_score real, lexical_score real, quantity_ratio numeric, is_cheaper boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_match_version constant text := 'embedding_hybrid_v3_0_60';
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Un origen Lidl debe existir y estar disponible en la tienda del perfil.
  if p_source_store = 'lidl' and not exists (
    select 1 from public.catalog_public_product_v1(p_source_store, p_source_product_id)
  ) then
    return;
  end if;

  perform 1
  from comparator_internal.catalog_cheaper_products_v3(
    p_source_store,
    p_source_product_id,
    p_stores
  )
  limit 1;

  return query
  with requested_stores as (
    select requested.store, min(requested.ordinality) as store_order
    from unnest(coalesce(p_stores, array[]::text[])) with ordinality
      as requested(store, ordinality)
    where requested.store = any (array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc',
      'gadis','froiz','ahorramas','lidl'
    ])
      and requested.store <> p_source_store
    group by requested.store
  ),
  source_embedding as (
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
      when source.store = any (array['caprabo','eroski','hiperdino'])
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
      requested.store_order,
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
    from requested_stores as requested
    cross join source_embedding as source
    join public.catalog_product_matches as match
      on match.source_store = p_source_store
     and match.source_product_id = p_source_product_id
     and match.target_store = requested.store
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
        partition by compatible.target_store
        order by
          case
            when compatible.target_store = any (array['caprabo','eroski','hiperdino'])
              then compatible.price_total
            else compatible.price_per_unit
          end asc nulls last,
          case
            when compatible.target_store = any (array['caprabo','eroski','hiperdino'])
              then null
            else compatible.price_total
          end asc nulls last,
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
    coalesce(
      case
        when ranked.target_store = any (array['caprabo','eroski','hiperdino'])
          then ranked.price_total
        else ranked.price_per_unit
      end < source_price.comparison_price,
      false
    ) as is_cheaper
  from ranked
  cross join source_price
  where ranked.store_rank <= 2
  order by ranked.store_order, ranked.store_rank;
end;
$function$
;

-- Permisos existentes conservados por CREATE OR REPLACE.
revoke all on function public.catalog_public_product_v1(text,text) from public,anon,authenticated;
grant execute on function public.catalog_public_product_v1(text,text) to service_role;
revoke all on function comparator_internal.catalog_cheaper_products_v3(text,text,text[]) from public,anon;
revoke all on function comparator_internal.catalog_cheaper_products_v5(text,text,text[]) from public,anon;
grant execute on function comparator_internal.catalog_cheaper_products_v3(text,text,text[]) to authenticated,service_role;
grant execute on function comparator_internal.catalog_cheaper_products_v5(text,text,text[]) to authenticated,service_role;

alter table public.catalog_product_embeddings
  validate constraint catalog_product_embeddings_store_check;
alter table public.catalog_product_match_cache_status
  validate constraint catalog_product_match_cache_status_target_store_check;
