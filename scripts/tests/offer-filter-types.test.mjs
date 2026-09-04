import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/lib/offerTypes.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(output, { module: mod, exports: mod.exports });

const { offerTypesOf, offerTypesForStore } = mod.exports;

test('clasifica rebajas directas por precio anterior o etiqueta porcentual', () => {
  assert.deepEqual(
    [...offerTypesOf({ promoName: 'Oferta', prevPrice: 4.5 })],
    ['discount'],
  );
  assert.deepEqual(
    [...offerTypesOf({ promoName: '-20%', prevPrice: null })],
    ['discount'],
  );
});

test('distingue segunda unidad, multiunidad y Club sin perder facetas combinadas', () => {
  assert.deepEqual(
    [...offerTypesOf({ promoName: '2ª unidad -50%', prevPrice: null })],
    ['second_unit'],
  );
  assert.deepEqual(
    [...offerTypesOf({ promoName: 'Club Alcampo 2ª unidad -50% acum en tu tarjeta', prevPrice: null })],
    ['second_unit', 'club'],
  );
  assert.deepEqual(
    [...offerTypesOf({ promoName: '3x2', prevPrice: null })],
    ['multibuy'],
  );
  assert.deepEqual(
    [...offerTypesOf({ promoName: 'Lote a precio fijo', prevPrice: null })],
    ['multibuy'],
  );
  assert.deepEqual(
    [...offerTypesOf({ promoName: 'Lidl Plus', prevPrice: null })],
    ['club'],
  );
});

test('agrupa etiquetas genéricas como otras promociones', () => {
  assert.deepEqual(
    [...offerTypesOf({ promoName: 'Producto en folleto', prevPrice: null })],
    ['other'],
  );
});

test('solo ofrece facetas útiles para cada supermercado', () => {
  assert.deepEqual([...offerTypesForStore('hiperdino')], ['discount']);
  assert.equal(offerTypesForStore('alcampo').includes('club'), true);
  assert.equal(offerTypesForStore('plusfresc').includes('multibuy'), true);
  assert.deepEqual([...offerTypesForStore('lidl')], ['discount', 'second_unit', 'club', 'other']);
});
