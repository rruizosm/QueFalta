import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sync = readFileSync(new URL('../sync-bm.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/sync-bm.yml', import.meta.url), 'utf8');

test('un barrido parcial de BM nunca puede escribir ni ejecutar markStale', () => {
  assert.match(sync, /MAX_PAGES solo se admite con DRY_RUN=1/);
  assert.match(sync, /assertBmCatalogCoverage\(summaries/);
  assert.match(sync, /if \(DRY_RUN\) \{[\s\S]*return;[\s\S]*await supabaseUpsert\('bm_categories'/m);
  const lastUpsert = sync.lastIndexOf("await supabaseUpsert('catalog_location_prices'");
  const firstMarkStale = sync.indexOf("await markStale('bm_products'");
  assert.equal(lastUpsert > 0 && firstMarkStale > lastUpsert, true);
});

test('el sincronizador publica las cinco relaciones del modelo multizona', () => {
  for (const table of [
    'bm_categories',
    'bm_products',
    'bm_locations',
    'bm_postal_locations',
    'catalog_location_prices',
  ]) {
    assert.match(sync, new RegExp(`supabaseUpsert\\('${table}'`));
  }
  assert.match(sync, /filters: 'store=eq\.bm'/);
  assert.match(sync, /recordCatalogSync\(\{[\s\S]*store: 'bm'/m);
});

test('el workflow queda manual hasta desplegar y validar la migracion', () => {
  assert.match(workflow, /workflow_dispatch/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.match(workflow, /node-version: 22/);
  assert.match(workflow, /timeout-minutes: 120/);
});
