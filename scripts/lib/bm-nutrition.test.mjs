import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyBmNutritionPayload,
  bmNutritionUrl,
  needsBmNutritionRefresh,
  parseBmNutrition,
  previousBmNutrition,
} from './bm-nutrition.mjs';

const sample = {
  nutrilabel: { productInformation: {
    nutritionalValues: [{ values: [
      { name: 'Valor energético', valueStr: '1357', measurementUnit: 'kj', servingSize: '100' },
      { name: 'Valor energético', valueStr: '322', measurementUnit: 'kcal', servingSize: '100' },
      { name: 'Grasas', valueStr: '8', measurementUnit: 'g', servingSize: '100', children: [
        { name: 'Ácidos grasos saturados', valueStr: '5.7', measurementUnit: 'g', servingSize: '100' },
      ] },
      { name: 'Azúcares', valueStr: '56', measurementUnit: 'g', servingSize: '100' },
    ] }],
    ingredientsInformation: [{ ingredientsList: '<strong>LECHE</strong>, AZÚCAR Y <strong>LACTOSA</strong>.' }],
    allergensInformation: [{ allergens: [
      { allergenName: 'Leche y derivados' }, { allergenName: 'Leche y derivados' },
    ] }],
  } },
  messages: [{ type: 'Información de conservación', name: 'Conservar en frío.' }],
};

test('BM normaliza nutrientes anidados, referencia, ingredientes y alérgenos reales', () => {
  assert.equal(bmNutritionUrl('8422414015876'),
    'https://cdn-bm.aktiosdigitalservices.com/tol/bm/media/product/nutritional-info/8422414015876.json');
  assert.deepEqual(parseBmNutrition(sample), {
    nutrition: 'Por 100 g\nValor energético: 1357 kj\nValor energético: 322 kcal\nGrasas: 8 g\nÁcidos grasos saturados: 5.7 g\nAzúcares: 56 g',
    ingredients: 'LECHE, AZÚCAR Y LACTOSA.',
    allergens: 'Leche y derivados',
    conservation: 'Conservar en frío.',
  });
});

test('un JSON 200 vacío no inventa datos y no borra una ficha previa', () => {
  assert.deepEqual(parseBmNutrition({ messages: [] }), {
    nutrition: null, ingredients: null, allergens: null, conservation: null,
  });
  const row = previousBmNutrition({ ean: '8422414015876' }, {
    detail_ean: '8422414015876', detail_synced_at: '2026-01-01T00:00:00Z',
    nutrition: 'Por 100 g\nGrasas: 8 g', ingredients: 'LECHE', allergens: null,
    conservation: null,
  });
  assert.equal(applyBmNutritionPayload([row], { messages: [] }, '2026-09-28T00:00:00Z'), false);
  assert.equal(row.nutrition, 'Por 100 g\nGrasas: 8 g');
  assert.equal(row.detail_synced_at, '2026-01-01T00:00:00Z');
});

test('la caducidad evita consultas repetidas y un cambio de EAN invalida el detalle', () => {
  const now = Date.parse('2026-09-28T00:00:00Z');
  const fresh = previousBmNutrition({ ean: '8422414015876' }, {
    detail_ean: '8422414015876', detail_synced_at: '2026-09-20T00:00:00Z',
    nutrition: 'Grasas: 8 g',
  });
  assert.equal(needsBmNutritionRefresh(fresh, now, 90), false);
  const changed = previousBmNutrition({ ean: '8422414001282' }, {
    detail_ean: '8422414015876', detail_synced_at: '2026-09-20T00:00:00Z',
    nutrition: 'Grasas: 8 g',
  });
  assert.equal(changed.nutrition, null);
  assert.equal(needsBmNutritionRefresh(changed, now, 90), true);
});
