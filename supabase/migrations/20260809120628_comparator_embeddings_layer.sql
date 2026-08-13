-- Capa transversal y privada para embeddings y matches precalculados.
-- El pipeline de generación se añade en una migración posterior: esta fase no
-- instala pgmq, pg_cron ni pg_net y no activa la UI.

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema public;

create table public.catalog_product_embeddings (
  store text not null,
  product_id text not null,
  display_name text not null,
  brand text,
  category text,
  canonical_unit text,
  quantity_base numeric,
  global_gtin text,
  attributes jsonb not null default '{}'::jsonb,
  content text not null,
  content_hash text not null,
  content_version text not null default 'catalog_embedding_content_v1',
  embedding extensions.vector(512),
  model text,
  published boolean not null default true,
  source_seen_at timestamptz not null default now(),
  embedded_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (store, product_id),
  constraint catalog_product_embeddings_store_check check (
    store = any (array[
      'alcampo', 'aldi', 'ametller', 'bonarea', 'caprabo', 'carrefour',
      'condis', 'consum', 'dia', 'eroski', 'esclat', 'hiperdino',
      'mercadona', 'plusfresc', 'sorli'
    ]::text[])
  ),
  constraint catalog_product_embeddings_unit_check check (
    canonical_unit is null or canonical_unit = any (array['l', 'kg', 'ud']::text[])
  ),
  constraint catalog_product_embeddings_quantity_check check (
    quantity_base is null or quantity_base > 0
  ),
  constraint catalog_product_embeddings_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint catalog_product_embeddings_vector_metadata_check check (
    (embedding is null and model is null and embedded_at is null)
    or (embedding is not null and model is not null and embedded_at is not null)
  )
);

comment on table public.catalog_product_embeddings is
  'Snapshot semántico transversal del catálogo. Privado; no se consulta directamente desde la app.';
comment on column public.catalog_product_embeddings.embedding is
  'Vector normalizado de 512 dimensiones. Solo se compara con filas del mismo model y content_version.';
comment on column public.catalog_product_embeddings.content_hash is
  'SHA-256 hexadecimal del contenido normalizado para evitar regeneraciones innecesarias.';

alter table public.catalog_product_embeddings enable row level security;
revoke all on table public.catalog_product_embeddings from public, anon, authenticated;
grant all on table public.catalog_product_embeddings to service_role;

create index catalog_product_embeddings_lookup_idx
  on public.catalog_product_embeddings (store, product_id, published);
create index catalog_product_embeddings_seen_idx
  on public.catalog_product_embeddings (store, source_seen_at)
  where published;
create index catalog_product_embeddings_gtin_idx
  on public.catalog_product_embeddings (global_gtin)
  where global_gtin is not null and published;
create index catalog_product_embeddings_name_trgm_idx
  on public.catalog_product_embeddings
  using gin (display_name public.gin_trgm_ops)
  where published;
create index catalog_product_embeddings_hnsw_idx
  on public.catalog_product_embeddings
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null and published;

create table public.catalog_product_matches (
  source_store text not null,
  source_product_id text not null,
  target_store text not null,
  target_product_id text not null,
  relation text not null,
  confidence real not null,
  vector_score real,
  lexical_score real,
  match_version text not null,
  evidence jsonb not null default '{}'::jsonb,
  review_decision text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (
    source_store, source_product_id, target_store, target_product_id, match_version
  ),
  constraint catalog_product_matches_source_fk
    foreign key (source_store, source_product_id)
    references public.catalog_product_embeddings (store, product_id)
    on delete cascade,
  constraint catalog_product_matches_target_fk
    foreign key (target_store, target_product_id)
    references public.catalog_product_embeddings (store, product_id)
    on delete cascade,
  constraint catalog_product_matches_different_store_check check (source_store <> target_store),
  constraint catalog_product_matches_relation_check check (
    relation = any (array['identico', 'comparable', 'sustituto', 'no_relacionado']::text[])
  ),
  constraint catalog_product_matches_confidence_check check (confidence between 0 and 1),
  constraint catalog_product_matches_vector_score_check check (
    vector_score is null or vector_score between -1 and 1
  ),
  constraint catalog_product_matches_lexical_score_check check (
    lexical_score is null or lexical_score between 0 and 1
  ),
  constraint catalog_product_matches_review_check check (
    review_decision is null
    or review_decision = any (array['aprobado', 'rechazado', 'sustituto', 'pendiente']::text[])
  )
);

