import { buildFoodIndex, type FoodIndex, type FoodIndexPoint } from '../lib/foodIndex';
import type { OpenFoodFactsNutrition } from './openFoodFacts';

/** Tabla que guarda el sync de Mercadona en mercadona_products.nutrition. */
export interface MercadonaNutritionTable {
  nutrients?: Array<{
    name?: string | null;
    unit?: string | null;
    amount?: string | number | null;
    sub_nutrients?: { items?: Array<{ name?: string | null; unit?: string | null; amount?: string | number | null }> | null } | null;
  }> | null;
  per_quantity?: string | null;
  energy_joules?: { amount?: string | number | null; unit?: string | null } | null;
  energy_calories?: { amount?: string | number | null; unit?: string | null } | null;
  accessible_text?: string | null;
}

export interface MercadonaNutritionContext {
  productName?: string | null;
  categoryName?: string | null;
  ingredients?: string | null;
}

type FoodKind = 'general' | 'beverage' | 'fatOilNuts' | 'cheese' | 'redMeat';
type NutriGrade = 'A' | 'B' | 'C' | 'D' | 'E';

const num = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const key = (value: unknown) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim();

const foodText = (context: MercadonaNutritionContext) => key([
  context.productName,
  context.categoryName,
].filter(Boolean).join(' '));

const ingredientsText = (context: MercadonaNutritionContext) => key(context.ingredients);

const amountFor = (table: MercadonaNutritionTable, ...names: string[]) => {
  const wanted = names.map(key);
  for (const nutrient of table.nutrients ?? []) {
    if (wanted.includes(key(nutrient.name))) return num(nutrient.amount);
    for (const sub of nutrient.sub_nutrients?.items ?? []) {
      if (wanted.includes(key(sub.name))) return num(sub.amount);
    }
  }
  return null;
};

const amountFromText = (text: string, pattern: RegExp) => {
  const match = text.match(pattern);
  return match ? num(match[1].replace(',', '.')) : null;
};

/** Convierte las tablas textuales de los catálogos a la estructura usada por el
 * cálculo local. Carrefour, Ametller y Plusfresc publican los valores por 100
 * g/ml como texto, a diferencia de Mercadona, que los entrega estructurados. */
export function parseCatalogNutrition(
  value: unknown,
  context: MercadonaNutritionContext = {},
): OpenFoodFactsNutrition | null {
  const text = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string').join('\n')
    : typeof value === 'string' ? value : '';
  if (!text.trim()) return null;

  const energyKj = amountFromText(text, /(\d+(?:[.,]\d+)?)\s*k(?:j|joules?)\b/i);
  const energyKcal = amountFromText(text, /(\d+(?:[.,]\d+)?)\s*k(?:cal|calor[ií]as?)\b/i);
  const fat = amountFromText(text, /(?:\bgrasas?\b|\bgreixos?\b)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*g\b/i);
  const saturatedFat = amountFromText(
    text,
    /(?:(?:\bgrasas?\b|\bgreixos?\b)\s*)?(?:saturadas?|saturats?|saturados?)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*g\b/i,
  );
  const carbohydrates = amountFromText(
    text,
    /(?:hidratos? de carbono|carbohidratos?|carbohidrats?|hidrats? de carboni)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*g\b/i,
  );
  const sugars = amountFromText(text, /(?:az[uú]cares?|sucres?)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*g\b/i);
  const fiber = amountFromText(text, /(?:fibra)(?:\s+(?:alimentaria|alimentària))?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*g\b/i);
  const proteins = amountFromText(text, /(?:prote[ií]nas?|prote[iï](?:nes?|na))\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*g\b/i);
  const salt = amountFromText(text, /(?:sal)(?:\s+(?:equivalente|equivalent))?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*g\b/i);

  const nutrients: Array<[string, number | null]> = [
    ['Grasas', fat],
    ['Grasas saturadas', saturatedFat],
    ['Hidratos de carbono', carbohydrates],
    ['Azúcares', sugars],
    ['Fibra', fiber],
    ['Proteínas', proteins],
    ['Sal', salt],
  ];
  const table: MercadonaNutritionTable = {
    per_quantity: /(?:por|per)\s*100\s*ml\b/i.test(text) ? '100 ml' : '100 g',
    energy_joules: energyKj == null ? null : { amount: energyKj, unit: 'kJ' },
    energy_calories: energyKcal == null ? null : { amount: energyKcal, unit: 'kcal' },
    nutrients: nutrients.flatMap(([name, amount]) => amount == null ? [] : [{ name, amount, unit: 'g' }]),
  };
  const parsed = parseMercadonaNutrition(table, context);
  return parsed ? { ...parsed, source: 'catalog' } : null;
}

const negativePoint = (id: string, value: number, unit: string | null, points: number, pointsMax: number): FoodIndexPoint => ({
  id, value, unit, points, pointsMax, kind: 'negative',
});

