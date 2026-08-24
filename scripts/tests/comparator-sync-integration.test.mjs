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
  ['run-bonarea-sync.ps1', 'bonarea'],
  ['run-caprabo-sync.ps1', 'caprabo'],
  ['run-carrefour-sync.ps1', 'carrefour'],
  ['run-condis-sync.ps1', 'condis'],
  ['run-consum-sync.ps1', 'consum'],
  ['run-dia-sync.ps1', 'dia'],
  ['run-eroski-sync.ps1', 'eroski'],
  ['run-sorli-sync.ps1', 'sorli'],
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

test('los runners locales materializan tras un sync real correcto', () => {
  for (const [file, store] of localRunnerStores) {
    const runner = readRunner(file);
    const sourceSync = runner.indexOf(`node scripts/sync-${store === 'esclat' ? 'bonpreu' : store}.mjs`);
    const materializer = runner.indexOf('node scripts/sync-comparator-embedding-catalog.mjs');

    assert.notEqual(sourceSync, -1, `${file}: falta el sync de origen`);
    assert.ok(materializer > sourceSync, `${file}: el materializador debe ejecutarse después del sync`);
    assert.match(runner, /\$code -eq 0 -and \$env:DRY_RUN -ne '1'/);
    assert.match(runner, new RegExp(`\\$env:STORES = '${store}'`));
  }
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
