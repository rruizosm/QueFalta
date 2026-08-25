import { canonicalPricePerUnit } from './price.mjs';

function languageValue(values) {
  if (!Array.isArray(values)) return null;
  return values.find((item) => item?.language === 'ES')?.value ?? values[0]?.value ?? null;
}

/**
 * Convierte el precio de referencia de Gadisline a las unidades canónicas de
 * QuéFalta. Gadis publica textos como "el kilo", "el litro", "los 100 ml"
 * y "la docena"; los productos al peso omiten el sufijo y se reconocen por
 * weight=P. Cuando tampoco hay sufijo en un artículo no pesado, la cifra
 * coincide con el precio de una unidad.
 */
export function normalizeGadisPricePerUnit(product) {
  const amount = Number(product?.price_kilo_litre);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const suffix = languageValue(product?.price_kilo_litre_suffix)?.trim() ?? '';
  if (suffix) return canonicalPricePerUnit(amount, suffix);

  return {
    value: Math.round(amount * 10000) / 10000,
    unit: product?.weight === 'P' ? 'kg' : 'ud',
  };
}
