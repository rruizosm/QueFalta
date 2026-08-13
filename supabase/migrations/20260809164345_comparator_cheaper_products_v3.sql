-- Comparador bajo demanda para la app móvil.
--
-- La recuperación vectorial permanece privada. Esta capa SECURITY DEFINER
-- expone únicamente productos publicados y exige una sesión autenticada.
-- Conserva el umbral estricto validado en el benchmark v3 y devuelve como
-- máximo dos alternativas por cada supermercado solicitado.

create or replace function public.catalog_embedding_semantic_name_v1(p_name text)
returns text
language sql
stable
set search_path = ''
as $function$
  select trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                lower(public.f_unaccent(coalesce(p_name, ''))),
                '\([^)]*\)', ' ', 'g'
              ),
              '\m[0-9]+([.,][0-9]+)?[[:space:]]*(kg|g|gr|ml|cl|l|ud|uds|u)\M', ' ', 'g'
            ),
            '\m(hacendado|bonpreu|bonarea|carrefour|consum|dia|deliplus|aliada|eroski|caprabo|sorli|ametller|alcampo|auchan|plusfresc)\M', ' ', 'g'
          ),
          '\m(brik|brick|carton|botella|garrafa|lata|tarro|bote|bolsa|paquete|bandeja|envase|granel)\M', ' ', 'g'
        ),
        '[^a-z0-9]+', ' ', 'g'
      ),
      '[[:space:]]+', ' ', 'g'
    )
  );
$function$;

create or replace function public.catalog_validated_lexical_score_v1(
  p_left text,
  p_right text
)
returns real
language sql
stable
set search_path = ''
as $function$
  with normalized as (
    select
      public.catalog_embedding_semantic_name_v1(p_left) as left_text,
      public.catalog_embedding_semantic_name_v1(p_right) as right_text
  ),
  token_arrays as (
    select
      coalesce((
        select array_agg(distinct token order by token)
        from unnest(string_to_array(normalized.left_text, ' ')) as token
        where char_length(token) >= 3
          and token <> all (array['con','sin','para','por','del','las','los','una','uno','pack','producto'])
      ), array[]::text[]) as left_tokens,
      coalesce((
        select array_agg(distinct token order by token)
        from unnest(string_to_array(normalized.right_text, ' ')) as token
        where char_length(token) >= 3
          and token <> all (array['con','sin','para','por','del','las','los','una','uno','pack','producto'])
      ), array[]::text[]) as right_tokens,
      normalized.left_text,
      normalized.right_text
    from normalized
  ),
  arrays as (
    select
      token_arrays.left_tokens,
      token_arrays.right_tokens,
      coalesce((
        select array_agg(substr('  ' || token_arrays.left_text || '  ', position, 3) order by position)
        from generate_series(1, greatest(0, char_length('  ' || token_arrays.left_text || '  ') - 2)) as position
      ), array[]::text[]) as left_trigrams,
      coalesce((
        select array_agg(substr('  ' || token_arrays.right_text || '  ', position, 3) order by position)
        from generate_series(1, greatest(0, char_length('  ' || token_arrays.right_text || '  ') - 2)) as position
      ), array[]::text[]) as right_trigrams
    from token_arrays
  ),
  scores as (
    select
      case
        when cardinality(left_tokens) = 0 or cardinality(right_tokens) = 0 then 0::numeric
        else 2.0 * (
          select count(*) from unnest(left_tokens) as token where token = any (right_tokens)
        ) / (cardinality(left_tokens) + cardinality(right_tokens))
      end as token_dice,
      case
        when cardinality(left_trigrams) = 0 or cardinality(right_trigrams) = 0 then 0::numeric
        else 2.0 * (
          select count(*) from unnest(left_trigrams) as trigram where trigram = any (right_trigrams)
        ) / (cardinality(left_trigrams) + cardinality(right_trigrams))
      end as trigram_dice
    from arrays
  )
  select (0.65 * token_dice + 0.35 * trigram_dice)::real
  from scores;
$function$;

