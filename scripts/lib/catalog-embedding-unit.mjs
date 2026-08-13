const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

export function canonicalUnit(value) {
  const unit = normalize(value).replace(/[€/$]/g, '');
  if (['l', 'litro', 'litros', 'litre', 'litres'].includes(unit)) return 'l';
  if (['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(unit)) return 'kg';
  if (['ud', 'uds', 'u', 'unidad', 'unidades'].includes(unit)) return 'ud';
  return null;
}

export function inferCountableUnit(text) {
  const normalized = normalize(text);
  return /\b(?:ud|uds|u|unidad|unidades)\b/.test(normalized)
    || /\b(?:media\s+docena|medio\s+docena|1\s*\/\s*2\s+docena|docena|docenas)\b/.test(normalized)
    ? 'ud'
    : null;
}

export function quantityBase(text, unit) {
  if (!unit) return null;
  const normalized = normalize(text).replace(',', '.');

  if (unit === 'ud') {
    if (/\b(?:media|medio)\s+docena\b/.test(normalized) || /\b1\s*\/\s*2\s+docena\b/.test(normalized)) return 6;
    const dozens = normalized.match(/\b(\d+(?:\.\d+)?)\s+docenas?\b/);
    if (dozens) {
      const total = Number(dozens[1]) * 12;
      return Number.isFinite(total) && total > 0 ? total : null;
    }
    if (/\bdocena\b/.test(normalized)) return 12;
  }

  const multi = normalized.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|gr|ml|cl|l|ud|uds|u|unidad|unidades)\b/);
  const simple = normalized.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|ml|cl|l|ud|uds|u|unidad|unidades)\b/);
  const match = multi || simple;
  if (!match) return null;
  const count = multi ? Number(match[1]) : 1;
  const amount = Number(match[multi ? 2 : 1]);
  const sourceUnit = match[multi ? 3 : 2];
  const total = count * amount;
  if (!Number.isFinite(total) || total <= 0) return null;
  if (unit === 'kg') return ['g', 'gr'].includes(sourceUnit) ? total / 1000 : sourceUnit === 'kg' ? total : null;
  if (unit === 'l') return sourceUnit === 'ml' ? total / 1000 : sourceUnit === 'cl' ? total / 100 : sourceUnit === 'l' ? total : null;
  if (unit === 'ud') return ['ud', 'uds', 'u', 'unidad', 'unidades'].includes(sourceUnit) ? total : null;
  return null;
}

export function deriveCatalogUnitQuantity({ pricePerUnitUnit, name, packaging, rawPriceInstructions }) {
  const text = `${name ?? ''} ${packaging ?? ''}`;
  const rawUnit = canonicalUnit(rawPriceInstructions?.size_format);
  const unit = canonicalUnit(pricePerUnitUnit) || rawUnit || inferCountableUnit(text);
  let quantity = quantityBase(text, unit);

  if (quantity == null && unit === 'ud' && rawUnit === 'ud') {
    const rawQuantity = Number(rawPriceInstructions?.unit_size);
    if (Number.isFinite(rawQuantity) && rawQuantity > 0) quantity = rawQuantity;
  }

  return { unit, quantity };
}
