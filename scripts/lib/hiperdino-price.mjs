import { canonicalPricePerUnit } from './price.mjs';

// HiperDino publica el precio de referencia como texto en GraphQL, por ejemplo:
//   "El Kilo sale a 15.96 euros"
//   "Los 100 mililitros salen a 1.90 euros"
// Solo convertimos las bases que el catálogo de QuéFalta puede comparar hoy
// (l/kg/ud). Lavado, dosis y metro se conservan en raw, pero quedan sin PPU
// canónico para no presentarlos de forma engañosa como €/ud.
const BASIS_TO_CANONICAL_UNIT = new Map([
  ['kilo', 'kg'],
  ['kilo escurrido', 'kg'],
  ['litro', 'l'],
  ['100 gramos', '100 g'],
  ['100 gramos escurridos', '100 g'],
  ['100 mililitros', '100 ml'],
  ['unidad', 'ud'],
  ['docena', 'docena'],
]);

export function parseHiperdinoPriceText(rawText) {
  if (typeof rawText !== 'string') return null;

  const text = rawText.trim().replace(/\s+/g, ' ');
  if (!text) return null;

  const match = text.match(/^(?:el|la|los)\s+(.+?)\s+sale(?:n)?\s+a\s+([\d.,]+)\s+euros?$/i);
  if (!match) return null;

  const basis = match[1].toLowerCase();
  const canonicalUnit = BASIS_TO_CANONICAL_UNIT.get(basis);
  return canonicalUnit ? canonicalPricePerUnit(match[2], canonicalUnit) : null;
}

const finiteNumber = (value) => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

export function normalizeHiperdinoPriceData(product) {
  const unitPrice = finiteNumber(product?.sap_final_price);
  const regularPrice = finiteNumber(product?.sap_price);
  const promoBasePrice = regularPrice != null && unitPrice != null && regularPrice > unitPrice
    ? regularPrice
    : null;
  const pricePerUnit = parseHiperdinoPriceText(product?.price_text);

  return {
    unitPrice,
    promoBasePrice,
    pricePerUnit: pricePerUnit?.value ?? null,
    pricePerUnitUnit: pricePerUnit?.unit ?? null,
  };
}
