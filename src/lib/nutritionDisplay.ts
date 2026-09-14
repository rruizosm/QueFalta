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
