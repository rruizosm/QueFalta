import assert from 'node:assert/strict';
import test from 'node:test';

import { zoneOfCategory, zoneOfItem } from '../../src/constants/zones.ts';

test('las categorías de carne de Mercadona se asignan a frescos', () => {
  assert.equal(zoneOfCategory('Hamburguesas y picadas').key, 'frescos');
  assert.equal(zoneOfCategory('Aves y pollo').key, 'frescos');
  assert.equal(zoneOfCategory('Pollo').key, 'frescos');
  assert.equal(zoneOfCategory('Pollastre').key, 'frescos');
});

test('los tres productos reportados salen de Otros aunque falte su categoría', () => {
  assert.equal(zoneOfItem(null, 'Burger Crunchy Chicken').key, 'frescos');
  assert.equal(zoneOfItem('Otros', 'Filetes pechuga de pollo corte fino').key, 'frescos');
  assert.equal(zoneOfItem(null, 'Lasaña Boloñesa Hacendado').key, 'preparados');
});

test('el fallback conserva la clasificación en catalán', () => {
  assert.equal(zoneOfItem(null, 'Filets de pit de pollastre tall fi').key, 'frescos');
  assert.equal(zoneOfItem(null, 'Lasanya bolonyesa Hacendado').key, 'preparados');
});

test('una categoría conocida sigue teniendo prioridad sobre el nombre del producto', () => {
  assert.equal(zoneOfItem('Caldos', 'Caldo de pollo Hacendado').key, 'despensa');
  assert.equal(zoneOfItem('Congelados', 'Lasaña boloñesa ultracongelada').key, 'congelados');
});

test('BM conserva la zona Congelados al combinar N1 y subcategoría', () => {
  for (const leaf of ['Pescado y marisco', 'Platos preparados', 'Verduras y hortalizas', 'Panificación y repostería']) {
    assert.equal(zoneOfCategory(`Congelados › ${leaf}`).key, 'congelados');
  }
  assert.equal(zoneOfCategory('Congelados -> Fruta y verdura').key, 'congelados');
  assert.equal(zoneOfCategory('Frescos › Frutas').key, 'fruta');
  assert.equal(zoneOfItem(null, 'Fruta congelada').key, 'congelados');
});

test('BM prioriza la hoja en raíces genéricas y la raíz en secciones específicas', () => {
  assert.equal(zoneOfCategory('Alimentación › Aperitivos y frutos secos').key, 'aperitivos');
  assert.equal(zoneOfCategory('Alimentación › Platos preparados').key, 'preparados');
  assert.equal(zoneOfCategory('Frescos › Horno de pan').key, 'pan');
  assert.equal(zoneOfCategory('Bebé › Perfumería e higiene').key, 'bebe');
  assert.equal(zoneOfCategory('Mascotas › Accesorios e higiene').key, 'mascotas');
  assert.equal(zoneOfCategory('Cuidado del hogar › Cuidado de la ropa').key, 'limpieza');
  assert.equal(zoneOfCategory('Bebidas › Cava, champagne y sidra').key, 'bebidas');
});
