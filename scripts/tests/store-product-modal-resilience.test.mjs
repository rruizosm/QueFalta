import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modal = readFileSync(new URL(
  '../../src/components/StoreProductModal.tsx',
  import.meta.url,
), 'utf8');
const comparator = readFileSync(new URL(
  '../../src/components/SimilarProductsSection.tsx',
  import.meta.url,
), 'utf8');

test('los resultados del comparador pueden recuperar una ficha fuera del filtro local', () => {
  assert.match(comparator, /<StoreProductModal[\s\S]*fallbackToGlobalCatalog/);
  assert.match(modal, /LOCATION_FILTERED_STORES\.has\(store\)/);
  assert.match(modal, /fetchMirrorProduct\(store, targetId, region, postalCode, true\)/);
});

test('un fallo de detalle permanece visible y permite reintentar sin autocerrar la hoja', () => {
  const loadingEffect = modal.slice(
    modal.indexOf('useEffect(() => {'),
    modal.indexOf('if (!target) return null;'),
  );
  assert.match(loadingEffect, /setErrorKey\(requestKey\)/);
  assert.doesNotMatch(loadingEffect, /onClose\(/);
  assert.match(modal, /loadError[\s\S]*product\.detailLoadError/);
  assert.match(modal, /setReloadToken\(\(current\) => current \+ 1\)/);
});
