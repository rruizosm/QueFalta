import assert from 'node:assert/strict';
import test from 'node:test';
import { structureNutritionText } from '../../src/lib/nutritionDisplay.ts';

test('structures Carrefour nutrition lines with a descriptive icon and value', () => {
  assert.deepEqual(
    structureNutritionText([
      'Valores medios por 100 g:',
      'Valor energético 420 kJ / 100 kcal',
      'Grasas 4,5 g (de las cuales saturadas 1,2 g)',
      'Hidratos de carbono 12 g',
      'Proteínas 6,4 g',
      'Sal 0,8 g',
    ].join('\n')),
    [
      { label: 'Valores medios por 100 g', value: null, icon: 'scale-outline' },
      { label: 'Valor energético', value: '420 kJ / 100 kcal', icon: 'flash-outline' },
      { label: 'Grasas', value: '4,5 g (de las cuales saturadas 1,2 g)', icon: 'water-outline' },
      { label: 'Hidratos de carbono', value: '12 g', icon: 'restaurant-outline' },
      { label: 'Proteínas', value: '6,4 g', icon: 'barbell-outline' },
      { label: 'Sal', value: '0,8 g', icon: 'sparkles-outline' },
    ],
  );
});

test('supports colon-separated and Catalan nutrition labels', () => {
  assert.deepEqual(
    structureNutritionText('Greixos saturats: 2,1 g\nSucres: 8 g\nFibra: 3 g'),
    [
      { label: 'Greixos saturats', value: '2,1 g', icon: 'contrast-outline' },
      { label: 'Sucres', value: '8 g', icon: 'cube-outline' },
      { label: 'Fibra', value: '3 g', icon: 'leaf-outline' },
    ],
  );
});