const positivePoint = (id: string, value: number, unit: string, points: number, pointsMax: number): FoodIndexPoint => ({
  id, value, unit, points, pointsMax, kind: 'positive',
});

/** Puntos por superar cada umbral. El primero superado vale un punto. */
const pointsAbove = (value: number, thresholds: number[]) =>
  thresholds.filter((threshold) => value > threshold).length;

/** Puntos cuando el valor alcanza cada umbral (componentes favorables). */
const pointsAtLeast = (value: number, thresholds: number[]) =>
  thresholds.filter((threshold) => value > threshold).length;

const GENERAL_ENERGY = [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350];
const GENERAL_SATURATES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const GENERAL_SUGARS = [3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51];
const SALT = Array.from({ length: 20 }, (_, i) => (i + 1) * 0.2);
const FIBER = [3, 4.1, 5.2, 6.3, 7.4];
const PROTEINS = [2.4, 4.8, 7.2, 9.6, 12, 14, 17];
const FVL = [40, 60, 80];
const BEVERAGE_ENERGY = [30, 90, 150, 210, 240, 270, 300, 330, 360, 390];
const BEVERAGE_SUGARS = [0.5, 2, 3.5, 5, 6, 7, 8, 9, 10, 11];
const BEVERAGE_PROTEINS = [1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3];
const FAT_SATURATED_ENERGY = [120, 240, 360, 480, 600, 720, 840, 960, 1080, 1200];
const FAT_SATURATE_RATIO = [10, 16, 22, 28, 34, 40, 46, 52, 58, 64];

const contains = (text: string, pattern: RegExp) => pattern.test(text);

function foodKind(table: MercadonaNutritionTable, context: MercadonaNutritionContext): FoodKind {
  const text = foodText(context);
  if (/\b100\s*ml\b/i.test(table.per_quantity ?? '') || contains(text, /\b(agua|bebida|refresco|zumo|jugo|batido|leche|horchata|smoothie|nectar)\b/)) {
    return 'beverage';
  }
  if (contains(text, /\b(aceite|mantequilla|margarina|manteca|frutos secos|almendra|avellana|nuez|pistacho|cacahuete|semilla)\b/)) {
    return 'fatOilNuts';
  }
  if (contains(text, /\b(queso|mozzarella|parmesano|cheddar|gouda|manchego|brie|camembert)\b/)) return 'cheese';
  if (contains(text, /\b(ternera|vacuno|buey|cerdo|cordero|hamburguesa|chorizo|salchicha|jamon)\b/)) return 'redMeat';
  return 'general';
}

/**
 * El JSON de Mercadona no aporta un porcentaje de fruta/verdura/legumbre. Solo
 * se concede el máximo cuando nombre o categoría identifican inequívocamente
 * un producto de esos grupos, o un aceite de oliva/aguacate.
 */
function fvlPercent(kind: FoodKind, context: MercadonaNutritionContext): number {
  const text = foodText(context);
  if (kind === 'fatOilNuts' && contains(text, /\b(aceite de oliva|aceite.*aguacate|frutos secos|almendra|avellana|nuez|pistacho|cacahuete)\b/)) return 100;
  if (contains(text, /\b(fruta|verdura|hortaliza|legumbre|tomate|zanahoria|espinaca|brocoli|manzana|platano|naranja)\b/)) return 100;
  return 0;
}

const sweetenerPresent = (context: MercadonaNutritionContext) =>
  contains(ingredientsText(context), /\b(edulcorante|aspartamo|sucralosa|acesulfamo|sacarina|ciclamato|estevia)\b/);

const gradeFor = (kind: FoodKind, score: number, isWater: boolean): NutriGrade => {
  if (kind === 'beverage') {
    if (isWater) return 'A';
    if (score <= 2) return 'B';
    if (score <= 6) return 'C';
    if (score <= 9) return 'D';
    return 'E';
  }
  if (kind === 'fatOilNuts') {
    if (score <= -6) return 'A';
    if (score <= 2) return 'B';
  } else {
    if (score <= 0) return 'A';
    if (score <= 2) return 'B';
  }
  if (score <= 10) return 'C';
  if (score <= 18) return 'D';
  return 'E';
};

/**
 * Convierte la tabla de Mercadona a la forma que usa el modal. Aplica las tablas
 * Nutri-Score para alimentos generales, bebidas y grasas/aceites/frutos secos:
 * proteínas solo con N < 11, salvo quesos; fibra y F/V/L siempre cuentan; y
 * proteínas de carne roja se limitan a dos puntos.
 */
