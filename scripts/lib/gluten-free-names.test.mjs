import assert from 'node:assert/strict';
import test from 'node:test';
import { hasGlutenFreeName } from './gluten-free-names.mjs';

test('reconoce declaraciones equivalentes y variantes observadas en los catálogos', () => {
  for (const name of [
    'Pan SIN GLUTEN', 'Pa sense gluten', 'Pan sin-gluten', 'Mermelada singluten',
    'Mermelada ecológica sin glutren', 'Chocolate sin lactosa, ni gluten',
    'Caldo de carne sin glutenl pack 2', 'Mejillones sin gluten13-18 piezas',
    'Pan de queso sin gluten16 unidades',
    'Yerba mate libre de gluten', 'Gluten-free crackers', 'Glutenfree bread',
    'Pasta senza glutine', 'Brot glutenfrei', 'Pan S/GLUTEN', 'Pan s.gl.',
    'Galletas mini choco bom s/g, 120g', 'Pan petit brioxe s/g 2ud, 110g',
    'Pan sin\u00a0glúten', 'Cereales 0% gluten', 'Pan sem glúten',
  ]) assert.equal(hasGlutenFreeName(name), true, name);
});

test('no confunde palabras parecidas, otras declaraciones sin ni la abreviatura sin gas', () => {
  for (const name of [
    'Caldo vegetal sin glutamato', 'L-Glutamina 100% pura', 'Sérum Gluta-Hya',
    'Pan con gluten', 'Pan sin lactosa', 'Agua mineral s/g', 'Cerveza s/g',
    'Gluten-freezer', 'Pan sin glutenato', 'Pan con harina de trigo',
  ]) assert.equal(hasGlutenFreeName(name), false, name);
});

test('revisa ambos idiomas y tolera nombres ausentes', () => {
  assert.equal(hasGlutenFreeName('Pa tradicional', 'Pan sin gluten'), true);
  assert.equal(hasGlutenFreeName('Pan tradicional', 'Pa sense gluten'), true);
  assert.equal(hasGlutenFreeName(null, undefined, ''), false);
  assert.equal(hasGlutenFreeName('Pan sin gluten'), true);
  assert.equal(hasGlutenFreeName('Pan normal'), false);
});
