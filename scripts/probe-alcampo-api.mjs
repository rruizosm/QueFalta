#!/usr/bin/env node
// Read-only proof: categories, general catalogue status, paginated offers, detail.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AlcampoApi } from './lib/alcampo-api.mjs';

const out = process.env.ALCAMPO_OUTPUT || 'scripts/logs/alcampo-api';
const maxPages = Number(process.env.MAX_PAGES || 2);
const category = process.env.CATEGORY_ID || undefined;
const api = new AlcampoApi();
const summary = { checkedAt: new Date().toISOString(), scope: category || 'all promotional categories', generalCatalogue: null };
await mkdir(out, { recursive: true });
const save = (name, value) => writeFile(join(out, name), `${JSON.stringify(value, null, 2)}\n`);

try {
  const { regionId } = await api.session();
  summary.regionId = regionId;
  const categories = await api.categories();
  await save('categories.json', categories);
  summary.categoryRoots = categories.length;
  console.log(`[alcampo-api] categories: ${categories.length} roots; region ${regionId}`);
  try {
    for await (const page of api.pages({ retailerCategoryId: category || 'OC16', maxPages: 1 })) {
      summary.generalCatalogue = { accessible: true, testedCategory: category || 'OC16', products: page.products.length, complete: page.complete };
      await save('catalogue-sample.json', page.products);
    }
  } catch (error) {
    summary.generalCatalogue = { accessible: false, error: error.message };
    console.log(`[alcampo-api] general catalogue unavailable: ${error.message}`);
  }
  const products = new Map();
  const promotionIds = new Set();
  for await (const page of api.pages({ promotions: true, regionId, retailerCategoryId: category, maxPages })) {
    for (const product of page.products) {
      if (!product.productId) throw new Error('Product without productId');
      products.set(product.productId, product);
      for (const promotion of product.promotions || []) {
        if (promotion.retailerPromotionId) promotionIds.add(promotion.retailerPromotionId);
      }
    }
    summary.offerPages = page.page;
    summary.offersComplete = page.complete;
    summary.offersTruncated = page.truncated;
    console.log(`[alcampo-api] offers page ${page.page}: ${page.products.length} products; complete=${page.complete}`);
  }
  summary.offerProducts = products.size;
  summary.promotionIds = promotionIds.size;
  await save('offer-products.json', [...products.values()]);
  await save('promotion-ids.json', [...promotionIds]);
  const id = process.env.PROMOTION_ID || [...promotionIds][0];
  if (id) {
    const detail = await api.promotion(id);
    await save('promotion-detail.json', detail);
    summary.promotionDetail = {
      retailerPromotionId: id, description: detail.description, activePeriod: detail.activePeriod,
      products: new Set(detail.promotionGroups.flatMap(g => g.products.map(p => p.productId))).size,
    };
  }
  summary.status = summary.generalCatalogue.accessible ? 'api-access-verified' : 'partial-access-catalogue-blocked';
  // Exit 2 deliberately distinguishes partial API access from full success.
  process.exitCode = summary.generalCatalogue.accessible ? 0 : 2;
} catch (error) {
  summary.status = 'failed';
  summary.error = error.message;
  process.exitCode = 1;
} finally {
  await save('summary.json', summary);
  console.log(JSON.stringify(summary, null, 2));
}
