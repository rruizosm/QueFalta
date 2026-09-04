import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL(
  '../../supabase/migrations/20260902122234_fix_comparator_filtered_hnsw_recall.sql',
  import.meta.url,
), 'utf8');

test('la búsqueda HNSW filtrada continúa hasta llenar candidatos de cada tienda', () => {
  assert.match(
    migration,
    /alter function public\.catalog_embedding_candidates_v3[\s\S]+set hnsw\.iterative_scan = 'relaxed_order'/i,
  );
  assert.doesNotMatch(migration, /alter (?:system|database|role)/i);
});

test('la identidad reconoce huevos con marca propia sin confundir elaborados', () => {
  assert.match(migration, /catalog_product_identity_family_v1/i);
  assert.match(migration, /hacendado\|bonpreu\|bonarea[\s\S]+hiperdino/i);
  assert.match(migration, /codorniz\|guatlla/i);
  assert.match(migration, /cocido\|cocida[\s\S]+duro\|dura/i);
  assert.match(
    migration,
    /left_family is distinct from 'eggs'[\s\S]+left_name[\s\S]+right_name/i,
  );
});

test('el margen de recall no rebaja el umbral global sin una familia segura', () => {
  assert.match(migration, /scored\.hybrid_score >= 0\.60/i);
  assert.match(
    migration,
    /scored\.hybrid_score >= 0\.59[\s\S]+catalog_product_identity_family_v1[\s\S]+is not null[\s\S]+catalog_product_identity_compatible_v1/i,
  );
  assert.match(migration, /catalog_match_store_versions[\s\S]+generation = generation \+ 1/i);
});
