import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const sync = read('../sync-catalog.mjs');
const workflow = read('../../.github/workflows/sync-catalog.yml');

test('Mercadona coordina el cooldown de 403/429 entre todos los workers', () => {
  assert.match(sync, /createSharedCooldown/);
  assert.match(sync, /res\.status === 403 \|\| res\.status === 429/);
  assert.match(sync, /res\.headers\.get\('retry-after'\)/);
  assert.match(sync, /await mercaCooldown\.wait\(\)/);
  assert.match(sync, /body=\$\{body\}/);
});

test('Mercadona recupera las categorías fallidas antes del cortafuegos de integridad', () => {
  const recovery = sync.indexOf('for (let pass = 1; pass <= CATEGORY_RETRY_PASSES');
  const failureRate = sync.indexOf('const categoryFailureRate');
  const firstWrite = sync.indexOf("await upsert('mercadona_categories'");

  assert.ok(recovery > 0, 'falta la pasada de recuperación');
  assert.ok(failureRate > recovery, 'el porcentaje debe calcularse tras recuperar');
  assert.ok(firstWrite > failureRate, 'el sync no debe escribir antes del cortafuegos');
  assert.match(sync, /whPriority\.get\(existing\.source_wh\) <= whPriority\.get\(wh\)/);
  assert.match(sync, /const MAX_CATEGORY_FAILURE_RATE = Number\(process\.env\.MAX_CATEGORY_FAILURE_RATE \|\| 0\.03\)/);
});

test('el workflow reduce el ritmo y reserva margen para los cooldowns', () => {
  assert.match(workflow, /timeout-minutes:\s*90/);
  assert.match(workflow, /CONCURRENCY:\s*'2'/);
  assert.match(workflow, /CATEGORY_REQUEST_DELAY_MS:\s*'250'/);
  assert.match(workflow, /MERCADONA_BLOCK_COOLDOWN_MS:\s*'30000'/);
  assert.match(workflow, /CATEGORY_RETRY_PASSES:\s*'2'/);
  assert.match(workflow, /CATEGORY_RETRY_CONCURRENCY:\s*'1'/);
  assert.match(workflow, /CATEGORY_RETRY_COOLDOWN_MS:\s*'60000'/);
});
