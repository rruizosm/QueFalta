import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expandAhorramasPageSize,
  shouldPaginateAhorramasCategory,
} from './ahorramas-catalog.mjs';

test('amplía la paginación SFCC conservando el resto de parámetros', () => {
  const expanded = new URL(expandAhorramasPageSize(
    '/on/demandware.store/Sites-Ahorramas-Site/es/Search-UpdateGrid'
      + '?cgid=helados&pmin=0%2e01&start=20&sz=20',
  ));

  assert.equal(expanded.origin, 'https://www.ahorramas.com');
  assert.equal(expanded.searchParams.get('cgid'), 'helados');
  assert.equal(expanded.searchParams.get('pmin'), '0.01');
  assert.equal(expanded.searchParams.get('start'), '20');
  assert.equal(expanded.searchParams.get('sz'), '40');
});

test('avanza el offset cuando SFCC devuelve otra vez el mismo start', () => {
  const previous = 'https://www.ahorramas.com/on/demandware.store/Sites-Ahorramas-Site/es/Search-UpdateGrid?cgid=frescos&start=40&sz=40';
  const repeated = '/on/demandware.store/Sites-Ahorramas-Site/es/Search-UpdateGrid?cgid=frescos&start=40&sz=40';
  const advanced = new URL(expandAhorramasPageSize(repeated, 40, previous));

  assert.equal(advanced.searchParams.get('start'), '80');
  assert.equal(advanced.searchParams.get('sz'), '40');
});

test('pagina raíces y hojas, pero no repite todo el surtido en ramas intermedias', () => {
  assert.equal(shouldPaginateAhorramasCategory('alimentacion', true), true);
  assert.equal(shouldPaginateAhorramasCategory('alimentacion/conservas', true), false);
  assert.equal(shouldPaginateAhorramasCategory('alimentacion/conservas/atun', false), true);
});
