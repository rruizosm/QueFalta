-- Hace reanudable la publicación visible de un ciclo Bonpreu completo.
--
-- El staging ya evita retirar el catálogo durante el rastreo, pero la primera
-- finalización intentó publicar más de 20k productos en una sola ejecución y
-- agotó la base de datos. Estos campos conservan un timestamp único, el último
-- producto confirmado y la fase pendiente entre distintas GitHub Actions.

alter table public.bonpreu_sync_cycles
  add column publication_phase text,
  add column publication_started_at timestamptz,
  add column publication_cursor text,
  add column publication_total integer,
  add column publication_published integer not null default 0;

-- Recupera automáticamente una finalización que ya hubiera empezado antes de
-- aplicar esta migración. Solo acepta como progreso el conjunto de productos
-- escrito con un mismo synced_at si sus IDs son EXACTAMENTE un prefijo del plan
-- staged ordenado por product_id. Si hay un hueco, un ID ajeno o ninguna
-- escritura, reinicia desde cero; repetir upserts es seguro.
with finalizing as (
  select id, created_at
  from public.bonpreu_sync_cycles
  where status = 'finalizing'
),
eligible as (
  select distinct f.id as cycle_id, m.product_id
  from finalizing f
  join public.bonpreu_sync_memberships m
    on m.cycle_id = f.id
  join public.bonpreu_sync_products p
    on p.cycle_id = f.id
   and p.language = 'es-ES'
   and p.product_id = m.product_id
  where nullif(btrim(p.payload ->> 'display_name'), '') is not null
),
totals as (
  select f.id as cycle_id, count(e.product_id)::integer as total
  from finalizing f
  left join eligible e on e.cycle_id = f.id
  group by f.id
),
candidate_writes as (
  select
    f.id as cycle_id,
    product.synced_at,
    array_agg(product.id order by product.id) as ids,
    count(*)::integer as written
  from finalizing f
  join public.bonpreu_products product
    on product.synced_at >= f.created_at
   and product.published is true
  group by f.id, product.synced_at
),
recoverable as (
  select
    candidate.cycle_id,
    candidate.synced_at,
    candidate.ids,
    candidate.written,
    totals.total
  from candidate_writes candidate
  join totals on totals.cycle_id = candidate.cycle_id
  where candidate.written <= totals.total
    and candidate.ids = array(
      select eligible.product_id
      from eligible
      where eligible.cycle_id = candidate.cycle_id
      order by eligible.product_id
      limit candidate.written
    )
),
best_recovery as (
  select distinct on (cycle_id)
    cycle_id,
    synced_at,
    ids,
    written,
    total
  from recoverable
  order by cycle_id, written desc, synced_at desc
),
initial_state as (
  select
    totals.cycle_id,
    coalesce(best.synced_at, now()) as publication_started_at,
    case
      when best.written > 0 then best.ids[best.written]
      else null
    end as publication_cursor,
    totals.total as publication_total,
    coalesce(best.written, 0) as publication_published
  from totals
  left join best_recovery best on best.cycle_id = totals.cycle_id
)
update public.bonpreu_sync_cycles cycle
set
  publication_phase = 'products',
  publication_started_at = initial.publication_started_at,
  publication_cursor = initial.publication_cursor,
  publication_total = initial.publication_total,
  publication_published = initial.publication_published
from initial_state initial
where cycle.id = initial.cycle_id;

alter table public.bonpreu_sync_cycles
  add constraint bonpreu_sync_cycles_publication_phase_check
    check (
      publication_phase is null
      or publication_phase in (
        'products',
        'categories',
        'stale_products',
        'stale_categories',
        'done'
      )
    ),
  add constraint bonpreu_sync_cycles_publication_total_check
    check (publication_total is null or publication_total >= 0),
  add constraint bonpreu_sync_cycles_publication_published_check
    check (publication_published >= 0),
  add constraint bonpreu_sync_cycles_publication_progress_check
    check (
      publication_total is null
      or publication_published <= publication_total
    ),
  add constraint bonpreu_sync_cycles_publication_cursor_check
    check (
      (publication_published = 0 and publication_cursor is null)
      or (publication_published > 0 and publication_cursor is not null)
    ),
  add constraint bonpreu_sync_cycles_finalizing_state_check
    check (
      status <> 'finalizing'
      or (
        publication_phase is not null
        and publication_started_at is not null
        and publication_total is not null
      )
    ),
  add constraint bonpreu_sync_cycles_stale_after_products_check
    check (
      publication_phase not in ('categories', 'stale_products', 'stale_categories', 'done')
      or publication_published = publication_total
    );

comment on column public.bonpreu_sync_cycles.publication_started_at is
  'Timestamp inmutable usado por todos los upserts y soft-deletes del ciclo.';
comment on column public.bonpreu_sync_cycles.publication_cursor is
  'Último bonpreu_products.id confirmado; el siguiente lote empieza después.';
comment on column public.bonpreu_sync_cycles.publication_published is
  'Número de productos confirmados para el ciclo visible.';
