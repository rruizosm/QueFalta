-- Evita ejecutar la invalidación por cada fila de un upsert si los datos que
-- intervienen en el matching no han cambiado realmente.

drop trigger if exists catalog_product_embeddings_match_cache_update
  on public.catalog_product_embeddings;

create trigger catalog_product_embeddings_match_cache_update
after update of display_name, canonical_unit, quantity_base, global_gtin, attributes,
  content_hash, content_version, embedded_at, model, published
on public.catalog_product_embeddings
for each row
when (
  old.display_name is distinct from new.display_name
  or old.canonical_unit is distinct from new.canonical_unit
  or old.quantity_base is distinct from new.quantity_base
  or old.global_gtin is distinct from new.global_gtin
  or old.attributes is distinct from new.attributes
  or old.content_hash is distinct from new.content_hash
  or old.content_version is distinct from new.content_version
  or old.embedded_at is distinct from new.embedded_at
  or old.model is distinct from new.model
  or old.published is distinct from new.published
)
execute function comparator_internal.bump_catalog_match_store_version();
