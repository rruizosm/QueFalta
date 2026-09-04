import { canonicalPricePerUnit, toNumber } from './price.mjs';

const round4 = (value) => Math.round(value * 10000) / 10000;

function annotationText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function unitToken(raw) {
  const value = String(raw ?? '').toLowerCase();
  if (/^pieces?$/.test(value)) return 'ud';
  return value;
}

function quantityUnit(raw) {
  const text = annotationText(raw).toLowerCase().replace(/\s/g, '');
  const multi = text.match(/^(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)(ml|cl|l|g|kg|ud|pieces?)$/);
  if (multi) {
    const packs = toNumber(multi[1]);
    const quantity = toNumber(multi[2]);
    if (!packs || !quantity) return null;
    return { quantity: packs * quantity, unit: unitToken(multi[3]) };
  }
  const single = text.match(/^(\d+(?:[.,]\d+)?)(ml|cl|l|g|kg|ud|pieces?)$/);
  if (!single) return null;
  return { quantity: toNumber(single[1]), unit: unitToken(single[2]) };
}

function packagingLabel(raw) {
  const parsed = quantityUnit(raw);
  if (!parsed?.quantity || !parsed.unit) return annotationText(raw) || null;
  const quantity = Number.isInteger(parsed.quantity)
    ? String(parsed.quantity)
    : String(parsed.quantity).replace('.', ',');
  return `${quantity} ${parsed.unit}`;
}

function pricePerUnitFromQuantity(price, quantity, unit) {
  if (!price || !quantity || quantity <= 0) return null;
  if (unit === 'ud') return { value: round4(price / quantity), unit: 'ud' };
  return canonicalPricePerUnit(price, `${quantity}${unit}`);
}

/** Normaliza las anotaciones de precio que devuelve Product Catalog de Lidl. */
export function parseLidlPrice(priceData) {
  const unitPrice = toNumber(priceData?.priceWithoutDeposit ?? priceData?.price);
  const annotations = (priceData?.annotationsWithoutDeposit ?? priceData?.annotations ?? [])
    .map(annotationText)
    .filter(Boolean);

  let pricePerUnit = null;
  let packaging = null;
  for (const annotation of annotations) {
    const reference = annotation.match(/^(\d+(?:[.,]\d+)?)\s*(ml|cl|l|g|kg|pieces?)\s*=\s*(\d+(?:[.,]\d+)?)/i);
    if (reference && !pricePerUnit) {
      const quantity = toNumber(reference[1]);
      const amount = toNumber(reference[3]);
      const unit = unitToken(reference[2]);
      pricePerUnit = unit === 'ud'
        ? { value: round4(amount / quantity), unit: 'ud' }
        : canonicalPricePerUnit(amount, `${quantity}${unit}`);
      continue;
    }
    if (!annotation.includes('=')) packaging = packagingLabel(annotation);
  }

  if (!pricePerUnit && packaging) {
    const parsed = quantityUnit(packaging);
    if (parsed) pricePerUnit = pricePerUnitFromQuantity(unitPrice, parsed.quantity, parsed.unit);
  }

  return {
    unitPrice,
    packaging,
    pricePerUnit: pricePerUnit?.value ?? null,
    pricePerUnitUnit: pricePerUnit?.unit ?? null,
  };
}

function offerText(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  for (const key of ['title', 'description', 'text', 'label']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
  }
  return null;
}

export function lidlCategoryId(parentId, categoryId) {
  return parentId ? `${parentId}:${categoryId}` : String(categoryId);
}

/**
 * Convierte un producto del listado público de Lidl al contrato común.
 * `id` y `retailer_product_id` son identificadores internos: nunca se infiere EAN.
 */
export function normalizeLidlProduct(product, category) {
  const parsed = parseLidlPrice(product?.price);
  const rawPrice = product?.price ?? {};
  const oldPrice = toNumber(rawPrice.oldPrice);
  const hasPublicDiscount = oldPrice != null && parsed.unitPrice != null && oldPrice > parsed.unitPrice;
  const hasLidlPlusOffer = Boolean(rawPrice.lidlPlusOffer);
  const id = String(product?.id ?? '').trim();
  const stockIndicator = String(product?.stockAvailability?.stockIndicator ?? '').trim() || null;
  const displayName = String(product?.title ?? '').trim();
  const symbol = String(rawPrice.symbol ?? '€').trim() || '€';

  return {
    id,
    retailer_product_id: id || null,
    ean: null,
    display_name: displayName,
    brand: String(product?.brand ?? '').trim() || null,
    packaging: String(product?.subtitle ?? '').trim() || parsed.packaging,
    thumbnail: String(product?.imageUrl ?? '').trim() || null,
    category_id: category.id,
    category_name: category.name,
    category_ids: [...new Set([category.rootId, category.id].filter(Boolean))],
    unit_price: parsed.unitPrice,
    price_format: parsed.unitPrice != null
      ? `${parsed.unitPrice.toFixed(2).replace('.', ',')} ${symbol}`
      : null,
    price_per_unit: parsed.pricePerUnit,
    price_per_unit_unit: parsed.pricePerUnitUnit,
    promo_name: hasLidlPlusOffer ? 'Lidl Plus' : (hasPublicDiscount ? 'Oferta' : null),
    promo_text: offerText(rawPrice.lidlPlusOffer ?? rawPrice.discount),
    promo_base_price: hasPublicDiscount ? oldPrice : null,
    is_lidl_plus_offer: hasLidlPlusOffer,
    available: stockIndicator === 'Available',
    stock_indicator: stockIndicator,
    product_line: String(product?.productLine ?? '').trim() || null,
    listing_type: String(product?.listingType ?? '').trim() || null,
    click_collect: product?.productValidForClickAndCollect === true,
    published: true,
    raw: product,
  };
}
