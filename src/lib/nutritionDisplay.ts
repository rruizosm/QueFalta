import type { OpenFoodFactsNutrition } from '../api/openFoodFacts';

export type NutritionDisplayIcon =
  | 'analytics-outline'
  | 'barbell-outline'
  | 'contrast-outline'
  | 'cube-outline'
  | 'flash-outline'
  | 'leaf-outline'
  | 'restaurant-outline'
  | 'scale-outline'
  | 'sparkles-outline'
  | 'water-outline';

export interface StructuredNutritionLine {
  label: string;
  value: string | null;
  icon: NutritionDisplayIcon;
}

export interface NutritionValueRow {
  key: string;
  label: string;
  value: string;
  icon: NutritionDisplayIcon;
}

const formatNutritionValue = (value: number | null, unit: string, locale: string) => value == null
  ? null
  : `${value.toLocaleString(locale, { maximumFractionDigits: 1 })} ${unit}`;

export function nutritionValueRows(
  info: OpenFoodFactsNutrition,
  labels: Record<string, string>,
  locale: string,
): NutritionValueRow[] {
  const optionalRows: (Omit<NutritionValueRow, 'value'> & { value: string | null })[] = [
    { key: 'energy', label: labels.energy, value: formatNutritionValue(info.nutriments.energyKcal, 'kcal', locale), icon: 'flash-outline' },
    { key: 'fat', label: labels.fat, value: formatNutritionValue(info.nutriments.fat, 'g', locale), icon: 'water-outline' },
    { key: 'saturatedFat', label: labels.saturatedFat, value: formatNutritionValue(info.nutriments.saturatedFat, 'g', locale), icon: 'contrast-outline' },
    { key: 'carbohydrates', label: labels.carbohydrates, value: formatNutritionValue(info.nutriments.carbohydrates, 'g', locale), icon: 'restaurant-outline' },
    { key: 'sugars', label: labels.sugars, value: formatNutritionValue(info.nutriments.sugars, 'g', locale), icon: 'cube-outline' },
    { key: 'fiber', label: labels.fiber, value: formatNutritionValue(info.nutriments.fiber, 'g', locale), icon: 'leaf-outline' },
    { key: 'proteins', label: labels.proteins, value: formatNutritionValue(info.nutriments.proteins, 'g', locale), icon: 'barbell-outline' },
    { key: 'salt', label: labels.salt, value: formatNutritionValue(info.nutriments.salt, 'g', locale), icon: 'sparkles-outline' },
  ];
  return optionalRows.flatMap((row) => row.value === null ? [] : [{ ...row, value: row.value }]);
}

const normalizeNutritionLabel = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase();

export function nutritionIconFor(label: string): NutritionDisplayIcon {
  const normalized = normalizeNutritionLabel(label);
  if (/valor medio|valors mitjans|por 100|per 100/.test(normalized)) return 'scale-outline';
  if (/energ/.test(normalized)) return 'flash-outline';
  if (/saturad|saturat/.test(normalized)) return 'contrast-outline';
  if (/grasa|greix|lipid/.test(normalized)) return 'water-outline';
  if (/hidrato|hidrat|carbo/.test(normalized)) return 'restaurant-outline';
  if (/azucar|sucre/.test(normalized)) return 'cube-outline';
  if (/fibra/.test(normalized)) return 'leaf-outline';
  if (/protein/.test(normalized)) return 'barbell-outline';
  if (/\bsal\b|sodi|sodium/.test(normalized)) return 'sparkles-outline';
  return 'analytics-outline';
}

export function structureNutritionText(value: string): StructuredNutritionLine[] {
  return value
    .split(/\n+/)
    .map((line) => line.replace(/^[•·\-–—]\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(':');
      if (colon > 0 && line.slice(colon + 1).trim()) {
        const label = line.slice(0, colon).trim();
        return {
          label,
          value: line.slice(colon + 1).trim(),
          icon: nutritionIconFor(label),
        };
      }

      const numberStart = line.search(/\s(?=[<>]?\d)/);
      if (numberStart > 0 && !/^(valores|valors).*\b(por|per)\b/i.test(line)) {
        const label = line.slice(0, numberStart).trim();
        return {
          label,
          value: line.slice(numberStart).trim(),
          icon: nutritionIconFor(label),
        };
      }

      const label = line.replace(/:$/, '');
      return { label, value: null, icon: nutritionIconFor(label) };
    });
}
