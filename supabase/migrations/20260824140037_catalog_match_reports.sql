-- Reportes enviados desde los resultados del comparador. Se conservan en un
-- esquema no expuesto y guardan snapshots para que un refresco del catalogo no
-- borre el contexto que vio la persona al reportar.

create table private.catalog_match_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid references auth.users(id) on delete set null,
  source_store text not null,
  source_product_id text not null,
  target_store text not null,
  target_product_id text not null,
  match_version text not null,
  reason text not null default 'incorrect_match',
  status text not null default 'pending',
  source_snapshot jsonb not null,
  target_snapshot jsonb not null,
  match_snapshot jsonb not null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  reviewer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_match_reports_different_store_check
    check (source_store <> target_store),
  constraint catalog_match_reports_reason_check
    check (reason = 'incorrect_match'),
  constraint catalog_match_reports_status_check
    check (status = any (array['pending', 'accepted', 'dismissed']::text[])),
  constraint catalog_match_reports_review_state_check
    check (
      (status = 'pending' and reviewed_at is null)
      or (status <> 'pending' and reviewed_at is not null)
    )
);

comment on table private.catalog_match_reports is
  'Cola privada de coincidencias del comparador reportadas por usuarios; se revisa una a una.';
comment on column private.catalog_match_reports.status is
  'pending: sin revisar; accepted: el reporte era correcto; dismissed: la coincidencia era valida.';

alter table private.catalog_match_reports enable row level security;
revoke all on table private.catalog_match_reports from public, anon, authenticated;
grant all on table private.catalog_match_reports to service_role;
revoke all on sequence private.catalog_match_reports_id_seq from public, anon, authenticated;
grant usage, select on sequence private.catalog_match_reports_id_seq to service_role;

create unique index catalog_match_reports_reporter_pair_uidx
  on private.catalog_match_reports (
    reporter_id,
    source_store,
    source_product_id,
    target_store,
    target_product_id,
    match_version
  )
  where reporter_id is not null;

create index catalog_match_reports_pending_idx
  on private.catalog_match_reports (created_at, id)
  where status = 'pending';

create index catalog_match_reports_pair_idx
  on private.catalog_match_reports (
    source_store,
    source_product_id,
    target_store,
    target_product_id,
    match_version,
    created_at desc
  );

create index catalog_match_reports_reporter_idx
  on private.catalog_match_reports (reporter_id)
  where reporter_id is not null;

create index catalog_match_reports_reviewer_idx
  on private.catalog_match_reports (reviewed_by)
  where reviewed_by is not null;

create or replace function private.report_catalog_product_match(
  p_source_store text,
  p_source_product_id text,
  p_target_store text,
  p_target_product_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_match public.catalog_product_matches%rowtype;
  v_source record;
  v_target record;
  v_report_id bigint;
  v_inserted boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(pg_catalog.btrim(p_source_store), '') is null
    or nullif(pg_catalog.btrim(p_source_product_id), '') is null
    or nullif(pg_catalog.btrim(p_target_store), '') is null
    or nullif(pg_catalog.btrim(p_target_product_id), '') is null
    or p_source_store = p_target_store
  then
    raise exception 'Invalid comparator match' using errcode = '22023';
  end if;

  select match.*
    into v_match
  from public.catalog_product_matches as match
  join public.catalog_product_embeddings as source
    on source.store = match.source_store
   and source.product_id = match.source_product_id
   and source.published
  join public.catalog_product_embeddings as target
    on target.store = match.target_store
   and target.product_id = match.target_product_id
   and target.published
  where match.source_store = p_source_store
    and match.source_product_id = p_source_product_id
    and match.target_store = p_target_store
    and match.target_product_id = p_target_product_id
    and match.match_version = 'embedding_hybrid_v3_0_60'
    and match.relation in ('identico', 'comparable')
    and match.review_decision is distinct from 'rechazado'
    and (
      match.relation = 'identico'
      or match.review_decision = 'aprobado'
      or public.catalog_product_identity_compatible_v1(
        source.display_name,
        source.category,
        target.display_name,
        target.category
      )
    )
  limit 1;

  if not found then
    raise exception 'Comparator match is not available' using errcode = '22023';
  end if;

  select * into v_source
  from public.catalog_public_product_v1(p_source_store, p_source_product_id);
  if not found then
    raise exception 'Source product is not available' using errcode = '22023';
  end if;

  select * into v_target
  from public.catalog_public_product_v1(p_target_store, p_target_product_id);
  if not found then
    raise exception 'Target product is not available' using errcode = '22023';
  end if;

  insert into private.catalog_match_reports (
    reporter_id,
    source_store,
    source_product_id,
    target_store,
    target_product_id,
    match_version,
    source_snapshot,
    target_snapshot,
    match_snapshot
  ) values (
    v_user_id,
    p_source_store,
    p_source_product_id,
    p_target_store,
    p_target_product_id,
    v_match.match_version,
    pg_catalog.to_jsonb(v_source),
    pg_catalog.to_jsonb(v_target),
    pg_catalog.jsonb_build_object(
      'relation', v_match.relation,
      'confidence', v_match.confidence,
      'vector_score', v_match.vector_score,
      'lexical_score', v_match.lexical_score,
      'evidence', v_match.evidence,
      'review_decision', v_match.review_decision
    )
  )
  on conflict (
    reporter_id,
    source_store,
    source_product_id,
    target_store,
    target_product_id,
    match_version
  ) where reporter_id is not null
  do nothing
  returning id into v_report_id;

  v_inserted := found;

  if not v_inserted then
    select report.id
      into v_report_id
    from private.catalog_match_reports as report
    where report.reporter_id = v_user_id
      and report.source_store = p_source_store
      and report.source_product_id = p_source_product_id
      and report.target_store = p_target_store
      and report.target_product_id = p_target_product_id
      and report.match_version = v_match.match_version;
  end if;

  return pg_catalog.jsonb_build_object(
    'report_id', v_report_id,
    'already_reported', not v_inserted
  );
end;
$function$;

revoke all on function private.report_catalog_product_match(text, text, text, text)
  from public, anon;
grant execute on function private.report_catalog_product_match(text, text, text, text)
  to authenticated, service_role;

create or replace function public.report_catalog_product_match(
  p_source_store text,
  p_source_product_id text,
  p_target_store text,
  p_target_product_id text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $function$
  select private.report_catalog_product_match(
    p_source_store,
    p_source_product_id,
    p_target_store,
    p_target_product_id
  );
$function$;

revoke all on function public.report_catalog_product_match(text, text, text, text)
  from public, anon;
grant execute on function public.report_catalog_product_match(text, text, text, text)
  to authenticated, service_role;
