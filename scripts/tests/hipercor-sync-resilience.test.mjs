import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../sync-hipercor.mjs', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../run-hipercor-sync.ps1', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/sync-hipercor.yml', import.meta.url), 'utf8');

test('Hipercor limita el ritmo y aplica una espera específica ante el WAF', () => {
  assert.match(source, /PAGE_DELAY_MIN_MS/);
  assert.match(source, /PAGE_DELAY_MAX_MS/);
  assert.match(source, /CATEGORY_DELAY_MS/);
  assert.match(source, /class WafBlockError extends Error/);
  assert.match(source, /status === 403 \|\| status === 429/);
  assert.match(source, /Math\.max\(WAF_COOLDOWN, error\.retryAfterMs \|\| 0\)/);
  assert.match(source, /response\?\.status\?\.\(\)/);
  assert.match(source, /Reference\\s\*#/);
});

test('Hipercor guarda un checkpoint atómico y solo lo carga con RESUME explícito', () => {
  assert.match(source, /const RESUME = process\.env\.RESUME === '1'/);
  assert.match(source, /await writeFile\(temporary/);
  assert.match(source, /await rename\(temporary, CHECKPOINT_PATH\)/);
  assert.match(source, /await saveCheckpoint\(categoryIndex \+ 1, products\)/);
  assert.match(source, /checkpoint\.signature !== CHECKPOINT_SIGNATURE/);
  assert.match(source, /ageMs > CHECKPOINT_MAX_AGE_HOURS/);
  assert.match(source, /row\.synced_at = runStart/);
});

test('Hipercor mantiene la publicación completa después del guardarraíl', () => {
  const guard = source.indexOf('if (rows.length < MIN_PRODUCTS)');
  const dryReturn = source.indexOf('if (DRY) {');
  const categoriesUpsert = source.indexOf("await upsert('hipercor_categories'");
  const productsUpsert = source.indexOf("await upsert('hipercor_products'");
  const stale = source.indexOf("await markStale({ url: SUPABASE_URL, key: KEY, table: 'hipercor_products'");
  const status = source.indexOf("recordCatalogSync({ url: SUPABASE_URL, key: KEY, store: 'hipercor' });");

  assert.ok(guard > 0);
  assert.ok(dryReturn > guard);
  assert.ok(categoriesUpsert > guard);
  assert.ok(productsUpsert > categoriesUpsert);
  assert.ok(stale > productsUpsert);
  assert.ok(status > stale);
});

test('el runner local es seguro por defecto y el workflow remoto queda manual', () => {
  assert.match(runner, /\[switch\]\$Publish/);
  assert.match(runner, /\$env:DRY_RUN = if \(\$Publish\) \{ '0' \} else \{ '1' \}/);
  assert.match(runner, /\$env:RESUME = if \(\$Resume\) \{ '1' \} else \{ '0' \}/);
  assert.match(runner, /cmd\.exe \/d \/c 'node scripts\/sync-hipercor\.mjs 2>&1'/);
  assert.match(workflow, /^\s*workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s*schedule:/m);
});
