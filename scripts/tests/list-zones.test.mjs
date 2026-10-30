import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryOfItem, groupByZone, sortZoneItems, OTHER_ZONE } from '../../src/constants/zones.ts';

test('la cesta conserva las subcategorías de cada supermercado', () => {
  assert.equal(categoryOfItem('Hamburguesas y picadas').label, 'Hamburguesas y picadas');
  assert.equal(categoryOfItem('Pollastre').label, 'Pollastre');
  for (const separator of [' › ', ' -> ', ' → ']) {
    assert.deepEqual(categoryOfItem(`Congelados${separator}Pescado y marisco`), {
      key: 'pescado y marisco', label: 'Pescado y marisco', emoji: '🛒',
    });
  }
});

test('sin categoría se usa Otros sin inferirla del nombre del producto', () => {
  for (const category of [null, undefined, '', '   ']) assert.equal(categoryOfItem(category), OTHER_ZONE);
  const groups = groupByZone([
    { categoryName: null, productName: 'Burger Crunchy Chicken' },
    { categoryName: null, productName: 'Lasaña boloñesa' },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].zone.key, 'otros');
  assert.equal(groups[0].data.length, 2);
});

test('agrupa categorías equivalentes y ordena alfabéticamente con Otros al final', () => {
  const items = [
    { id: 1, categoryName: null },
    { id: 2, categoryName: 'Frescos › Lácteos' },
    { id: 3, categoryName: 'Bebidas' },
    { id: 4, categoryName: 'lacteos' },
    { id: 5, categoryName: null },
  ];
  const groups = groupByZone(items);
  assert.deepEqual(groups.map(group => group.zone.key), ['bebidas', 'lacteos', 'otros']);
  assert.deepEqual(groups.map(group => group.data.map(item => item.id)), [[3], [2, 4], [1, 5]]);
  assert.equal(items[0].id, 1);
});

test('ordena pendientes primero y alfabéticamente sin modificar la lista original', () => {
  const items = [
    { productName: 'Zanahorias', inCart: true },
    { productName: 'Leche', inCart: false },
    { productName: 'Arroz', inCart: true },
    { productName: 'Agua', inCart: false },
  ];
  assert.deepEqual(sortZoneItems(items).map(item => item.productName), ['Agua', 'Leche', 'Arroz', 'Zanahorias']);
  assert.equal(items[0].productName, 'Zanahorias');
  assert.deepEqual(groupByZone([]), []);
});
