-- Invalida resultados positivos y negativos cuando cambia cualquier dato que
-- participa en el matching, incluso si el embedding no necesita regenerarse.

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
    v_changed := old.display_name is distinct from new.display_name
      or old.canonical_unit is distinct from new.canonical_unit
      or old.quantity_base is distinct from new.quantity_base
      or old.global_gtin is distinct from new.global_gtin
      or old.attributes is distinct from new.attributes
      or old.content_hash is distinct from new.content_hash
      or old.content_version is distinct from new.content_version
      or old.embedded_at is distinct from new.embedded_at
      or old.model is distinct from new.model
      or old.published is distinct from new.published;

    if v_changed then
      delete from public.catalog_product_match_cache_status as status
      where status.source_store = new.store
        and status.source_product_id = new.product_id;
    end if;
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

revoke all on function comparator_internal.bump_catalog_match_store_version()
  from public, anon, authenticated;
grant execute on function comparator_internal.bump_catalog_match_store_version()
  to service_role;

drop trigger if exists catalog_product_embeddings_match_cache_update
  on public.catalog_product_embeddings;

create trigger catalog_product_embeddings_match_cache_update
after update of display_name, canonical_unit, quantity_base, global_gtin, attributes,
  content_hash, content_version, embedded_at, model, published
on public.catalog_product_embeddings
for each row execute function comparator_internal.bump_catalog_match_store_version();
