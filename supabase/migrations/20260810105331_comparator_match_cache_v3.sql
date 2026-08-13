-- Caché incremental del comparador híbrido v3.
--
-- Se reutiliza catalog_product_matches para los matches positivos y se añade
-- un estado por origen/tienda destino para representar también resultados
-- vacíos. Los precios no se cachean: la RPC los hidrata desde el catálogo vivo.

create table public.catalog_product_match_cache_status (
  source_store text not null,
  source_product_id text not null,
  target_store text not null,
  match_version text not null,
  source_content_hash text not null,
  source_embedded_at timestamptz not null,
  target_generation bigint not null,
  built_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_store, source_product_id, target_store, match_version),
  constraint catalog_product_match_cache_status_source_fk
    foreign key (source_store, source_product_id)
    references public.catalog_product_embeddings (store, product_id)
    on delete cascade,
  constraint catalog_product_match_cache_status_different_store_check
    check (source_store <> target_store),
  constraint catalog_product_match_cache_status_target_store_check
    check (target_store = any (array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc'
    ]::text[])),
  constraint catalog_product_match_cache_status_generation_check
    check (target_generation >= 1)
);

comment on table public.catalog_product_match_cache_status is
  'Estado de completitud de la caché de matches, incluidos resultados negativos. Sin acceso directo desde la app.';

alter table public.catalog_product_match_cache_status enable row level security;
revoke all on table public.catalog_product_match_cache_status from public, anon, authenticated;
grant all on table public.catalog_product_match_cache_status to service_role;

create index catalog_product_match_cache_status_target_idx
  on public.catalog_product_match_cache_status (target_store, match_version, target_generation);

create table comparator_internal.catalog_match_store_versions (
  store text primary key,
  generation bigint not null default 1 check (generation >= 1),
  updated_at timestamptz not null default now()
);

alter table comparator_internal.catalog_match_store_versions enable row level security;
revoke all on table comparator_internal.catalog_match_store_versions from public, anon, authenticated;
grant select, insert, update, delete on table comparator_internal.catalog_match_store_versions to service_role;

insert into comparator_internal.catalog_match_store_versions (store, generation, updated_at)
select embedding.store, 1, now()
from public.catalog_product_embeddings as embedding
group by embedding.store
on conflict (store) do nothing;

create or replace function comparator_internal.bump_catalog_match_store_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_store text;
  v_changed boolean := true;
begin
  if tg_op = 'UPDATE' then
    v_store := new.store;
    v_changed := old.content_hash is distinct from new.content_hash
      or old.content_version is distinct from new.content_version
      or old.embedded_at is distinct from new.embedded_at
      or old.model is distinct from new.model
      or old.published is distinct from new.published;
  elsif tg_op = 'DELETE' then
    v_store := old.store;
  else
    v_store := new.store;
  end if;

  if v_changed then
    insert into comparator_internal.catalog_match_store_versions as version (store, generation, updated_at)
    values (v_store, 1, now())
    on conflict (store) do update
      set generation = version.generation + 1,
          updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function comparator_internal.bump_catalog_match_store_version() from public, anon, authenticated;
grant execute on function comparator_internal.bump_catalog_match_store_version() to service_role;

create trigger catalog_product_embeddings_match_cache_insert_delete
after insert or delete on public.catalog_product_embeddings
for each row execute function comparator_internal.bump_catalog_match_store_version();

create trigger catalog_product_embeddings_match_cache_update
after update of content_hash, content_version, embedded_at, model, published
on public.catalog_product_embeddings
for each row execute function comparator_internal.bump_catalog_match_store_version();

