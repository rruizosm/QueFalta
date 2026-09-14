import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DRY_RUN = '1';

const {
  carrefourDetailColumns,
  findNutritionInfo,
} = await import('../sync-carrefour.mjs');

const nutritionInfo = {
  ingredientes: '<p>Leche, cacao y azúcar.</p>',
  alergenos: {
    contiene: 'Leche',
    puedeContener: 'Frutos secos',
  },
  valorMedioPor: '100 g',
  valorEnergetico: {
    kilojulios: { valor: '840 kJ' },
    kilocalorias: { valor: '200 kcal' },
  },
  grasas: {
    nombre: 'Grasas (g)',
    valor: '8 g',
    listaInfo: [{ nombre: 'de las cuales saturadas (g)', valor: '4 g' }],
  },
  hidratos: {
    nombre: 'Hidratos de carbono (g)',
    valor: '22 g',
    listaInfo: [{ nombre: 'de los cuales azúcares (g)', valor: '18 g' }],
  },
  fibra: { nombre: 'Fibra (g)', valor: '2 g' },
  proteinas: { nombre: 'Proteínas (g)', valor: '6 g' },
  sal: { nombre: 'Sal (g)', valor: '0,2 g' },
  masInfo: [{
    listaInfo: [
      { nombre: 'Condiciones de conservación', valor: 'Conservar refrigerado.' },
      { nombre: 'Modo de empleo', valor: 'Consumir directamente.' },
      { nombre: 'Denominación legal', valor: 'Postre lácteo con cacao.' },
      { nombre: 'País de origen', valor: 'España.' },
      { nombre: 'Dirección del operador', valor: 'Calle Ejemplo 1, Madrid.' },
      { nombre: 'Razón social fabricante', valor: 'Fabricante Ejemplo, S.A.' },
    ],
  }],
};

test('Carrefour maps the complete product information requested by the app', () => {
  assert.deepEqual(carrefourDetailColumns(nutritionInfo), {
    ingredients: 'Leche, cacao y azúcar.',
    allergens: 'Contiene: Leche\nPuede contener: Frutos secos',
    nutrition: [
      'Valores medios por 100 g:',
      'Valor energético 840 kJ / 200 kcal',
      'Grasas 8 g (de las cuales saturadas 4 g)',
      'Hidratos de carbono 22 g (de los cuales azúcares 18 g)',
      'Fibra 2 g',
      'Proteínas 6 g',
      'Sal 0,2 g',
    ].join('\n'),
    conservation: 'Conservar refrigerado.',
    preparation: 'Consumir directamente.',
    denomination: 'Postre lácteo con cacao.',
    origin: 'España.',
    operator: 'Calle Ejemplo 1, Madrid.\nFabricante Ejemplo, S.A.',
  });
});

test('Carrefour finds nutrition information inside the nested page state', () => {
  assert.equal(
    findNutritionInfo({ page: { product: { nutrition_info: nutritionInfo } } }),
    nutritionInfo,
  );
});
