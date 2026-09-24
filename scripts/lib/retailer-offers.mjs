const num = (value) => {
  const parsed = typeof value === 'string'
    ? Number(value.replace(',', '.').replace(/[^\d.-]/g, ''))
    : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const htmlUnescape = (value) => String(value ?? '')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&nbsp;|&#160;/g, ' ');

export const cleanOfferText = (value) => {
  const text = htmlUnescape(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
};

const unique = (values) => [...new Set(values.filter(Boolean))];

const compactPercentSpacing = (value) => value
  ?.replace(/\s+%/g, '%')
  .replace(/-\s+(\d)/g, '-$1')
  .trim() ?? null;

const isoDateFromSpanish = (value) => {
  const match = String(value ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4}|\d{2})$/);
  if (!match) return null;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2]}-${match[1]}`;
};

const validityFromText = (value) => {
  const dateRangePattern = /(\d{2}\/\d{2}\/(?:\d{4}|\d{2}))\s*[-_]\s*(\d{2}\/\d{2}\/(?:\d{4}|\d{2}))/;
  const match = String(value ?? '').match(dateRangePattern);
  return {
    promo_start: isoDateFromSpanish(match?.[1]),
    promo_end: isoDateFromSpanish(match?.[2]),
  };
};

const isOnlineOnlyText = (value) => {
  const text = cleanOfferText(value)?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ?? '';
  return /\b(?:solo|exclusiv[ao]s?)\s+online\b|\bonline\s+exclusiv[ao]s?\b/.test(text);
};

const promotionKey = (promotion) => [
  promotion.retailer_promotion_id,
  promotion.id,
  promotion.description,
].find(Boolean) ?? JSON.stringify(promotion);

export function mergeAlcampoPromotionDetails(...groups) {
  const merged = new Map();
  for (const promotion of groups.flat().filter(Boolean)) {
    const key = promotionKey(promotion);
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, {
        ...promotion,
        source_paths: unique(promotion.source_paths ?? []),
      });
      continue;
    }
    merged.set(key, {
      ...previous,
      ...promotion,
      online_only: Boolean(previous.online_only || promotion.online_only),
      source_paths: unique([...(previous.source_paths ?? []), ...(promotion.source_paths ?? [])]).slice(0, 8),
    });
  }
  return [...merged.values()];
}

export function extractAlcampoPromotionDetails(product, {
  sourceOnlineOnly = false,
  sourcePath = null,
} = {}) {
  // El endpoint JSON usa `promotions`; el SSR de Playwright usa `offers` y, en
  // algunos productos, además deja una oferta singular en `offer`.
  const rawPromotions = [
    ...(Array.isArray(product?.promotions) ? product.promotions : []),
    ...(Array.isArray(product?.offers) ? product.offers : []),
    ...(product?.offer ? [product.offer] : []),
  ];

  return mergeAlcampoPromotionDetails(rawPromotions
    .filter((promotion) => promotion?.limitReached !== true)
    .map((promotion) => {
      const description = cleanOfferText(promotion?.description);
      const validity = validityFromText(description);
      return {
        id: promotion?.id != null ? String(promotion.id) : null,
        retailer_promotion_id: promotion?.retailerPromotionId != null
          ? String(promotion.retailerPromotionId)
          : null,
        description,
        type: cleanOfferText(promotion?.type),
        presentation_mode: cleanOfferText(promotion?.presentationMode),
        required_product_quantity: promotion?.requiredProductQuantity == null
          ? null
          : num(promotion.requiredProductQuantity),
        promo_start: validity.promo_start,
        promo_end: validity.promo_end,
        online_only: Boolean(sourceOnlineOnly || isOnlineOnlyText(description)),
        source_paths: sourcePath ? [sourcePath] : [],
      };
    }));
}

export function normalizeCondisOffer(product) {
  const current = num(product?.price?.current);
  const regular = num(product?.price?.regular);
  const direct = current != null && regular != null && regular > current;
  const text = cleanOfferText(product?.promotion_text);
  const explicit = Boolean(product?.on_sale || product?.on_promotion || text || direct);
  if (!explicit) return null;

  return {
    promo_name: text || (direct ? 'Precio rebajado' : 'Promoción'),
    promo_text: text,
    promo_price: direct ? current : null,
    promo_base_price: direct ? regular : null,
    promo_start: null,
    promo_end: null,
  };
}

export function normalizeAmetllerOffer(product) {
  const promotions = Array.isArray(product?.productPromotions) ? product.productPromotions : [];
  const labels = unique(promotions.map((promotion) => cleanOfferText(promotion?.calloutMsg)));
  const regular = num(product?.price);
  const directPrices = promotions
    .map((promotion) => num(promotion?.promotionalPrice))
    .filter((price) => price != null && regular != null && price > 0 && price < regular);
  const promoPrice = directPrices.length > 0 ? Math.min(...directPrices) : null;
  const explicit = promotions.length > 0 || product?.c_isSale === true;
  if (!explicit) return null;

  return {
    promo_name: labels.join(' · ') || (promoPrice != null ? 'Precio rebajado' : 'Oferta'),
    promo_text: labels.length > 1 ? labels.join(' · ') : null,
    promo_price: promoPrice,
    promo_base_price: promoPrice != null ? regular : null,
    promo_start: null,
    promo_end: null,
  };
}

export function normalizeAlcampoOffer(product, {
  additionalPromotions = [],
  sourceOnlineOnly = false,
  sourcePath = null,
} = {}) {
  const promotions = mergeAlcampoPromotionDetails(
    extractAlcampoPromotionDetails(product, { sourceOnlineOnly, sourcePath }),
    additionalPromotions,
  );
  const descriptions = unique(promotions.map((promotion) => promotion.description));

  // El JSON antiguo usa price.amount + promoPrice.amount. El SSR actual ya deja
  // el precio final en price.current y el tachado en price.original.
  const listedCurrent = num(product?.price?.current?.amount);
  const explicitPromo = num(product?.promoPrice?.current?.amount ?? product?.promoPrice?.amount);
  const current = explicitPromo != null && (listedCurrent == null || explicitPromo < listedCurrent)
    ? explicitPromo
    : listedCurrent;
  const regular = num(product?.price?.original?.amount ?? product?.price?.amount ?? listedCurrent);
  const direct = current != null && regular != null && current > 0 && regular > current;
  const promoPrice = direct ? current : null;
  const promoBasePrice = direct ? regular : null;
  if (promotions.length === 0 && promoPrice == null) return null;

  const fullText = descriptions.join(' · ') || null;
  const firstLabel = descriptions[0]
    ?.replace(/\s*\(\d{2}\/\d{2}\/(?:\d{4}|\d{2})\s*[-_]\s*\d{2}\/\d{2}\/(?:\d{4}|\d{2})\)\s*$/i, '')
    .trim();
  const firstDatedPromotion = promotions.find((promotion) => promotion.promo_start || promotion.promo_end);

  return {
    promo_name: firstLabel || (promoPrice != null ? 'Precio rebajado' : 'Promoción'),
    promo_text: fullText,
    promo_price: promoPrice,
    promo_base_price: promoBasePrice,
    promo_start: firstDatedPromotion?.promo_start ?? null,
    promo_end: firstDatedPromotion?.promo_end ?? null,
    promo_online_only: promotions.some((promotion) => promotion.online_only),
    promo_details: promotions,
  };
}

const euroFromText = (value) => {
  const match = cleanOfferText(value)?.match(/(\d+(?:[.,]\d{1,2})?)/);
  return num(match?.[1]);
};

export function parseTapestryOfferBlock(block, currentPrice = null) {
  const offerMatch = String(block ?? '').match(
    /<div[^>]*class=(['"])[^'"]*\bproduct-offer\b[^'"]*\1[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*\bprice-offer\b/i,
  );
  const rawLabel = compactPercentSpacing(cleanOfferText(offerMatch?.[2]));
  const current = num(currentPrice);
  const beforePrices = [...String(block ?? '').matchAll(
    /<span[^>]*class=(['"])[^'"]*\bprice-before\b[^'"]*\1[^>]*>([\s\S]*?)<\/span>/gi,
  )]
    .map((match) => euroFromText(match[2]))
    .filter((price) => price != null && (current == null || price > current));
  const basePrice = beforePrices.length > 0 ? Math.max(...beforePrices) : null;
  const direct = basePrice != null && current != null && basePrice > current;
  if (!rawLabel && !direct) return null;

  return {
    promo_name: rawLabel || 'Precio rebajado',
    promo_text: null,
    promo_price: direct ? current : null,
    promo_base_price: direct ? basePrice : null,
    promo_start: null,
    promo_end: null,
  };
}
