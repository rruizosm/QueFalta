import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { nutritionValueRows, structureNutritionText } from '../../src/lib/nutritionDisplay.ts';

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

test('builds nutrition values when a food index is unavailable', () => {
  const rows = nutritionValueRows({
    source: 'catalog',
    productName: null,
    nutriScoreGrade: null,
    nutriScoreScore: null,
    novaGroup: null,
    additives: [],
    foodIndex: null,
    nutriments: {
      energyKcal: 123,
      fat: 4.5,
      saturatedFat: null,
      carbohydrates: 18,
      sugars: 2,
      fiber: null,
      proteins: 7.25,
      salt: 0.3,
    },
  }, {
    energy: 'Energía',
    fat: 'Grasas',
    saturatedFat: 'Saturadas',
    carbohydrates: 'Hidratos',
    sugars: 'Azúcares',
    fiber: 'Fibra',
    proteins: 'Proteínas',
    salt: 'Sal',
  }, 'es-ES');

  assert.deepEqual(rows.map(({ key, value, icon }) => ({ key, value, icon })), [
    { key: 'energy', value: '123 kcal', icon: 'flash-outline' },
    { key: 'fat', value: '4,5 g', icon: 'water-outline' },
    { key: 'carbohydrates', value: '18 g', icon: 'restaurant-outline' },
    { key: 'sugars', value: '2 g', icon: 'cube-outline' },
    { key: 'proteins', value: '7,3 g', icon: 'barbell-outline' },
    { key: 'salt', value: '0,3 g', icon: 'sparkles-outline' },
  ]);
});

test('food index detail does not duplicate the nutritional values', async () => {
  const button = await readFile(
    new URL('../../src/components/NutritionInfoButton.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(button, /nutritionValueRows/);
  assert.doesNotMatch(button, /nutrition\.index\.valuesTitle/);
  assert.doesNotMatch(button, /nutrition\.noNutrients/);
});

test('nutrition is grouped with product characteristics instead of a separate card', async () => {
  const root = new URL('../../src/components/', import.meta.url);
  const modalNames = [
    'ProductDetailModal.tsx',
    'AlcampoProductModal.tsx',
    'AmetllerProductModal.tsx',
    'BonareaProductModal.tsx',
    'BonpreuProductModal.tsx',
    'CarrefourProductModal.tsx',
    'CondisProductModal.tsx',
    'ConsumProductModal.tsx',
    'DiaProductModal.tsx',
    'TapestryProductModal.tsx',
    'PlusfrescProductModal.tsx',
  ];
  const [section, discovery, ...modals] = await Promise.all([
    readFile(new URL('ProductInfoSections.tsx', root), 'utf8'),
    readFile(new URL('ProductDetailDiscoverySection.tsx', root), 'utf8'),
    ...modalNames.map((name) => readFile(new URL(name, root), 'utf8')),
  ]);

  assert.match(section, /nutritionInfo\?: OpenFoodFactsNutrition/);
  assert.match(section, /<StructuredNutritionValue value=\{value\} info=\{item\.nutritionInfo\}/);
  assert.doesNotMatch(discovery, /NutritionValuesSummary/);
  for (const modal of modals) {
    assert.match(modal, /key: 'nutrition'[\s\S]*nutritionInfo: nutrition\.info/);
  }
});

test('nutrition expands and collapses with a calm coordinated transition', async () => {
  const section = await readFile(
    new URL('../../src/components/ProductInfoSections.tsx', import.meta.url),
    'utf8',
  );

  assert.match(section, /useDerivedValue\(\(\) => \{[\s\S]*withTiming\(target, \{ duration: 360/);
  assert.match(section, /height: nutritionHeight \* revealProgress\.value/);
  assert.match(section, /opacity: revealProgress\.value/);
  assert.match(section, /activeOpacity=\{structuredNutrition \? 0\.94 : 0\.6\}/);
  assert.match(section, /style=\{\[styles\.nutritionReveal, nutritionRevealStyle\]\}/);
  assert.match(section, /accessibilityElementsHidden=\{!expanded\}/);
  assert.doesNotMatch(section, /nutritionEntering|nutritionExiting|LinearTransition/);
  assert.match(section, /if \(!structuredNutrition && !reducedMotion\)/);
});

test('bonÀrea calculates its food index locally without an EAN or Open Food Facts', async () => {
  const modal = await readFile(
    new URL('../../src/components/BonareaProductModal.tsx', import.meta.url),
    'utf8',
  );
  const disclosure = modal.match(/useNutritionInfoDisclosure\(\{[\s\S]*?\}\);/)?.[0] ?? '';

  assert.match(disclosure, /store: 'bonarea'/);
  assert.match(disclosure, /fallbackNutrition: product\?\.nutrition/);
  assert.match(disclosure, /fallbackIngredients: product\?\.ingredients/);
  assert.doesNotMatch(disclosure, /\bean\s*:/);
  assert.match(modal, /<ProductDetailDiscoverySection[\s\S]*nutrition=\{nutrition\}/);
});

test('DIA calculates its food index locally without an EAN or Open Food Facts', async () => {
  const modal = await readFile(
    new URL('../../src/components/DiaProductModal.tsx', import.meta.url),
    'utf8',
  );
  const disclosure = modal.match(/useNutritionInfoDisclosure\(\{[\s\S]*?\}\);/)?.[0] ?? '';

  assert.match(disclosure, /store: 'dia'/);
  assert.match(disclosure, /fallbackNutrition: product\?\.nutrition/);
  assert.match(disclosure, /fallbackCategoryName: product\?\.categoryName/);
  assert.match(disclosure, /fallbackIngredients: product\?\.ingredients/);
  assert.doesNotMatch(disclosure, /\bean\s*:/);
  assert.match(modal, /<ProductDetailDiscoverySection[\s\S]*nutrition=\{nutrition\}/);
});

test('Condis calculates its food index locally and accepts its GR nutrient unit', async () => {
  const [modal, parser] = await Promise.all([
    readFile(new URL('../../src/components/CondisProductModal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/api/mercadonaNutrition.ts', import.meta.url), 'utf8'),
  ]);
  const disclosure = modal.match(/useNutritionInfoDisclosure\(\{[\s\S]*?\}\);/)?.[0] ?? '';

  assert.match(disclosure, /store: 'condis'/);
  assert.match(disclosure, /fallbackNutrition: product\?\.nutrition/);
  assert.match(disclosure, /fallbackCategoryName: product\?\.categoryName/);
  assert.match(disclosure, /fallbackIngredients: product\?\.ingredients/);
  assert.doesNotMatch(disclosure, /\bean\s*:/);
  assert.match(modal, /<ProductDetailDiscoverySection[\s\S]*nutrition=\{nutrition\}/);
  assert.equal(parser.match(/g\(\?:r\)\?\\b/g)?.length, 7);
});
