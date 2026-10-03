// Public storefront API. Anonymous cookies stay in memory; no database writes.
export const ALCAMPO_BASE = 'https://www.compraonline.alcampo.es';

export class AlcampoApiError extends Error {
  constructor(path, status, contentType) {
    super(`Alcampo ${path.split('?')[0]}: HTTP ${status} (${contentType || 'unknown content type'})`);
    this.status = status;
  }
}

export class AlcampoApi {
  constructor({ fetchImpl = fetch, delayMs = 1500 } = {}) {
    this.fetch = fetchImpl;
    this.delayMs = delayMs;
    this.cookies = new Map();
  }

  async request(path, json = true) {
    const response = await this.fetch(`${ALCAMPO_BASE}${path}`, {
      headers: {
        Accept: json ? 'application/json' : 'text/html',
        ...(this.cookies.size ? { Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      },
      signal: AbortSignal.timeout(30000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const at = pair.indexOf('=');
      if (at > 0) this.cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    const type = response.headers.get('content-type') || '';
    if (!response.ok || (json && !type.includes('application/json'))) {
      // Do not retry access denials or serialize challenge pages/session tokens.
      await response.body?.cancel();
      throw new AlcampoApiError(path, response.status, type);
    }
    return json ? response.json() : response.text();
  }

  async session() {
    const html = await this.request('/', false);
    const regionId = html.match(/"regionId":"([a-f0-9-]{36})"/)?.[1];
    if (!regionId) throw new Error('Alcampo: anonymous regionId missing from storefront HTML');
    return { regionId };
  }

  async categories() {
    const data = await this.request('/api/webproductpagews/v1/categories?decoration=false&categoryDepth=6');
    if (!Array.isArray(data) || !data.length) throw new Error('Alcampo: invalid category tree');
    return data;
  }

  async *pages({ promotions = false, regionId, retailerCategoryId, maxPages = 2, pageSize = 300 } = {}) {
    if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error('maxPages must be a positive integer');
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 300) throw new Error('pageSize must be between 1 and 300');
    if (promotions && !regionId) throw new Error('Promotions require the storefront regionId');
    let token;
    const seenTokens = new Set();
    for (let page = 1; page <= maxPages; page++) {
      const params = new URLSearchParams({
        includeAdditionalPageInfo: String(!token),
        maxPageSize: String(pageSize), maxProductsToDecorate: String(pageSize),
      });
      if (regionId && promotions) params.set('regionId', regionId);
      if (retailerCategoryId) params.set('retailerCategoryId', retailerCategoryId);
      if (token) params.set('pageToken', token);
      if (!promotions) { params.append('tag', 'web'); params.append('tag', 'category-item'); }
      const endpoint = promotions
        ? '/api/product-listing-pages/v1/pages/promotions'
        : '/api/webproductpagews/v6/product-pages';
      const data = await this.request(`${endpoint}?${params}`);
      if (!Array.isArray(data.productGroups) || data.productGroups.some(g => !Array.isArray(g.decoratedProducts))) {
        throw new Error('Alcampo: invalid product page, cannot treat it as an empty catalogue');
      }
      const next = data.metadata?.nextPageToken;
      if (next && seenTokens.has(next)) throw new Error('Alcampo: repeated pagination token');
      if (next) seenTokens.add(next);
      yield {
        page, products: data.productGroups.flatMap(g => g.decoratedProducts),
        complete: !next, truncated: Boolean(next && page === maxPages),
      };
      if (!next) return;
      token = next;
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }
  }

  async promotion(retailerPromotionId) {
    const data = await this.request(`/api/webproductpagews/v4/promotion/retailer-id/${encodeURIComponent(retailerPromotionId)}`);
    if (!Array.isArray(data.promotionGroups) || data.promotionGroups.some(g => !Array.isArray(g.products))) {
      throw new Error('Alcampo: invalid promotion detail');
    }
    return data;
  }
}
