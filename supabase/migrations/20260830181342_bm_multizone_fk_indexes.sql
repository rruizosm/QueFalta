-- Indices de cobertura para las dos claves foraneas de categoria de BM.
-- Son completos (no parciales) para que PostgreSQL pueda usarlos al validar
-- actualizaciones y borrados en la tabla referenciada.

set lock_timeout = '5s';
set statement_timeout = '120s';

create index bm_products_root_category_fk_idx
  on public.bm_products (root_category_id);

create index bm_products_subcategory_fk_idx
  on public.bm_products (category_id, root_category_id);
