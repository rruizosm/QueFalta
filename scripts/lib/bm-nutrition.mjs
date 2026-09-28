// BM carga la ficha alimentaria desde un JSON publico separado del catalogo,
// identificado por el EAN que ya contiene /catalog/product.
export const BM_NUTRITION_BASE_URL =
  'https://cdn-bm.aktiosdigitalservices.com/tol/bm/media/product/nutritional-info/';

const entities = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
};

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim() || null;
export const BM_DETAIL_FIELDS = ['nutrition', 'ingredients', 'allergens', 'conservation'];

const plainText = (value) => {
  if (value == null) return null;
  return clean(String(value)
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] === '#') {
        const code = entity[1]?.toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      return entities[entity] ?? entities[entity.toLowerCase()] ?? match;
    }));
};

export function bmNutritionUrl(ean) {
  const digits = String(ean ?? '').replace(/\D/g, '');
  return digits ? `${BM_NUTRITION_BASE_URL}${digits}.json` : null;
}

const nutritionLines = (values) => {
  const lines = [];
  const append = (value) => {
    const name = plainText(value?.name);
    const amount = clean(value?.valueStr ?? value?.value);
    const unit = clean(value?.measurementUnit);
    if (name && amount) lines.push(`${name}: ${amount}${unit ? ` ${unit}` : ''}`);
    for (const child of value?.children ?? []) append(child);
  };
  for (const value of values ?? []) append(value);
  return lines;
};

/** Devuelve texto legible para la ficha.
 * Solo hay referencia declarada de 100 g en las muestras reales de BM. */
export function parseBmNutrition(payload) {
  const info = payload?.nutrilabel?.productInformation;
  const groups = Array.isArray(info?.nutritionalValues) ? info.nutritionalValues : [];
  const nutrition = groups.flatMap((group) => {
    const values = Array.isArray(group?.values) ? group.values : [];
    const lines = nutritionLines(values);
    if (!lines.length) return [];
    const servingSizes = [...new Set(values.map((value) => clean(value?.servingSize)).filter(Boolean))];
    const reference = servingSizes.length === 1 ? `Por ${servingSizes[0]} g` : null;
    const groupName = groups.length > 1 ? plainText(group?.productName) : null;
    return [
      ...(groupName ? [groupName] : []),
      ...(reference ? [reference] : []),
      ...lines,
    ];
  }).join('\n') || null;

  const ingredients = (Array.isArray(info?.ingredientsInformation) ? info.ingredientsInformation : [])
    .map((group) => plainText(group?.ingredientsList))
    .filter(Boolean).join('\n') || null;
  const allergens = [...new Set((Array.isArray(info?.allergensInformation) ? info.allergensInformation : [])
    .flatMap((group) => group?.allergens ?? [])
    .map((allergen) => plainText(allergen?.allergenName))
    .filter(Boolean))].join(', ') || null;
  const conservation = (Array.isArray(payload?.messages) ? payload.messages : [])
    .filter((message) => /conservaci[oó]n/i.test(message?.type ?? ''))
    .map((message) => plainText(message?.name))
    .filter(Boolean).join('\n') || null;

  return { nutrition, ingredients, allergens, conservation };
}

export function previousBmNutrition(row, previous) {
  const sameEan = row.ean && previous?.detail_ean === row.ean;
  for (const field of BM_DETAIL_FIELDS) row[field] = sameEan ? previous[field] ?? null : null;
  row.detail_ean = row.ean ?? null;
  row.detail_synced_at = sameEan ? previous.detail_synced_at ?? null : null;
  return row;
}

export function needsBmNutritionRefresh(row, now, ttlDays) {
  if (!bmNutritionUrl(row.ean)) return false;
  const checkedAt = Date.parse(row.detail_synced_at ?? '');
  return !Number.isFinite(checkedAt) || now - checkedAt >= ttlDays * 86400000;
}

export function applyBmNutritionPayload(rows, payload, syncedAt) {
  const parsed = parseBmNutrition(payload);
  const hasContent = BM_DETAIL_FIELDS.some((field) => parsed[field]);
  for (const row of rows) {
    const hadContent = BM_DETAIL_FIELDS.some((field) => row[field]);
    if (!hasContent && hadContent) continue; // JSON vacio transitorio: reintentar en el proximo sync.
    for (const field of BM_DETAIL_FIELDS) row[field] = parsed[field];
    row.detail_synced_at = syncedAt;
  }
  return hasContent;
}
