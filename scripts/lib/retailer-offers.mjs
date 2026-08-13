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
  const match = String(value ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};

const validityFromText = (value) => {
  const match = String(value ?? '').match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
  return {
    promo_start: isoDateFromSpanish(match?.[1]),
    promo_end: isoDateFromSpanish(match?.[2]),
  };
};

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

export function normalizeAlcampoOffer(product) {
  // El endpoint JSON usa `promotions`; el SSR de Playwright usa `offers` y, en
  // algunos productos, además deja una oferta singular en `offer`.
  const rawPromotions = Array.isArray(product?.promotions)
    ? product.promotions
    : [
      ...(Array.isArray(product?.offers) ? product.offers : []),
      ...(product?.offer ? [product.offer] : []),
    ];
  const promotions = rawPromotions.filter((promotion) => promotion?.limitReached !== true);
  const descriptions = unique(promotions.map((promotion) => cleanOfferText(promotion?.description)));
  const regular = num(product?.price?.amount ?? product?.price?.current?.amount);
  const candidate = num(product?.promoPrice?.amount ?? product?.promoPrice?.current?.amount);
  const promoPrice = candidate != null && regular != null && candidate > 0 && candidate < regular
    ? candidate
    : null;
  if (promotions.length === 0 && promoPrice == null) return null;

  const fullText = descriptions.join(' · ') || null;
  const firstLabel = descriptions[0]
    ?.replace(/\s*\(\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}\)\s*$/i, '')
    .trim();
  const validity = validityFromText(fullText);

  return {
    promo_name: firstLabel || (promoPrice != null ? 'Precio rebajado' : 'Promoción'),
    promo_text: fullText,
    promo_price: promoPrice,
    promo_base_price: promoPrice != null ? regular : null,
    ...validity,
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