export function parseMercadonaNutrition(
  value: unknown,
  context: MercadonaNutritionContext = {},
): OpenFoodFactsNutrition | null {
  const table = (Array.isArray(value) ? value[0] : value) as MercadonaNutritionTable | undefined;
  if (!table || typeof table !== 'object' || !Array.isArray(table.nutrients)) return null;

  const energyKcal = num(table.energy_calories?.amount);
  const energyKj = num(table.energy_joules?.amount);
  const fat = amountFor(table, 'grasas', 'fat');
  const saturatedFat = amountFor(table, 'saturadas', 'grasas saturadas', 'saturated fat');
  const carbohydrates = amountFor(table, 'hidratos de carbono', 'carbohidratos', 'carbohydrates');
  const sugars = amountFor(table, 'azucares', 'sugars');
  const proteins = amountFor(table, 'proteinas', 'proteins');
  const salt = amountFor(table, 'sal', 'salt');
  const fiber = amountFor(table, 'fibra', 'fiber');
  const values = [energyKcal, energyKj, fat, saturatedFat, carbohydrates, sugars, proteins, salt, fiber];
  if (!values.some((entry) => entry != null)) return null;

  const kind = foodKind(table, context);
  const fvl = fvlPercent(kind, context);
  const negative: FoodIndexPoint[] = [];
  const positive: FoodIndexPoint[] = [];
  const isBeverage = kind === 'beverage';
  const isFatOilNuts = kind === 'fatOilNuts';

  if (energyKj != null) {
    const valueForPoints = isFatOilNuts && saturatedFat != null ? saturatedFat * 37 : energyKj;
    const thresholds = isFatOilNuts ? FAT_SATURATED_ENERGY : isBeverage ? BEVERAGE_ENERGY : GENERAL_ENERGY;
    negative.push(negativePoint('energy', valueForPoints, isFatOilNuts ? 'kJ de saturadas' : 'kJ', pointsAbove(valueForPoints, thresholds), 10));
  }
  if (sugars != null) {
    negative.push(negativePoint('sugars', sugars, 'g', pointsAbove(sugars, isBeverage ? BEVERAGE_SUGARS : GENERAL_SUGARS), isBeverage ? 10 : 15));
  }
  if (saturatedFat != null) {
    const ratio = isFatOilNuts && fat != null && fat > 0 ? saturatedFat / fat * 100 : saturatedFat;
    const thresholds = isFatOilNuts ? FAT_SATURATE_RATIO : GENERAL_SATURATES;
    negative.push(negativePoint('saturated_fat', ratio, isFatOilNuts ? '% de grasas' : 'g', pointsAbove(ratio, thresholds), 10));
  }
  if (salt != null) negative.push(negativePoint('salt', salt, 'g', pointsAbove(salt, SALT), 20));
  if (isBeverage && sweetenerPresent(context)) negative.push(negativePoint('sweeteners', 1, null, 4, 4));

  if (fiber != null) positive.push(positivePoint('fiber', fiber, 'g', pointsAtLeast(fiber, FIBER), 5));
  if (fvl > 0) {
    const max = isBeverage ? 6 : 5;
    const points = fvl > 80 ? max : fvl > 60 ? 2 : fvl > 40 ? 1 : 0;
    positive.push(positivePoint('fruits_vegetables_legumes', fvl, '%', points, max));
  }

  const negativeTotal = negative.reduce((sum, point) => sum + point.points, 0);
  const proteinMax = kind === 'redMeat' ? 2 : 7;
  const proteinPoints = proteins == null ? 0 : Math.min(
    proteinMax,
    pointsAtLeast(proteins, isBeverage ? BEVERAGE_PROTEINS : PROTEINS),
  );
  const proteinsCount = kind === 'cheese' || (isFatOilNuts ? negativeTotal < 7 : negativeTotal < 11);
  if (proteins != null) positive.push(positivePoint('proteins', proteins, 'g', proteinsCount ? proteinPoints : 0, proteinMax));

  const countedPositive = positive
    .filter((point) => point.id !== 'proteins' || proteinsCount)
    .reduce((sum, point) => sum + point.points, 0);
  const nutritionScoreRaw = negativeTotal - countedPositive;
  const isWater = isBeverage
    && contains(foodText(context), /\bagua\b/)
    && !sweetenerPresent(context)
    && energyKj === 0
    && (sugars ?? 0) === 0
    && (saturatedFat ?? 0) === 0
    && (salt ?? 0) === 0;
  const grade = gradeFor(kind, nutritionScoreRaw, isWater);
  // El Índice alimentario conserva la escala continua original 0–100. La letra
  // Nutri-Score se calcula y conserva como referencia, pero no aplasta el
  // resultado a cinco escalones (A=100, B=75…).
  const nutritionScore = Math.max(
    0,
    Math.min(100, Math.round(100 - ((nutritionScoreRaw + 10) * 2))),
  );
  const foodIndex: FoodIndex | null = buildFoodIndex({ nutritionScore });

  return {
    source: 'mercadona' as const,
    productName: null,
    nutriScoreGrade: grade,
    nutriScoreScore: nutritionScoreRaw,
    novaGroup: null,
    additives: [],
    foodIndex: foodIndex && {
      ...foodIndex,
      positivePoints: positive,
      negativePoints: negative,
    },
    nutriments: { energyKcal, fat, saturatedFat, carbohydrates, sugars, fiber, proteins, salt },
  };
}
