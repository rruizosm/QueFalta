export type FoodIndexComponentId = 'nutrition' | 'processing' | 'sustainability';
export type FoodIndexPointKind = 'positive' | 'negative';

export interface FoodIndexComponent {
  id: FoodIndexComponentId;
  score: number;
  weight: number;
}

export interface FoodIndexPoint {
  id: string;
  kind: FoodIndexPointKind;
  /** Puntos oficiales del algoritmo Nutri-Score 2023. */
  points: number;
  /** Máximo de puntos posible para este componente. */
  pointsMax: number;
  value: number;
  unit: string | null;
}

export interface FoodIndex {
  score: number;
  components: FoodIndexComponent[];
  positivePoints: FoodIndexPoint[];
  negativePoints: FoodIndexPoint[];
}

interface BuildFoodIndexInput {
  attributeGroups?: unknown;
  nutriScoreGrade?: unknown;
  nutriScoreData?: unknown;
  novaGroup?: unknown;
  sustainabilityScore?: unknown;
  sustainabilityGrade?: unknown;
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finite = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const score100 = (value: unknown): number | null => {
  const n = finite(value);
  return n == null ? null : clamp(n, 0, 100);
};

const findKnownAttribute = (groups: unknown, id: string): UnknownRecord | null => {
  if (!Array.isArray(groups)) return null;
  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.attributes)) continue;
    for (const attribute of group.attributes) {
      if (
        isRecord(attribute)
        && attribute.id === id
        && attribute.status === 'known'
      ) {
        return attribute;
      }
    }
  }
  return null;
};

const attributeScore = (groups: unknown, id: string): number | null =>
  score100(findKnownAttribute(groups, id)?.match);

const nutritionFallback = (grade: unknown): number | null => {
  if (typeof grade !== 'string') return null;
  const scores: Record<string, number> = { A: 100, B: 75, C: 50, D: 25, E: 0 };
  return scores[grade.trim().toUpperCase()] ?? null;
};

const processingFallback = (novaGroup: unknown): number | null => {
  const group = finite(novaGroup);
  if (group === 1) return 100;
  if (group === 2) return 75;
  if (group === 3) return 50;
  if (group === 4) return 0;
  return null;
};

const sustainabilityFallback = (score: unknown, grade: unknown): number | null => {
  if (typeof grade !== 'string') return null;
  const normalized = grade.trim().toLowerCase();
  if (!['a+', 'a', 'b', 'c', 'd', 'e', 'f'].includes(normalized)) return null;
  return score100(score);
};

const nutriScorePoints = (points: unknown, max: unknown): {
  points: number;
  pointsMax: number;
} | null => {
  const value = finite(points);
  const ceiling = finite(max);
  if (value == null || ceiling == null || ceiling <= 0) return null;
  return { points: clamp(value, 0, ceiling), pointsMax: ceiling };
};

const parsePoints = (nutriScoreData: unknown): FoodIndexPoint[] => {
  if (!isRecord(nutriScoreData) || !isRecord(nutriScoreData.components)) return [];
  const components = nutriScoreData.components;
  return (['positive', 'negative'] as const).flatMap((sourceKind) => {
    const raw = components[sourceKind];
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      if (!isRecord(item) || typeof item.id !== 'string') return [];
      const value = finite(item.value);
      const score = nutriScorePoints(item.points, item.points_max);
      // Un valor nulo significa que Open Food Facts no conoce ese nutriente:
      // no lo presentamos como si fuese una puntuación baja real.
      if (value == null || score == null) return [];
      // Las notas medias no son ni un punto fuerte ni uno débil.
      return [{
        id: item.id,
        kind: sourceKind,
        points: score.points,
        pointsMax: score.pointsMax,
        value,
        unit: typeof item.unit === 'string' ? item.unit : null,
      }];
    });
  });
};

/**
 * Calcula el Índice alimentario usando los matches oficiales de Open Food Facts.
 *
 * Pesos:
 * - nutrición + procesamiento + sostenibilidad: 60 / 25 / 15
 * - nutrición + procesamiento: 70 / 30
 * - nutrición + sostenibilidad: 80 / 20
 * - solo nutrición: 100
 *
 * Sin una puntuación nutricional conocida no se publica el índice.
 */
export function buildFoodIndex({
  attributeGroups,
  nutriScoreGrade,
  nutriScoreData,
  novaGroup,
  sustainabilityScore,
  sustainabilityGrade,
}: BuildFoodIndexInput): FoodIndex | null {
  const nutrition =
    attributeScore(attributeGroups, 'nutriscore')
    ?? nutritionFallback(nutriScoreGrade);
  if (nutrition == null) return null;

  // NOVA es el dato de procesamiento que se muestra en la ficha y debe formar
  // parte del índice aunque Open Food Facts no incluya attribute_groups_data.
  // Un NOVA 4 aporta 0 puntos al bloque y, por tanto, reduce el total según su peso.
  const processing =
    processingFallback(novaGroup)
    ?? attributeScore(attributeGroups, 'nova');
  const sustainability =
    attributeScore(attributeGroups, 'ecoscore')
    ?? sustainabilityFallback(sustainabilityScore, sustainabilityGrade);

  let weights: Record<FoodIndexComponentId, number>;
  if (processing != null && sustainability != null) {
    weights = { nutrition: 60, processing: 25, sustainability: 15 };
  } else if (processing != null) {
    weights = { nutrition: 70, processing: 30, sustainability: 0 };
  } else if (sustainability != null) {
    weights = { nutrition: 80, processing: 0, sustainability: 20 };
  } else {
    weights = { nutrition: 100, processing: 0, sustainability: 0 };
  }

  const components: FoodIndexComponent[] = [
    { id: 'nutrition', score: nutrition, weight: weights.nutrition },
  ];
  if (processing != null && weights.processing > 0) {
    components.push({
      id: 'processing',
      score: processing,
      weight: weights.processing,
    });
  }
  if (sustainability != null && weights.sustainability > 0) {
    components.push({
      id: 'sustainability',
      score: sustainability,
      weight: weights.sustainability,
    });
  }

  // Conserva la precisión que entrega Open Food Facts y redondea solo el total.
  const score = clamp(Math.round(
    nutrition * (weights.nutrition / 100)
    + (processing ?? 0) * (weights.processing / 100)
    + (sustainability ?? 0) * (weights.sustainability / 100),
  ), 0, 100);

  const points = parsePoints(nutriScoreData);
  return {
    score,
    components,
    positivePoints: points
      .filter((point) => point.kind === 'positive'),
    negativePoints: points
      .filter((point) => point.kind === 'negative'),
  };
}

/** Color semántico de rojo a verde para el índice 0-100. */
export function foodIndexColor(score: number): string {
  if (score >= 80) return '#2f8f4e';
  if (score >= 60) return '#78a641';
  if (score >= 40) return '#d09a23';
  if (score >= 20) return '#d96b2b';
  return '#c83b32';
}

export function foodIndexTextColor(score: number): string {
  return score >= 40 && score < 60 ? '#2b2521' : '#ffffff';
}

/** Color de la escala 1-10, donde 10 siempre significa mejor. */
export function foodPointColor(kind: FoodIndexPointKind): string {
  return kind === 'positive' ? '#2f8f4e' : '#c83b32';
}
