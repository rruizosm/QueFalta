-- Cierra los avisos posteriores al despliegue multicentro y hace que la
-- publicación del centro sea la frontera común de todo su catálogo.

set lock_timeout = '5s';
set statement_timeout = '120s';

create index hipercor_center_products_category_id_fk_idx
  on public.hipercor_center_products (category_id)
  where category_id is not null;

create index hipercor_price_history_product_id_fk_idx
  on public.hipercor_price_history (product_id);

drop policy "hipercor postal centers read"
  on public.hipercor_postal_centers;
create policy "hipercor postal centers read"
  on public.hipercor_postal_centers
  for select to anon, authenticated
  using (
    published
    and (
      not supported
      or exists (
        select 1
        from public.hipercor_centers as center
        where center.id = hipercor_postal_centers.center_id
          and center.published
          and center.selectable
      )
    )
  );

drop policy "hipercor center products read"
  on public.hipercor_center_products;
create policy "hipercor center products read"
  on public.hipercor_center_products
  for select to anon, authenticated
  using (
    published
    and exists (
      select 1
      from public.hipercor_centers as center
      where center.id = hipercor_center_products.center_id
        and center.published
        and center.selectable
    )
  );

drop policy "hipercor center categories read"
  on public.hipercor_center_categories;
create policy "hipercor center categories read"
  on public.hipercor_center_categories
  for select to anon, authenticated
  using (
    published
    and exists (
      select 1
      from public.hipercor_centers as center
      where center.id = hipercor_center_categories.center_id
        and center.published
        and center.selectable
    )
  );

-- Son tablas operativas sin acceso de cliente. La policy hace explícito el
-- único rol autorizado además del propietario; service_role ya omite RLS.
create policy "hipercor price history service access"
  on public.hipercor_price_history
  for all to service_role
  using (true)
  with check (true);

create policy "hipercor sync runs service access"
  on public.hipercor_sync_runs
  for all to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';
