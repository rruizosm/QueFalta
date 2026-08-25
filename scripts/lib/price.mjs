// Helper compartido por los syncs (Fase 1a de COMPARATIVA.md).
// Normaliza un "€/unidad" a BASE CANÓNICA para poder comparar precios entre
// supermercados: líquidos → €/L, peso → €/kg, conteo → €/ud.
//
// Por qué: cada retailer da la unidad como le da la gana ("litre", "€/kg",
// "€/100 g", "ml", "u.")… y mezclar €/ml con €/L al ordenar miente (un gel a
// 0,01 €/ml NO es más barato que leche a 0,96 €/L; son 10 €/L). Aquí se unifica.
//
// canonicalPricePerUnit(amount, rawUnit) → { value, unit } | null
//   value: número en € por la unidad canónica
//   unit : 'l' | 'kg' | 'ud'   (null si la unidad no se reconoce → no comparable)

export function toNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  // admite "1.234,56" y "1,17" y "0.96"
  let s = String(v).trim().replace(/[\s€]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// (regex de unidad, factor para pasar a la base, base canónica)
// El factor multiplica el €/unidad: €/ml ×1000 = €/L, €/g ×1000 = €/kg.
const UNIT_RULES = [
  [/^(ml|mililitros?|millilitres?)$/,            1000, 'l'],
  [/^(cl|centilitros?)$/,                         100, 'l'],
  [/^(dl|decilitros?)$/,                           10, 'l'],
  [/^(l|lt|litros?|litres?|liter|liters)$/,         1, 'l'],
  [/^(mg|miligramos?|milligrams?)$/,              1e6, 'kg'],
  [/^(g|gr|gramos?|grams?)$/,                     1000, 'kg'],
  [/^(kg|kilos?|kilogramos?|kilograms?|kilogramme)$/, 1, 'kg'],
  [/^(ud|uds|u|unidad(es)?|unit(s)?|each|pieza|pza|pe[çc]a|cada)$/, 1, 'ud'],
  [/^(docena|dozen)$/, 1 / 12, 'ud'],   // huevos de Dia: €/docena → €/ud
];

export function canonicalPricePerUnit(amount, rawUnit) {
  const value = toNumber(amount);
  if (value == null || value <= 0) return null;

  // Limpia el texto de unidad: quita "fop.price.per.", "€", "eur", "/", puntos
  // finales y espacios. Deja p.ej. "litre", "kg", "100 g", "u".
  let u = String(rawUnit ?? '').toLowerCase().trim()
    .replace(/^fop\.price\.per\./, '')
    .replace(/€|eur/g, '')
    .replace(/^\s*\/\s*/, '')
    // Algunos catálogos expresan la referencia como "el kilo", "la unidad"
    // o "los 100 ml". El artículo no forma parte de la unidad.
    .replace(/^(?:el|la|los|las)\s+/, '')
    .replace(/\.+$/, '')
    .trim();
  if (!u) return null;

  // Cantidad opcional delante de la unidad: "100 g", "100g", "1 l" → qty + unidad.
  const m = u.match(/^([\d.,]+)?\s*([a-zàáéíóúç]+)$/);
  if (!m) return null;
  const qty = m[1] ? toNumber(m[1]) : 1;
  const word = m[2];
  if (!qty || qty <= 0) return null;

  for (const [re, factor, unit] of UNIT_RULES) {
    if (re.test(word)) {
      const v = (value / qty) * factor;
      return { value: Math.round(v * 10000) / 10000, unit };
    }
  }
  return null; // unidad desconocida
}

// Etiqueta legible para la UI a partir del resultado canónico: "0,96 €/L".
export function formatPricePerUnit(canon) {
  if (!canon) return null;
  const label = canon.unit === 'l' ? 'L' : canon.unit === 'kg' ? 'kg' : 'ud';
  return `${canon.value.toFixed(2).replace('.', ',')} €/${label}`;
}