create or replace function public.catalog_has_preparation_marker_v1(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select lower(public.f_unaccent(coalesce(p_name, ''))) ~
    '\m(al horno|hornead[oa]|asad[oa]|cocid[oa]|frit[oa]|rebozad[oa]|empanad[oa]|a la romana)\M';
$function$;

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
  from public.plusfresc_products p where p_store = 'plusfresc' and p.id = p_product_id and p.published;
$function$;

create or replace function public.catalog_cheaper_products_v3(
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
  quantity_ratio numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  with requested_stores as (
    select requested.store, min(requested.ordinality) as store_order
    from unnest(coalesce(p_stores, array[]::text[])) with ordinality as requested(store, ordinality)
    where requested.store = any (array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc'
    ])
      and requested.store <> p_source_store
    group by requested.store
  ),
  source_product as (
    select source.store, source.product_id, source.display_name, source.global_gtin
    from public.catalog_product_embeddings as source
    where source.store = p_source_store
      and source.product_id = p_source_product_id
      and source.published
      and source.embedding is not null
  ),
  candidates as (
    select
      requested.store_order,
      candidate.target_store,
      candidate.target_product_id,
      candidate.target_name,
      candidate.vector_score,
      candidate.quantity_ratio,
      source_product.display_name as source_name,
      source_product.global_gtin as source_gtin,
      target_embedding.global_gtin as target_gtin,
      public.catalog_validated_lexical_score_v1(source_product.display_name, candidate.target_name) as lexical_score,
      detail.display_name,
      detail.thumbnail,
      detail.price_total,
      detail.price_per_unit,
      detail.price_per_unit_unit
    from requested_stores as requested
    cross join source_product
    cross join lateral public.catalog_embedding_candidates_v3(
      p_source_store,
      p_source_product_id,
      array[requested.store],
      20,
      -1
    ) as candidate
    join public.catalog_product_embeddings as target_embedding
      on target_embedding.store = candidate.target_store
     and target_embedding.product_id = candidate.target_product_id
     and target_embedding.published
    cross join lateral public.catalog_public_product_v1(
      candidate.target_store,
      candidate.target_product_id
    ) as detail
  ),
  scored as (
    select
      candidates.*,
      candidates.source_gtin is not null and candidates.source_gtin = candidates.target_gtin as exact_gtin,
      (0.5 * candidates.vector_score + 0.5 * candidates.lexical_score)::real as hybrid_score
    from candidates
  ),
  accepted as (
    select scored.*
    from scored
    where scored.exact_gtin
       or (
         not (
           public.catalog_has_preparation_marker_v1(scored.source_name)
           <> public.catalog_has_preparation_marker_v1(scored.target_name)
         )
         and scored.hybrid_score >= 0.60
       )
  ),
  ranked as (
    select
      accepted.*,
      row_number() over (
        partition by accepted.target_store
        order by
          accepted.price_per_unit asc nulls last,
          accepted.price_total asc nulls last,
          accepted.exact_gtin desc,
          accepted.hybrid_score desc,
          accepted.target_product_id
      ) as store_rank
    from accepted
  )
  select
    ranked.target_store,
    ranked.target_product_id,
    ranked.display_name,
    ranked.thumbnail,
    ranked.price_total,
    ranked.price_per_unit,
    ranked.price_per_unit_unit,
    case when ranked.exact_gtin then 'exact_gtin' else 'semantic' end,
    case when ranked.exact_gtin then 1::real else ranked.hybrid_score end,
    ranked.vector_score,
    ranked.lexical_score,
    ranked.quantity_ratio
  from ranked
  where ranked.store_rank <= 2
  order by ranked.store_order, ranked.store_rank;
end;
$function$;

revoke all on function public.catalog_embedding_semantic_name_v1(text) from public, anon, authenticated;
revoke all on function public.catalog_validated_lexical_score_v1(text, text) from public, anon, authenticated;
revoke all on function public.catalog_has_preparation_marker_v1(text) from public, anon, authenticated;
revoke all on function public.catalog_public_product_v1(text, text) from public, anon, authenticated;

revoke all on function public.catalog_cheaper_products_v3(text, text, text[]) from public, anon;
grant execute on function public.catalog_cheaper_products_v3(text, text, text[]) to authenticated, service_role;
