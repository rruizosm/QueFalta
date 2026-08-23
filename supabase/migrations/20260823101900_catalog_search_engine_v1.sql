-- Motor de búsqueda del catálogo v1.
--
-- Aditivo y compatible con clientes anteriores: conserva las consultas directas
-- a *_products y añade una RPC homogénea por supermercado. Cada función devuelve
-- la fila original para que PostgREST pueda seguir aplicando el select de columnas
-- existente en el cliente.

create or replace function public.catalog_search_normalize(p_query text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    lower(public.f_unaccent(btrim(coalesce(p_query, '')))),
    '\s+',
    ' ',
    'g'
  );
$$;

create or replace function public.catalog_search_words(p_query_norm text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  with tokens as (
    select regexp_split_to_array(coalesce(p_query_norm, ''), '\s+') as words
  ), meaningful as (
    select array_agg(word order by ordinal) as words
    from tokens
    cross join lateral unnest(tokens.words) with ordinality as item(word, ordinal)
    where length(word) >= 2
  )
  select case
    when cardinality(coalesce(meaningful.words, '{}'::text[])) > 0
      then meaningful.words
    else coalesce(tokens.words, '{}'::text[])
  end
  from tokens
  cross join meaningful;
$$;

create or replace function public.catalog_search_tsquery(p_query_norm text)
returns tsquery
language sql
immutable
parallel safe
set search_path = ''
as $$
  select to_tsquery(
    'simple'::regconfig,
    coalesce(string_agg(quote_literal(word) || ':*', ' & ' order by ordinal), '')
  )
  from unnest(public.catalog_search_words(p_query_norm))
    with ordinality as item(word, ordinal)
  where word <> '';
$$;

create or replace function public.catalog_search_rank(
  p_name_norm text,
  p_query_norm text,
  p_words text[],
  p_tsquery tsquery
)
returns real
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
      case when p_name_norm = p_query_norm then 1200 else 0 end
    + case when p_name_norm like p_query_norm || '%' then 600 else 0 end
    + coalesce((
        select sum(
            case
              when (' ' || p_name_norm || ' ') like ('% ' || word || ' %') then 180
              else 0
            end
          + case when p_name_norm like word || '%' then 90 else 0 end
          + greatest(0, 60 - strpos(p_name_norm, word))
        )
        from unnest(p_words) as word
        where strpos(p_name_norm, word) > 0
      ), 0)
    + 220 * ts_rank_cd(to_tsvector('simple'::regconfig, p_name_norm), p_tsquery)
    + 140 * public.word_similarity(p_query_norm, p_name_norm);
$$;

-- Los índices FTS son parciales porque todas las búsquedas excluyen productos no
-- publicados. Los índices trigram de display_name*_norm ya existen y cubren el
-- fallback tolerante a erratas mediante el operador `<%`.
create index if not exists mercadona_products_search_fts_idx
  on public.mercadona_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists mercadona_products_search_ca_fts_idx
  on public.mercadona_products using gin (to_tsvector('simple'::regconfig, display_name_ca_norm))
  where published;
create index if not exists bonpreu_products_search_fts_idx
  on public.bonpreu_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists bonpreu_products_search_ca_fts_idx
  on public.bonpreu_products using gin (to_tsvector('simple'::regconfig, display_name_ca_norm))
  where published;
create index if not exists carrefour_products_search_fts_idx
  on public.carrefour_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists bonarea_products_search_fts_idx
  on public.bonarea_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists bonarea_products_search_ca_fts_idx
  on public.bonarea_products using gin (to_tsvector('simple'::regconfig, display_name_ca_norm))
  where published;
create index if not exists consum_products_search_fts_idx
  on public.consum_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists dia_products_search_fts_idx
  on public.dia_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists sorli_products_search_fts_idx
  on public.sorli_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists sorli_products_search_ca_fts_idx
  on public.sorli_products using gin (to_tsvector('simple'::regconfig, display_name_ca_norm))
  where published;
create index if not exists eroski_products_search_fts_idx
  on public.eroski_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists caprabo_products_search_fts_idx
  on public.caprabo_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists condis_products_search_fts_idx
  on public.condis_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists condis_products_search_ca_fts_idx
  on public.condis_products using gin (to_tsvector('simple'::regconfig, display_name_ca_norm))
  where published;
create index if not exists ametller_products_search_fts_idx
  on public.ametller_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists ametller_products_search_ca_fts_idx
  on public.ametller_products using gin (to_tsvector('simple'::regconfig, display_name_ca_norm))
  where published;
create index if not exists aldi_products_search_fts_idx
  on public.aldi_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists gadis_products_search_fts_idx
  on public.gadis_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists froiz_products_search_fts_idx
  on public.froiz_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists ahorramas_products_search_fts_idx
  on public.ahorramas_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists hiperdino_products_search_fts_idx
  on public.hiperdino_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists alcampo_products_search_fts_idx
  on public.alcampo_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists plusfresc_products_search_fts_idx
  on public.plusfresc_products using gin (to_tsvector('simple'::regconfig, display_name_norm))
  where published;
create index if not exists plusfresc_products_search_ca_fts_idx
  on public.plusfresc_products using gin (to_tsvector('simple'::regconfig, display_name_ca_norm))
  where published;

-- Las 18 RPC comparten firma. `p_region` contiene el nombre canónico de la CCAA
-- usado en regions[] y `p_center` el centro de Plusfresc; los demás catálogos
-- ignoran esos argumentos. La lista está cerrada y no incorpora datos externos.
do $migration$
declare
  catalog record;
  name_expression text;
  availability_expression text;
begin
  for catalog in
    select *
    from (values
      ('search_mercadona_products', 'mercadona_products', true,  true,  false),
      ('search_bonpreu_products',   'bonpreu_products',   true,  false, false),
      ('search_carrefour_products', 'carrefour_products', false, true,  false),
      ('search_bonarea_products',   'bonarea_products',   true,  false, false),
      ('search_consum_products',    'consum_products',    false, true,  false),
      ('search_dia_products',       'dia_products',       false, true,  false),
      ('search_sorli_products',     'sorli_products',     true,  false, false),
      ('search_eroski_products',    'eroski_products',    false, false, false),
      ('search_caprabo_products',   'caprabo_products',   false, false, false),
      ('search_condis_products',    'condis_products',    true,  false, false),
      ('search_ametller_products',  'ametller_products',  true,  false, false),
      ('search_aldi_products',      'aldi_products',      false, false, false),
      ('search_gadis_products',     'gadis_products',     false, false, false),
      ('search_froiz_products',     'froiz_products',     false, false, false),
      ('search_ahorramas_products', 'ahorramas_products', false, false, false),
      ('search_hiperdino_products', 'hiperdino_products', false, false, false),
      ('search_alcampo_products',   'alcampo_products',   false, false, false),
      ('search_plusfresc_products', 'plusfresc_products', true,  false, true)
    ) as configured(function_name, table_name, bilingual, regional, centered)
  loop
    name_expression := case
      when catalog.bilingual then
        'case when lower(coalesce(p_lang, ''es'')) = ''ca'' '
        || 'then p.display_name_ca_norm else p.display_name_norm end'
      else 'p.display_name_norm'
    end;

    availability_expression := case
      when catalog.regional then
        '(p_region is null or p.regions is null or p.regions = ''{}''::text[] '
        || 'or p_region = any(p.regions))'
      when catalog.centered then
        '(p_center is null or p.centers is null or p.centers = ''{}''::text[] '
        || 'or p_center = any(p.centers))'
      else 'true'
    end;

    execute format($function$
      create or replace function public.%I(
        p_query text,
        p_lang text default 'es',
        p_region text default null,
        p_center text default null,
        p_limit integer default 50,
        p_offset integer default 0
      )
      returns setof public.%I
      language sql
      stable
      parallel safe
      security invoker
      set search_path = ''
      as $body$
        with search as (
          select
            query_norm,
            public.catalog_search_words(query_norm) as words,
            public.catalog_search_tsquery(query_norm) as parsed_query
          from (
            select public.catalog_search_normalize(p_query) as query_norm
          ) normalized
        ), candidates as (
          select p.id, %s as search_name
          from public.%I as p
          cross join search
          where p.published
            and length(search.query_norm) >= 2
            and %s
            and to_tsvector('simple'::regconfig, %s) @@ search.parsed_query

          union

          select p.id, %s as search_name
          from public.%I as p
          cross join search
          where p.published
            and length(search.query_norm) >= 3
            and %s
            and search.query_norm operator(public.<%%) %s
        )
        select p
        from candidates
        join public.%I as p on p.id = candidates.id
        cross join search
        order by
          public.catalog_search_rank(
            candidates.search_name,
            search.query_norm,
            search.words,
            search.parsed_query
          ) desc,
          candidates.search_name asc,
          p.id asc
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
        offset greatest(coalesce(p_offset, 0), 0);
      $body$;
    $function$,
      catalog.function_name,
      catalog.table_name,
      name_expression,
      catalog.table_name,
      availability_expression,
      name_expression,
      name_expression,
      catalog.table_name,
      availability_expression,
      name_expression,
      catalog.table_name
    );

    execute format(
      'revoke all on function public.%I(text,text,text,text,integer,integer) '
      || 'from public, anon, authenticated',
      catalog.function_name
    );
    execute format(
      'grant execute on function public.%I(text,text,text,text,integer,integer) '
      || 'to anon, authenticated, service_role',
      catalog.function_name
    );
  end loop;
end;
$migration$;

revoke all on function public.catalog_search_normalize(text)
  from public, anon, authenticated;
revoke all on function public.catalog_search_words(text)
  from public, anon, authenticated;
revoke all on function public.catalog_search_tsquery(text)
  from public, anon, authenticated;
revoke all on function public.catalog_search_rank(text,text,text[],tsquery)
  from public, anon, authenticated;

grant execute on function public.catalog_search_normalize(text)
  to anon, authenticated, service_role;
grant execute on function public.catalog_search_words(text)
  to anon, authenticated, service_role;
grant execute on function public.catalog_search_tsquery(text)
  to anon, authenticated, service_role;
grant execute on function public.catalog_search_rank(text,text,text[],tsquery)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
