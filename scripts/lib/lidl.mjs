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

const normalizeOfferCode = (value) => {
  const digits = String(value ?? '').trim().replace(/\D/g, '');
  return digits ? digits.replace(/^0+(?=\d)/, '') : null;
};

const normalizeOfferTitle = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const offerCodes = (offer) => new Set(
  (Array.isArray(offer?.productIds) ? offer.productIds : [])
    .map(normalizeOfferCode)
    .filter(Boolean),
);

const catalogImageCodes = (product) => {
  const filename = String(product?.imageUrl ?? '').split('/').at(-1)?.split('?')[0] ?? '';
  return filename
    .split('_')
    .filter((part) => /^\d+$/.test(part))
    .map(normalizeOfferCode)
    .filter(Boolean);
};

const isoDate = (value) => {
  if (!value) return null;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
};

const positiveNumber = (value) => {
  const parsed = toNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
};

/** Solo considera las promociones de tienda activas en el instante indicado. */
export function isLiveLidlStoreOffer(offer, now = new Date()) {
  if (offer?.redemptionChannel !== 'Store') return false;
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));
  if (!Number.isFinite(nowMs)) return false;
  const startMs = offer.startValidityDate ? Date.parse(String(offer.startValidityDate)) : null;
  const endMs = offer.endValidityDate ? Date.parse(String(offer.endValidityDate)) : null;
  if (startMs != null && !Number.isFinite(startMs)) return false;
  if (endMs != null && !Number.isFinite(endMs)) return false;
  return (startMs == null || startMs <= nowMs) && (endMs == null || endMs >= nowMs);
}

/**
 * Preselección barata antes de consultar el detalle. El código incrustado en
 * la imagen o, como respaldo, nombre+precio ordinario reducen las peticiones;
 * nunca bastan por sí solos para guardar una oferta.
 */
export function isLidlOfferCandidate(product, offer) {
  const codes = offerCodes(offer);
  if (!codes.size) return false;
  if (catalogImageCodes(product).some((code) => codes.has(code))) return true;

  const offerTitle = normalizeOfferTitle(offer?.title);
  const productTitle = normalizeOfferTitle(product?.title);
  const regularPrice = positiveNumber(offer?.priceBox?.smallPartNumeric);
  const catalogPrice = positiveNumber(product?.price?.priceWithoutDeposit ?? product?.price?.price);
  return Boolean(offerTitle && productTitle === offerTitle && regularPrice != null && catalogPrice === regularPrice);
}

/** Confirmación canónica: productCodes del detalle debe contener un productId de la oferta. */
export function lidlOfferMatchesDetail(detail, offer) {
  const codes = offerCodes(offer);
  if (!codes.size) return false;
  return (Array.isArray(detail?.productCodes) ? detail.productCodes : [])
    .some((entry) => codes.has(normalizeOfferCode(entry?.code)));
}

function lidlOfferLabel(offer) {
  const percentage = annotationText(offer?.priceBox?.largePartString);
  const message = annotationText(offer?.priceBox?.discountMessage);
  const parts = [];
  const compactPercentage = percentage.replace(/\s+/g, '');
  const compactMessage = message.replace(/\s+/g, '');
  if (percentage && /^-\s*\d+\s*%$/.test(percentage) && !compactMessage.includes(compactPercentage)) {
    parts.push(compactPercentage);
  }
  if (message) parts.push(message);
  return parts.join(' · ') || percentage || message || 'Oferta';
}

/** Aplica al contrato de BD una oferta ya verificada contra productCodes. */
export function applyLidlOffer(row, offer) {
  const promoPrice = positiveNumber(offer?.priceBox?.largePartNumeric);
  const sourceBasePrice = positiveNumber(offer?.priceBox?.smallPartNumeric);
  const basePrice = promoPrice != null && sourceBasePrice != null && sourceBasePrice > promoPrice
    ? sourceBasePrice
    : null;
  return {
    ...row,
    promo_name: lidlOfferLabel(offer),
    promo_text: annotationText(offer?.priceBox?.discountMessage) || annotationText(offer?.offerType) || null,
    promo_price: promoPrice,
    promo_base_price: basePrice,
    promo_start: isoDate(offer?.startValidityDate),
    promo_end: isoDate(offer?.endValidityDate),
    raw: { ...(row?.raw ?? {}), offer },
  };
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
    promo_price: null,
    promo_base_price: hasPublicDiscount ? oldPrice : null,
    promo_start: null,
    promo_end: null,
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

/** Ficha compartida entre tiendas. Nunca conserva campos locales en `raw`. */
export function lidlProductMasterRow(row) {
  const raw = { ...(row.raw ?? {}) };
  delete raw.price;
  delete raw.stockAvailability;
  delete raw.productValidForClickAndCollect;
  delete raw.offer;
  return {
    id: row.id,
    retailer_product_id: row.retailer_product_id,
    ean: row.ean,
    display_name: row.display_name,
    brand: row.brand,
    packaging: row.packaging,
    thumbnail: row.thumbnail,
    product_line: row.product_line,
    listing_type: row.listing_type,
    published: row.published,
    raw,
    synced_at: row.synced_at,
  };
}

/** Datos que solo son autoritativos para una tienda Lidl concreta. */
export function lidlStoreProductRow(row, storeId) {
  return {
    store_id: storeId,
    product_id: row.id,
    category_id: row.category_id,
    category_name: row.category_name,
    category_ids: row.category_ids,
    unit_price: row.unit_price,
    price_format: row.price_format,
    price_per_unit: row.price_per_unit,
    price_per_unit_unit: row.price_per_unit_unit,
    promo_name: row.promo_name,
    promo_text: row.promo_text,
    promo_price: row.promo_price,
    promo_base_price: row.promo_base_price,
    promo_start: row.promo_start,
    promo_end: row.promo_end,
    is_lidl_plus_offer: row.is_lidl_plus_offer,
    available: row.available,
    stock_indicator: row.stock_indicator,
    click_collect: row.click_collect,
    published: row.published,
    raw: {
      price: row.raw?.price ?? null,
      stockAvailability: row.raw?.stockAvailability ?? null,
      productValidForClickAndCollect: row.raw?.productValidForClickAndCollect ?? null,
      offer: row.raw?.offer ?? null,
    },
    observed_at: row.synced_at,
    synced_at: row.synced_at,
  };
}

export function lidlStoreCategoryRow(category, storeId) {
  return {
    store_id: storeId,
    category_id: category.id,
    product_count: category.product_count,
    published: category.published,
    synced_at: category.synced_at,
  };
}
