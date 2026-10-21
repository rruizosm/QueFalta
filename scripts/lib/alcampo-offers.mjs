import { extractAlcampoPromotionDetails } from './retailer-offers.mjs';
import { runPending } from './alcampo-crawl.mjs';

const PROMOTIONS_PATH = '/api/product-listing-pages/v1/pages/promotions';

export function assertAlcampoRegion(expected, actual) {
  if (!expected || actual !== expected) {
    throw new Error(`región Alcampo incompatible: API=${expected}, catálogo=${actual ?? 'desconocida'}; selecciona la misma tienda antes de continuar`);
  }
}

export async function runAlcampoOffers({
  api, regionId, promotionTasks, campaigns, completed, ingest, persist,
  pause = async () => {}, maxPages = 200,
}) {
  await runPending(() => promotionTasks, completed, async (task) => {
    const entities = {};
    let complete = false;
    for await (const page of api.pages({
      promotions: true, regionId, retailerCategoryId: task.categoryId, maxPages,
    })) {
      if (page.truncated) throw new Error('límite de páginas de ofertas alcanzado; cobertura incompleta');
      for (const product of page.products) entities[product.productId] = product;
      complete = page.complete;
    }
    if (!complete) throw new Error('directorio de ofertas incompleto');
    const query = new URLSearchParams({ regionId });
    if (task.categoryId) query.set('retailerCategoryId', task.categoryId);
    await ingest(entities, { sourcePath: `${PROMOTIONS_PATH}?${query}` });
    await pause();
  }, persist);

  await runPending(() => [...campaigns.values()].map(campaign => ({
    key: `api:offer:${campaign.id}`, campaign,
  })), completed, async ({ campaign }) => {
    const detail = await api.promotion(campaign.id);
    const offer = {
      retailerPromotionId: detail.retailerPromotionId,
      description: detail.description,
      longDescription: detail.longDescription,
      type: detail.type,
      presentationMode: detail.presentationMode,
      activePeriod: detail.activePeriod,
    };
    const entities = {};
    for (const group of detail.promotionGroups) {
      for (const product of group.products) entities[product.productId] = { ...product, offer };
    }
    await ingest(entities, {
      sourcePath: `/api/webproductpagews/v4/promotion/retailer-id/${encodeURIComponent(campaign.id)}`,
      sourcePromotionId: campaign.id,
      sourceOnlineOnly: Boolean(campaign.onlineOnly
        || extractAlcampoPromotionDetails({ offer })[0]?.online_only),
    });
    await pause();
  }, persist);
}
