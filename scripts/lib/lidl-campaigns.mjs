const LIDL_HOME_URL = 'https://www.lidl.es/';

export const LIDL_CAMPAIGN_DEFINITIONS = [
  { key: 'xxl', label: 'Formato ahorro XXL', slug: 'xxl' },
  { key: 'weekly', label: 'Ofertas semanales', slug: 'ofertas-semanales' },
  { key: 'weekend', label: 'Fin de semana a lo grande', slug: 'super-finde' },
  { key: 'unbeatable', label: 'Precios imbatibles', slug: 'precios-imbatibles' },
  { key: 'price_drops', label: 'Bajamos los precios', slug: 'bajadas-permanentes' },
];

const normalizeCode = (value) => {
  const digits = String(value ?? '').trim().replace(/\D/g, '');
  return digits ? digits.replace(/^0+(?=\d)/, '') : null;
};

const normalizeTitle = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const imageCodes = (product) => {
  const filename = String(product?.imageUrl ?? '').split('/').at(-1)?.split('?')[0] ?? '';
  return filename
    .split('_')
    .filter((part) => /^\d+$/.test(part))
    .map(normalizeCode)
    .filter(Boolean);
};

const campaignCodes = (product) => [...new Set([
  product?.nat,
  ...(Array.isArray(product?.ians) ? product.ians : []),
].map(normalizeCode).filter(Boolean))];

function decodeHtmlAttribute(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function compactCampaignProduct(product) {
  return {
    productId: product.productId,
    nat: String(product.nat ?? '').trim() || null,
    ians: Array.isArray(product.ians) ? product.ians.map(String) : [],
    title: String(product.title ?? '').trim() || null,
    fullTitle: String(product.fullTitle ?? '').trim() || null,
    canonicalUrl: String(product.canonicalUrl ?? '').trim() || null,
    regions: Array.isArray(product.regions) ? product.regions : [],
    regionsV2: product.regionsV2 && typeof product.regionsV2 === 'object' ? product.regionsV2 : {},
    regionsPrices: product.regionsPrices && typeof product.regionsPrices === 'object' ? product.regionsPrices : {},
  };
}

export function discoverLidlCampaignUrls(html, homeUrl = LIDL_HOME_URL) {
  const hrefs = [...String(html).matchAll(/\bhref="([^"]+)"/g)]
    .map((match) => decodeHtmlAttribute(match[1]));
  return LIDL_CAMPAIGN_DEFINITIONS.map((definition) => {
    const pathPattern = new RegExp(`^/c/${definition.slug}/a\\d+(?:[?#].*)?$`, 'i');
    const href = hrefs.find((candidate) => pathPattern.test(candidate));
    if (!href) throw new Error(`no se encontró la campaña «${definition.label}» en la portada Lidl`);
    return { ...definition, url: new URL(href, homeUrl).href };
  });
}

export function parseLidlCampaignPage(html, definition) {
  const products = new Map();
  for (const match of String(html).matchAll(/\bdata-grid-data="([^"]+)"/g)) {
    let parsed;
    try {
      parsed = JSON.parse(decodeHtmlAttribute(match[1]));
    } catch (error) {
      throw new Error(`${definition.label}: data-grid-data inválido`, { cause: error });
    }
    if (parsed?.productId == null) continue;
    products.set(String(parsed.productId), compactCampaignProduct(parsed));
  }
  if (!products.size) throw new Error(`${definition.label}: la campaña no contiene productos estructurados`);
  return { ...definition, products: [...products.values()] };
}

async function fetchText(url, { fetchImpl, attempts }) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-ES,es;q=0.9',
          'User-Agent': 'QueFalta weekly campaign sync/1.0 (+https://quefalta.es)',
        },
        signal: AbortSignal.timeout(30_000),
      });
      const body = await response.text();
      if (response.ok && body) return body;
      lastError = new Error(`${url}: HTTP ${response.status} ${body.slice(0, 300)}`);
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
  throw new Error(`no se pudo descargar ${url}: ${lastError?.message ?? 'error desconocido'}`, { cause: lastError });
}

export async function fetchLidlCampaignCatalog({
  fetchImpl = fetch,
  homeUrl = LIDL_HOME_URL,
  attempts = 3,
  fetchedAt = new Date().toISOString(),
} = {}) {
  const home = await fetchText(homeUrl, { fetchImpl, attempts });
  const definitions = discoverLidlCampaignUrls(home, homeUrl);
  const campaigns = await Promise.all(definitions.map(async (definition) =>
    parseLidlCampaignPage(
      await fetchText(definition.url, { fetchImpl, attempts }),
      definition,
    )));
  return { version: 1, fetchedAt, campaigns };
}

export function assertLidlCampaignCatalog(value) {
  if (value?.version !== 1 || !Array.isArray(value.campaigns)) {
    throw new Error('caché de campañas Lidl inválida');
  }
  for (const definition of LIDL_CAMPAIGN_DEFINITIONS) {
    const campaign = value.campaigns.find((candidate) => candidate?.key === definition.key);
    if (!campaign || !Array.isArray(campaign.products) || !campaign.products.length) {
      throw new Error(`caché sin la campaña «${definition.label}»`);
    }
  }
  return value;
}