comment on table public.catalog_product_matches is
  'Matches versionados y auditables. La app accederá mediante una RPC específica, no a la tabla.';

alter table public.catalog_product_matches enable row level security;
revoke all on table public.catalog_product_matches from public, anon, authenticated;
grant all on table public.catalog_product_matches to service_role;

create index catalog_product_matches_source_idx
  on public.catalog_product_matches
  (source_store, source_product_id, match_version, relation, confidence desc);
create index catalog_product_matches_target_idx
  on public.catalog_product_matches (target_store, target_product_id, match_version);
create index catalog_product_matches_review_idx
  on public.catalog_product_matches (review_decision, updated_at)
  where review_decision is not null;

create or replace function public.catalog_attributes_compatible(p_left jsonb, p_right jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select not exists (
    select 1
    from pg_catalog.jsonb_each_text(coalesce(p_left, '{}'::jsonb)) as l(key, value)
    join pg_catalog.jsonb_each_text(coalesce(p_right, '{}'::jsonb)) as r(key, value)
      using (key)
    where l.value in ('true', 'false')
      and r.value in ('true', 'false')
      and l.value <> r.value
  );
$function$;

revoke all on function public.catalog_attributes_compatible(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.catalog_attributes_compatible(jsonb, jsonb) to service_role;

create or replace function public.catalog_embedding_candidates(
  p_source_store text,
  p_source_product_id text,
  p_target_stores text[] default null,
  p_match_count integer default 20,
  p_min_vector_score real default 0.45
)
returns table (
  target_store text,
  target_product_id text,
  target_name text,
  vector_score real,
  lexical_score real,
  quantity_ratio numeric
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with source as (
    select e.*
    from public.catalog_product_embeddings as e
    where e.store = p_source_store
      and e.product_id = p_source_product_id
      and e.published
      and e.embedding is not null
  )
  select
    candidate.store,
    candidate.product_id,
    candidate.display_name,
    candidate.vector_score,
    candidate.lexical_score,
    candidate.quantity_ratio
  from source
  cross join lateral (
    select
      target.store,
      target.product_id,
      target.display_name,
      (1 - (target.embedding operator(extensions.<=>) source.embedding))::real as vector_score,
      public.similarity(source.display_name, target.display_name)::real as lexical_score,
      case
        when source.quantity_base is not null and target.quantity_base is not null
          then target.quantity_base / source.quantity_base
        else null
      end as quantity_ratio
    from public.catalog_product_embeddings as target
    where target.published
      and target.embedding is not null
      and target.store <> source.store
      and (p_target_stores is null or target.store = any (p_target_stores))
      and target.model = source.model
      and target.content_version = source.content_version
      and source.canonical_unit is not null
      and target.canonical_unit = source.canonical_unit
      and public.catalog_attributes_compatible(source.attributes, target.attributes)
      and (
        source.quantity_base is null
        or target.quantity_base is null
        or target.quantity_base / source.quantity_base between 0.25 and 4
      )
      and 1 - (target.embedding operator(extensions.<=>) source.embedding) >= p_min_vector_score
    order by target.embedding operator(extensions.<=>) source.embedding
    limit least(greatest(p_match_count, 1), 100)
  ) as candidate
  order by candidate.vector_score desc, candidate.lexical_score desc;
$function$;

comment on function public.catalog_embedding_candidates(text, text, text[], integer, real) is
  'Recuperación vectorial interna con filtros duros previos. No decide ni publica matches.';

revoke all on function public.catalog_embedding_candidates(text, text, text[], integer, real)
  from public, anon, authenticated;
grant execute on function public.catalog_embedding_candidates(text, text, text[], integer, real)
  to service_role;
