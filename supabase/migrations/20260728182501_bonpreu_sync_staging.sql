-- Staging reanudable del catálogo Bonpreu/Esclat.
--
-- Bonpreu limita las peticiones de su API de producto mediante AWS WAF. El
-- crawler guarda lotes pequeños en estas tablas y no toca el catálogo visible
-- hasta haber completado todas las categorías en castellano y catalán.

create table public.bonpreu_sync_cycles (
  id uuid primary key,
  status text not null default 'collecting'
    check (status in ('collecting', 'finalizing', 'completed', 'failed')),
  expected_categories integer not null check (expected_categories > 0),
  batch_size integer not null check (batch_size > 0),
  tree_es jsonb not null,
  tree_ca jsonb not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Impide que dos ejecuciones publiquen ciclos distintos a la vez. La
-- concurrency de Actions evita el caso normal; este índice también lo protege
-- si se lanza el script desde otro entorno.
create unique index bonpreu_sync_one_active_cycle_idx
  on public.bonpreu_sync_cycles ((true))
  where status in ('collecting', 'finalizing');

create table public.bonpreu_sync_products (
  cycle_id uuid not null references public.bonpreu_sync_cycles(id) on delete cascade,
  language text not null check (language in ('es-ES', 'ca-ES')),
  product_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (cycle_id, language, product_id)
);

create table public.bonpreu_sync_memberships (
  cycle_id uuid not null references public.bonpreu_sync_cycles(id) on delete cascade,
  category_id text not null,
  product_id text not null,
  primary key (cycle_id, category_id, product_id)
);

create index bonpreu_sync_memberships_product_idx
  on public.bonpreu_sync_memberships (cycle_id, product_id, category_id);

-- Una fila aparece únicamente después de haber guardado por completo todos los
-- productos de esa categoría e idioma. Es el checkpoint de reanudación.
create table public.bonpreu_sync_categories (
  cycle_id uuid not null references public.bonpreu_sync_cycles(id) on delete cascade,
  language text not null check (language in ('es-ES', 'ca-ES')),
  category_id text not null,
  product_count integer not null check (product_count >= 0),
  completed_at timestamptz not null default now(),
  primary key (cycle_id, language, category_id)
);

alter table public.bonpreu_sync_cycles enable row level security;
alter table public.bonpreu_sync_products enable row level security;
alter table public.bonpreu_sync_memberships enable row level security;
alter table public.bonpreu_sync_categories enable row level security;

-- Son tablas operativas internas aunque vivan en public para que PostgREST
-- pueda usarlas. No hay políticas de lectura y los roles de cliente no tienen
-- privilegios; solo la service_role del sincronizador puede acceder.
revoke all on table public.bonpreu_sync_cycles from anon, authenticated;
revoke all on table public.bonpreu_sync_products from anon, authenticated;
revoke all on table public.bonpreu_sync_memberships from anon, authenticated;
revoke all on table public.bonpreu_sync_categories from anon, authenticated;

grant select, insert, update, delete on table public.bonpreu_sync_cycles to service_role;
grant select, insert, update, delete on table public.bonpreu_sync_products to service_role;
grant select, insert, update, delete on table public.bonpreu_sync_memberships to service_role;
grant select, insert, update, delete on table public.bonpreu_sync_categories to service_role;
