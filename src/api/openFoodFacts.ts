import { buildFoodIndex, type FoodIndex } from '../lib/foodIndex';

export interface OpenFoodFactsNutrition {
  productName: string | null;
  nutriScoreGrade: string | null;
  nutriScoreScore: number | null;
  novaGroup: number | null;
  additives: OpenFoodFactsAdditive[];
  foodIndex: FoodIndex | null;
  nutriments: {
    energyKcal: number | null;
    fat: number | null;
    saturatedFat: number | null;
    carbohydrates: number | null;
    sugars: number | null;
    fiber: number | null;
    proteins: number | null;
    salt: number | null;
  };
}

export interface OpenFoodFactsAdditive {
  code: string;
  name: string | null;
}

const OFF_BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';
// Cambiar la versión invalida resultados calculados con una fórmula anterior
// durante Fast Refresh o una sesión que ya hubiera precargado el producto.
const INDEX_CALCULATION_VERSION = '3';
const OFF_CACHE = new Map<string, Promise<OpenFoodFactsNutrition | null>>();
const OFF_FIELDS = [
  'product_name',
  'nutriscore_grade',
  'nutriscore_score',
  'nutriscore_data',
  'nutriments',
  'nova_group',
  'additives_tags',
  'ingredients',
  'ecoscore_score',
  'ecoscore_grade',
  'environmental_score_score',
  'environmental_score_grade',
  'attribute_groups_data',
].join(',');

const num = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const additiveCode = (value: string) =>
  value.replace(/^[a-z]{2}:/i, '').trim().toUpperCase();

const additiveNames = (ingredients: unknown) => {
  const names = new Map<string, string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const ingredient = value as Record<string, unknown>;
    const code = typeof ingredient.id === 'string' ? additiveCode(ingredient.id) : '';
    const name = typeof ingredient.text === 'string' ? ingredient.text.trim() : '';
    if (/^E\d{3,4}[A-Z]?$/.test(code) && name && name.toUpperCase() !== code) {
      names.set(code, name);
    }
    visit(ingredient.ingredients);
  };
  visit(ingredients);
  return names;
};

const additives = (value: unknown, ingredients: unknown): OpenFoodFactsAdditive[] => {
  if (!Array.isArray(value)) return [];
  const names = additiveNames(ingredients);
  return [...new Set(value.flatMap((tag) => {
    if (typeof tag !== 'string') return [];
    const code = additiveCode(tag);
    return code ? [code] : [];
  }))].map((code) => ({ code, name: names.get(code) ?? null }));
};

export function fetchOpenFoodFactsNutrition(ean: string): Promise<OpenFoodFactsNutrition | null> {
  const code = ean.replace(/\D/g, '');
  if (!code) return Promise.resolve(null);
  const cacheKey = `${INDEX_CALCULATION_VERSION}:${code}`;
  const cached = OFF_CACHE.get(cacheKey);
  if (cached) return cached;

  const request = (async () => {
    const url =
      `${OFF_BASE_URL}/${code}.json`
      + `?fields=${encodeURIComponent(OFF_FIELDS)}&cc=es`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'QueFalta/1.0 (contacto@quefalta.es)',
      },
    });
    if (!res.ok) throw new Error(`OpenFoodFacts ${res.status}`);

    const json = await res.json();
    if (json?.status !== 1 || !json?.product) return null;

    const p = json.product;
    const n = p.nutriments ?? {};
    const nutriScoreGrade =
      typeof p.nutriscore_grade === 'string'
        ? p.nutriscore_grade.toUpperCase()
        : null;
    const nutriScoreScore = num(p.nutriscore_score);
    const novaGroup = num(p.nova_group ?? p.nova_groups);
    return {
      productName: p.product_name ?? null,
      nutriScoreGrade,
      nutriScoreScore,
      novaGroup: novaGroup != null && novaGroup >= 1 && novaGroup <= 4
        ? novaGroup
        : null,
      additives: additives(p.additives_tags, p.ingredients),
      foodIndex: buildFoodIndex({
        attributeGroups: p.attribute_groups_data,
        nutriScoreGrade,
        nutriScoreData: p.nutriscore_data,
        novaGroup,
        sustainabilityScore: p.environmental_score_score ?? p.ecoscore_score,
        sustainabilityGrade: p.environmental_score_grade ?? p.ecoscore_grade,
      }),
      nutriments: {
        energyKcal: num(n['energy-kcal_100g']),
        fat: num(n.fat_100g),
        saturatedFat: num(n['saturated-fat_100g']),
        carbohydrates: num(n.carbohydrates_100g),
        sugars: num(n.sugars_100g),
        fiber: num(n.fiber_100g),
        proteins: num(n.proteins_100g),
        salt: num(n.salt_100g),
      },
    };
  })();

  OFF_CACHE.set(cacheKey, request);
  request.catch(() => OFF_CACHE.delete(cacheKey));
  return request;
}