create or replace function comparator_internal.refresh_catalog_match_cache_pair_v3(
  p_source_store text,
  p_source_product_id text,
  p_target_store text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_match_version constant text := 'embedding_hybrid_v3_0_60';
  v_source record;
  v_target_generation bigint;
  v_refresh_token text;
  v_inserted integer := 0;
begin
  if p_source_store = p_target_store then
    return 0;
  end if;

  select
    source.content_hash,
    source.embedded_at,
    source.display_name,
    source.global_gtin
  into v_source
  from public.catalog_product_embeddings as source
  where source.store = p_source_store
    and source.product_id = p_source_product_id
    and source.published
    and source.embedding is not null
    and source.embedded_at is not null;

  if not found then
    delete from public.catalog_product_matches as match
    where match.source_store = p_source_store
      and match.source_product_id = p_source_product_id
      and match.target_store = p_target_store
      and match.match_version = v_match_version;
    delete from public.catalog_product_match_cache_status as status
    where status.source_store = p_source_store
      and status.source_product_id = p_source_product_id
      and status.target_store = p_target_store
      and status.match_version = v_match_version;
    return 0;
  end if;

  select version.generation
  into v_target_generation
  from comparator_internal.catalog_match_store_versions as version
  where version.store = p_target_store;

  if v_target_generation is null then
    insert into comparator_internal.catalog_match_store_versions (store, generation, updated_at)
    values (p_target_store, 1, now())
    on conflict (store) do update set updated_at = excluded.updated_at
    returning generation into v_target_generation;
  end if;

  v_refresh_token := pg_catalog.txid_current()::text || ':' || pg_catalog.clock_timestamp()::text;

  with candidates as (
    select
      candidate.target_store,
      candidate.target_product_id,
      candidate.target_name,
      candidate.vector_score,
      candidate.quantity_ratio,
      target.global_gtin as target_gtin,
      target.content_hash as target_content_hash,
      public.catalog_validated_lexical_score_v1(v_source.display_name, candidate.target_name) as lexical_score
    from public.catalog_embedding_candidates_v3(
      p_source_store,
      p_source_product_id,
      array[p_target_store],
      20,
      -1
    ) as candidate
    join public.catalog_product_embeddings as target
      on target.store = candidate.target_store
     and target.product_id = candidate.target_product_id
     and target.published
     and target.embedding is not null
  ),
  scored as (
    select
      candidates.*,
      v_source.global_gtin is not null and v_source.global_gtin = candidates.target_gtin as exact_gtin,
      (0.5 * candidates.vector_score + 0.5 * candidates.lexical_score)::real as hybrid_score
    from candidates
  ),
  accepted as (
    select scored.*
    from scored
    where scored.exact_gtin
       or (
         public.catalog_has_preparation_marker_v1(v_source.display_name)
           = public.catalog_has_preparation_marker_v1(scored.target_name)
         and scored.hybrid_score >= 0.60
       )
  ),
  upserted as (
    insert into public.catalog_product_matches as match (
      source_store,
      source_product_id,
      target_store,
      target_product_id,
      relation,
      confidence,
      vector_score,
      lexical_score,
      match_version,
      evidence,
      created_at,
      updated_at
    )
    select
      p_source_store,
      p_source_product_id,
      accepted.target_store,
      accepted.target_product_id,
      case when accepted.exact_gtin then 'identico' else 'comparable' end,
      case when accepted.exact_gtin then 1::real else accepted.hybrid_score end,
      accepted.vector_score,
      accepted.lexical_score,
      v_match_version,
      pg_catalog.jsonb_build_object(
        'quantity_ratio', accepted.quantity_ratio,
        'source_content_hash', v_source.content_hash,
        'target_content_hash', accepted.target_content_hash,
        'target_generation', v_target_generation,
        'cache_refresh_token', v_refresh_token
      ),
      now(),
      now()
    from accepted
    on conflict (source_store, source_product_id, target_store, target_product_id, match_version)
    do update set
      relation = excluded.relation,
      confidence = excluded.confidence,
      vector_score = excluded.vector_score,
      lexical_score = excluded.lexical_score,
      evidence = excluded.evidence,
      updated_at = excluded.updated_at
    returning 1
  )
  select count(*)::integer into v_inserted from upserted;

  delete from public.catalog_product_matches as match
  where match.source_store = p_source_store
    and match.source_product_id = p_source_product_id
    and match.target_store = p_target_store
    and match.match_version = v_match_version
    and match.evidence ->> 'cache_refresh_token' is distinct from v_refresh_token;

  insert into public.catalog_product_match_cache_status as status (
    source_store,
    source_product_id,
    target_store,
    match_version,
    source_content_hash,
    source_embedded_at,
    target_generation,
    built_at,
    updated_at
  ) values (
    p_source_store,
    p_source_product_id,
    p_target_store,
    v_match_version,
    v_source.content_hash,
    v_source.embedded_at,
    v_target_generation,
    now(),
    now()
  )
  on conflict (source_store, source_product_id, target_store, match_version)
  do update set
    source_content_hash = excluded.source_content_hash,
    source_embedded_at = excluded.source_embedded_at,
    target_generation = excluded.target_generation,
    built_at = excluded.built_at,
    updated_at = excluded.updated_at;

  return v_inserted;
end;
$function$;

revoke all on function comparator_internal.refresh_catalog_match_cache_pair_v3(text, text, text)
  from public, anon, authenticated;
grant execute on function comparator_internal.refresh_catalog_match_cache_pair_v3(text, text, text)
  to service_role;

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
volatile
security definer
set search_path = ''
as $function$
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
    and source.embedded_at is not null;

  if not found then
    return;
  end if;

  for v_requested in
    select requested.store, min(requested.ordinality) as store_order
    from unnest(coalesce(p_stores, array[]::text[])) with ordinality as requested(store, ordinality)
    where requested.store = any (array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc'
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
    from unnest(coalesce(p_stores, array[]::text[])) with ordinality as requested(store, ordinality)
    where requested.store = any (array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc'
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
          cached.price_per_unit asc nulls last,
          cached.price_total asc nulls last,
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
$function$;

revoke all on function public.catalog_cheaper_products_v3(text, text, text[]) from public, anon;
grant execute on function public.catalog_cheaper_products_v3(text, text, text[]) to authenticated, service_role;
