import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertHipercorSharedCenterParity,
  groupHipercorPostalMappings,
  hipercorCheckpointPath,
  parseHipercorPostalCodes,
} from '../lib/hipercor.mjs';
import { markStale } from '../lib/stale.mjs';

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

test('Hipercor guarda checkpoints atómicos y separados por centro', () => {
  assert.match(source, /const RESUME = process\.env\.RESUME === '1'/);
  assert.match(source, /await writeFile\(temporary/);
  assert.match(source, /await rename\(temporary, path\)/);
  assert.match(source, /nextCategoryIndex: categoryIndex \+ 1/);
  assert.match(source, /checkpoint\.signature !== expectedSignature/);
  assert.match(source, /ageMs > CHECKPOINT_MAX_AGE_HOURS/);
  assert.match(source, /hipercorCheckpointPath\(CHECKPOINT_BASE, target\.centerId\)/);
});

test('Hipercor publica ficha y estado local después del guardarraíl por centro', () => {
  const guard = source.indexOf('if (rows.length < MIN_PRODUCTS)');
  const masterUpsert = source.indexOf("await upsert('hipercor_product_master'");
  const centerUpsert = source.indexOf("await upsert('hipercor_center_products'");
  const centerStale = source.indexOf("table: 'hipercor_center_products'");
  const selectable = source.indexOf('selectable: true, published: true');

  assert.ok(guard > 0);
  assert.ok(masterUpsert > guard);
  assert.ok(centerUpsert > masterUpsert);
  assert.ok(centerStale > centerUpsert);
  assert.ok(selectable > centerStale);
  assert.match(source, /target\.centerId === LEGACY_CENTER_ID/);
});

test('Hipercor resuelve CP, deduplica por store_id y valida la paridad del centro', () => {
  assert.deepEqual(parseHipercorPostalCodes('28050, 08001\n# comentario\n28050;01001'), ['28050', '08001', '01001']);
  assert.throws(() => parseHipercorPostalCodes('99999'), /inválidos/);

  const mappings = [
    { postal_code: '28050', center_id: '010130', supported: true, raw: { sampleFingerprint: 'same' } },
    { postal_code: '28051', center_id: '010130', supported: true, raw: { sampleFingerprint: 'same' } },
    { postal_code: '08001', center_id: '020200', supported: true, raw: { sampleFingerprint: 'other' } },
  ];
  assertHipercorSharedCenterParity(mappings);
  assert.deepEqual(groupHipercorPostalMappings(mappings), [
    {
      centerId: '010130',
      postalCodes: ['28050', '28051'],
      representativePostalCode: '28050',
      sampleFingerprint: 'same',
      selectorCenterId: null,
    },
    {
      centerId: '020200',
      postalCodes: ['08001'],
      representativePostalCode: '08001',
      sampleFingerprint: 'other',
      selectorCenterId: null,
    },
  ]);
  assert.throws(
    () => assertHipercorSharedCenterParity([...mappings, {
      postal_code: '28052', center_id: '010130', supported: true, raw: { sampleFingerprint: 'different' },
    }]),
    /no es deduplicable/,
  );
  assert.equal(
    hipercorCheckpointPath('scripts/logs/hipercor-sync-checkpoint.json', '010130'),
    'scripts/logs/hipercor-sync-checkpoint-010130.json',
  );
});

test('Hipercor detecta cambios de centro y limpia obsoletos dentro del centro', () => {
  assert.match(source, /result\.centerId !== expectedCenterId/);
  assert.match(source, /center_id=eq\.\$\{encodeURIComponent\(target\.centerId\)\}/);
  assert.match(source, /idColumn: 'product_id'/);
  assert.match(source, /idColumn: 'category_id'/);
  assert.match(source, /scope: 'postal_mapping'/);
  assert.match(source, /scope: 'center_catalog'/);
});

test('markStale admite una clave compuesta acotada por centro', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (!init.method) return new Response(JSON.stringify([{ product_id: 'B123' }]), { status: 200 });
    return new Response(null, { status: 204 });
  };
  try {
    await markStale({
      url: 'https://example.supabase.co',
      key: 'service-role',
      table: 'hipercor_center_products',
      runStart: '2026-09-23T12:00:00.000Z',
      filters: 'center_id=eq.010130',
      idColumn: 'product_id',
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.match(calls[0].url, /select=product_id/);
  assert.match(calls[0].url, /center_id=eq\.010130/);
  assert.match(calls[1].url, /product_id=in\./);
  assert.match(calls[1].url, /center_id=eq\.010130/);
});

test('el runner local es seguro por defecto y el workflow remoto queda manual', () => {
  assert.match(runner, /\[switch\]\$Publish/);
  assert.match(runner, /\$env:DRY_RUN = if \(\$Publish\) \{ '0' \} else \{ '1' \}/);
  assert.match(runner, /\$env:RESUME = if \(\$Resume\) \{ '1' \} else \{ '0' \}/);
  assert.match(runner, /\[string\]\$PostalCodes/);
  assert.match(runner, /\[string\]\$PostalCodesFile/);
  assert.match(runner, /\[switch\]\$LocationOnly/);
  assert.match(runner, /cmd\.exe \/d \/c 'node scripts\/sync-hipercor\.mjs 2>&1'/);
  assert.match(workflow, /^\s*workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s*schedule:/m);
});
