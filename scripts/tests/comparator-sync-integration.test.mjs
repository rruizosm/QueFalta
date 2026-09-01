import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflowStores = new Map([
  ['sync-ahorramas.yml', 'ahorramas'],
  ['sync-alcampo.yml', 'alcampo'],
  ['sync-aldi.yml', 'aldi'],
  ['sync-ametller.yml', 'ametller'],
  ['sync-bonarea.yml', 'bonarea'],
  ['sync-bonpreu.yml', 'esclat'],
  ['sync-caprabo.yml', 'caprabo'],
  ['sync-catalog.yml', 'mercadona'],
  ['sync-condis.yml', 'condis'],
  ['sync-consum.yml', 'consum'],
  ['sync-dia.yml', 'dia'],
  ['sync-eroski.yml', 'eroski'],
  ['sync-froiz.yml', 'froiz'],
  ['sync-gadis.yml', 'gadis'],
  ['sync-hiperdino.yml', 'hiperdino'],
  ['sync-plusfresc.yml', 'plusfresc'],
  ['sync-sorli.yml', 'sorli'],
]);

const localRunnerStores = new Map([
  ['run-alcampo-playwright.ps1', { store: 'alcampo', sourceScript: 'sync-alcampo-playwright.mjs', realRunGuard: /\$code -eq 0 -and \$Publish/ }],
  ['run-bonarea-sync.ps1', { store: 'bonarea', sourceScript: 'sync-bonarea.mjs' }],
  ['run-caprabo-sync.ps1', { store: 'caprabo', sourceScript: 'sync-caprabo.mjs' }],
  ['run-carrefour-sync.ps1', { store: 'carrefour', sourceScript: 'sync-carrefour.mjs' }],
  ['run-condis-sync.ps1', { store: 'condis', sourceScript: 'sync-condis.mjs' }],
  ['run-consum-sync.ps1', { store: 'consum', sourceScript: 'sync-consum.mjs' }],
  ['run-dia-sync.ps1', { store: 'dia', sourceScript: 'sync-dia.mjs' }],
  ['run-eroski-sync.ps1', { store: 'eroski', sourceScript: 'sync-eroski.mjs' }],
  ['run-froiz-sync.ps1', { store: 'froiz', sourceScript: 'sync-froiz.mjs' }],
  ['run-sorli-sync.ps1', { store: 'sorli', sourceScript: 'sync-sorli.mjs' }],
]);

const readWorkflow = (file) => readFileSync(new URL(
  `../../.github/workflows/${file}`,
  import.meta.url,
), 'utf8');

const readRunner = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('todos los workflows compatibles materializan su tienda después del sync', () => {
  for (const [file, store] of workflowStores) {
    const workflow = readWorkflow(file);
    const sourceSync = workflow.indexOf('run: node scripts/sync-');
    const materializer = workflow.indexOf('run: node scripts/sync-comparator-embedding-catalog.mjs');

    assert.notEqual(sourceSync, -1, `${file}: falta el sync de origen`);
    assert.ok(materializer > sourceSync, `${file}: el materializador debe ejecutarse después del sync`);
    assert.match(workflow, new RegExp(`STORES:\\s*${store}(?:\\s|$)`), `${file}: tienda incorrecta`);
  }
});

test('Bonpreu materializa solo cuando termina el ciclo encadenado', () => {
  const workflow = readWorkflow('sync-bonpreu.yml');
  assert.match(
    workflow,
    /Actualizar capa del comparador al completar el ciclo[\s\S]*?if: success\(\) && steps\.sync\.outputs\.continue_sync != 'true'[\s\S]*?STORES:\s*esclat/,
  );
});

test('Gadis deja margen para materializar en lotes incrementales tras el rastreo', () => {
  const workflow = readWorkflow('sync-gadis.yml');
  assert.match(workflow, /timeout-minutes:\s*60/);
});

test('Dia deja una hora para completar el rastreo y materializar el comparador', () => {
  const workflow = readWorkflow('sync-dia.yml');
  assert.match(workflow, /timeout-minutes:\s*60/);
});

test('los runners locales materializan tras un sync real correcto', () => {
  for (const [file, { store, sourceScript, realRunGuard }] of localRunnerStores) {
    const runner = readRunner(file);
    const sourceSync = runner.indexOf(`node scripts/${sourceScript}`);
    const materializer = runner.indexOf('node scripts/sync-comparator-embedding-catalog.mjs');

    assert.notEqual(sourceSync, -1, `${file}: falta el sync de origen`);
    assert.ok(materializer > sourceSync, `${file}: el materializador debe ejecutarse después del sync`);
    assert.match(runner, realRunGuard ?? /\$code -eq 0 -and \$env:DRY_RUN -ne '1'/);
    assert.match(runner, new RegExp(`\\$env:STORES = '${store}'`));
  }
});

test('Froiz y Alcampo no tienen cron productivo en GitHub Actions', () => {
  for (const file of ['sync-froiz.yml', 'sync-alcampo.yml']) {
    const workflow = readWorkflow(file);
    assert.match(workflow, /^\s*workflow_dispatch:/m, `${file}: debe conservar el diagnóstico manual`);
    assert.doesNotMatch(workflow, /^\s*schedule:/m, `${file}: no debe ejecutarse por cron en GitHub`);
  }
});

test('Froiz y Alcampo registran la fecha que muestra Actualización de catálogos', () => {
  for (const [file, store] of [
    ['sync-froiz.mjs', 'froiz'],
    ['sync-alcampo-playwright.mjs', 'alcampo'],
  ]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const stale = source.lastIndexOf('await markStale');
    const status = source.lastIndexOf('await recordCatalogSync');
    assert.ok(stale >= 0, `${file}: falta la limpieza final del catálogo`);
    assert.ok(status > stale, `${file}: debe registrar el estado después de terminar el catálogo`);
    assert.match(source, new RegExp(`recordCatalogSync\\(\\{[^}]*store: '${store}'`));
  }

  const api = readFileSync(new URL('../../src/api/catalogSyncStatus.ts', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../../src/screens/CatalogSyncStatusScreen.tsx', import.meta.url), 'utf8');
  const stores = readFileSync(new URL('../../src/constants/stores.ts', import.meta.url), 'utf8');
  assert.match(api, /\.from\('catalog_sync_status'\)/);
  assert.match(screen, /fetchCatalogSyncStatuses\(\)/);
  assert.match(stores, /key: 'froiz'/);
  assert.match(stores, /key: 'alcampo'/);
});

test('Hipercor queda fuera hasta que la capa transversal lo admita', () => {
  const workflow = readWorkflow('sync-hipercor.yml');
  const materializer = readFileSync(new URL(
    '../sync-comparator-embedding-catalog.mjs',
    import.meta.url,
  ), 'utf8');

  assert.doesNotMatch(workflow, /sync-comparator-embedding-catalog/);
  assert.doesNotMatch(materializer, /\['hipercor',\s*'hipercor_products'/);
});