export function isLidlCampaignCandidate(product, campaignProduct) {
  const codes = new Set(campaignCodes(campaignProduct));
  if (!codes.size) return false;
  if (imageCodes(product).some((code) => codes.has(code))) return true;
  return Boolean(
    normalizeTitle(product?.title)
    && normalizeTitle(product?.title) === normalizeTitle(campaignProduct?.title),
  );
}

export function lidlCampaignMatchesDetail(detail, campaignProduct) {
  const codes = new Set(campaignCodes(campaignProduct));
  return (Array.isArray(detail?.productCodes) ? detail.productCodes : [])
    .some((entry) => codes.has(normalizeCode(entry?.code)));
}

const timestamp = (value) => {
  const parsed = value ? Date.parse(String(value)) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const madridDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
});

const isoDate = (value, exclusive = false) => {
  const parsed = timestamp(value);
  return parsed == null ? null : madridDate.format(new Date(parsed - (exclusive ? 1 : 0)));
};

function unwrapPriceSlot(slot, plus, outer = null) {
  const wrapper = slot?.price && typeof slot.price === 'object' && plus ? slot : null;
  let price = wrapper ? wrapper.price : slot;
  if (price?.price && typeof price.price === 'object') price = price.price;
  const numericPrice = Number(price?.price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) return null;
  const exclusiveEnd = outer?.endDateExclusive ?? price?.endDateExclusive ?? null;
  return {
    price: numericPrice,
    oldPrice: Number(price?.oldPrice ?? price?.discount?.deletedPrice),
    percentage: Number(price?.discount?.percentageDiscount),
    discountText: String(price?.discount?.discountText ?? '').trim() || null,
    highlightText: String(slot?.highlightText ?? wrapper?.highlightText ?? '').trim() || null,
    lidlPlusText: String(slot?.lidlPlusText ?? wrapper?.lidlPlusText ?? '').trim() || null,
    startDate: outer?.startDate ?? price?.startDate ?? null,
    endDate: exclusiveEnd ?? price?.endDate ?? null,
    endExclusive: exclusiveEnd != null,
    plus,
  };
}

function regionalPriceSlots(regionPrices) {
  const current = [
    unwrapPriceSlot(regionPrices?.currentLidlPlusPrice, true),
    unwrapPriceSlot(regionPrices?.currentPrice, false),
  ].filter(Boolean);
  const future = [
    ...(Array.isArray(regionPrices?.futureLidlPlusPrices) ? regionPrices.futureLidlPlusPrices : [])
      .map((entry) => unwrapPriceSlot(entry?.price, true, entry)),
    ...(Array.isArray(regionPrices?.futurePrices) ? regionPrices.futurePrices : [])
      .map((entry) => unwrapPriceSlot(entry?.price, false, entry)),
  ].filter(Boolean).sort((a, b) => (timestamp(a.startDate) ?? Infinity) - (timestamp(b.startDate) ?? Infinity));
  return { current, future };
}

export function lidlCampaignPriceForRegion(campaignProduct, offerRegion, now = new Date()) {
  const region = String(offerRegion ?? '').trim();
  if (!region) return null;
  const regionNumber = Number(region);
  if (Array.isArray(campaignProduct?.regions) && campaignProduct.regions.length
    && !campaignProduct.regions.some((candidate) => Number(candidate) === regionNumber)) return null;
  const regionMeta = campaignProduct?.regionsV2?.[region];
  if (!regionMeta || String(regionMeta.status ?? '').toUpperCase() !== 'ONLINE') return null;
  const regionPriceId = String(regionMeta.regionPriceId ?? '').trim();
  const regionPrices = campaignProduct?.regionsPrices?.[regionPriceId];
  if (!regionPrices) return null;
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));
  if (!Number.isFinite(nowMs)) return null;
  const { current, future } = regionalPriceSlots(regionPrices);
  const relevant = (slot) => timestamp(slot.endDate) == null || timestamp(slot.endDate) >= nowMs;
  return current.find(relevant) ?? future.find(relevant) ?? null;
}

export function applyLidlCampaign(row, campaign, campaignProduct, offerRegion, now = new Date()) {
  const selected = lidlCampaignPriceForRegion(campaignProduct, offerRegion, now);
  if (!selected) return null;
  const oldPrice = Number.isFinite(selected.oldPrice) && selected.oldPrice > selected.price
    ? selected.oldPrice
    : null;
  const percentage = selected.highlightText
    || (Number.isFinite(selected.percentage) && selected.percentage > 0 ? `-${selected.percentage}%` : null);
  const promoName = `${campaign.label}${selected.plus ? ' · Lidl Plus' : ''}`;
  return {
    ...row,
    promo_name: promoName,
    promo_text: percentage && !promoName.toLowerCase().includes(percentage.toLowerCase()) ? percentage : null,
    promo_price: selected.price,
    promo_base_price: oldPrice,
    promo_start: isoDate(selected.startDate),
    promo_end: isoDate(selected.endDate, selected.endExclusive),
    is_lidl_plus_offer: selected.plus,
    raw: {
      ...(row?.raw ?? {}),
      campaign: {
        source: 'lidl.es',
        key: campaign.key,
        label: campaign.label,
        url: campaign.url,
        webProductId: campaignProduct.productId,
        nat: campaignProduct.nat,
        ians: campaignProduct.ians,
        canonicalUrl: campaignProduct.canonicalUrl,
        offerRegion: String(offerRegion),
        price: selected,
      },
    },
  };
}
