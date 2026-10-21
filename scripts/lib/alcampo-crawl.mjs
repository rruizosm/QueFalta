import { writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { canonicalPricePerUnit, toNumber } from './price.mjs';
import { extractAlcampoPromotionDetails, mergeAlcampoPromotionDetails, normalizeAlcampoOffer } from './retailer-offers.mjs';

export const CHECKPOINT_VERSION = 3;
const unique = (items) => [...new Set(items)];

export function describeTraversal({ catalogTasks, promotionTasks, catName, catParent }) {
  // Se reanuda por ID: orden, slug y codificación de URL no cambian la
  // cobertura. Sí importan las páginas seleccionadas y su clasificación.
  const canonical = (values) => [...new Set(values.map((item) => JSON.stringify(item)))].sort().map((item) => JSON.parse(item));
  const manifest = {
    version: 1,
    catalog: canonical(catalogTasks.map((task) => [task.key, task.leaf.n1, task.leaf.n2])),
    promotions: canonical(promotionTasks.map((task) => task.key)),
    categories: canonical([...catName]),
    parents: canonical([...catParent]),
  };
  const id = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  return { id, manifest };
}

export function reconcileTraversal(checkpoint, restored, traversal, legacyId) {
  if (checkpoint.version !== CHECKPOINT_VERSION) return { revalidate: true, discardedPages: 0, reason: 'checkpoint anterior a V3' };
  const compatible = checkpoint.traversalManifest?.version === 1
    ? checkpoint.traversalId === traversal.id
    : Boolean(legacyId && checkpoint.traversalId === legacyId);
  if (compatible) return { revalidate: false, discardedPages: 0, reason: null };
  const discardedPages = restored.completed.size;
  // No hay procedencia por página para cada producto guardado. Con otro
  // alcance no se pueden conservar vistos y páginas completas por separado:
  // podrían publicarse productos de una rama retirada. Conservar los datos,
  // pero exigir que vuelvan a verse en el recorrido actual.
  restored.completed.clear();
  restored.seenProductIds.clear();
  return {
    revalidate: true, discardedPages,
    reason: checkpoint.traversalManifest
      ? 'cambió la selección o clasificación de las páginas'
      : 'la firma antigua no coincide y no guarda el detalle del recorrido',
  };
}

export function applyOffer(row, offer) {
  for (const key of ['promo_name', 'promo_text', 'promo_price', 'promo_base_price', 'promo_start', 'promo_end']) {
    row[key] = offer?.[key] ?? null;
  }
  row.promo_online_only = offer?.promo_online_only ?? false;
  row.promo_details = offer?.promo_details ?? [];
}

export function currentPrice(entity) {
  return toNumber(entity?.promoPrice?.current?.amount ?? entity?.promoPrice?.amount
    ?? entity?.price?.current?.amount ?? entity?.price?.amount ?? entity?.currentPrice?.amount);
}

export function enrichProductPromotion(row, entity, source = {}) {
  const discovered = extractAlcampoPromotionDetails(entity, source);
  const details = mergeAlcampoPromotionDetails(row.promo_details ?? [], discovered);
  const nextPrice = currentPrice(entity);
  const previousOffer = normalizeAlcampoOffer(row.raw);
  const incomingOffer = normalizeAlcampoOffer(entity);
  // Una observación sin precio, o sin tachado al mismo precio, no destruye
  // una rebaja acreditada. Un precio distinto sí invalida el tachado anterior.
  const preservePrice = nextPrice == null || (nextPrice === currentPrice(row.raw)
    && previousOffer?.promo_price != null && incomingOffer?.promo_price == null);
  const raw = { ...row.raw, ...entity };
  for (const key of ['price', 'promoPrice', 'unitPrice', 'promoUnitPrice', 'currentPrice']) {
    if (preservePrice) {
      if (row.raw?.[key] != null) raw[key] = row.raw[key];
      else delete raw[key];
    } else if (entity[key] == null) delete raw[key];
  }
  row.raw = raw;
  applyOffer(row, normalizeAlcampoOffer(raw, { additionalPromotions: details }));
  const price = currentPrice(raw);
  if (price != null) {
    row.unit_price = price;
    row.price_format = `${price.toFixed(2).replace('.', ',')} €`;
    const unit = raw.price?.unit;
    const ppu = canonicalPricePerUnit(unit?.current?.amount
      ?? raw.promoUnitPrice?.price?.amount ?? raw.unitPrice?.price?.amount,
    unit?.label ?? unit?.unit ?? raw.promoUnitPrice?.unit ?? raw.unitPrice?.unit);
    // No conservar €/kg de un precio anterior si la nueva fuente no lo aporta.
    row.price_per_unit = ppu?.value ?? null;
    row.price_per_unit_unit = ppu?.unit ?? null;
  }
  return discovered;
}

export function mergeCampaign(map, promotion) {
  const id = promotion.retailer_promotion_id;
  if (!id) return;
  const previous = map.get(String(id));
  map.set(String(id), {
    id: String(id),
    onlineOnly: Boolean(previous?.onlineOnly || promotion.online_only),
    sourcePaths: unique([...(previous?.sourcePaths ?? []), ...(promotion.source_paths ?? [])]).slice(0, 8),
  });
}

export function discoverCampaigns(map, entity, source = {}) {
  for (const detail of extractAlcampoPromotionDetails(entity, source)) mergeCampaign(map, detail);
}

export function restoreCheckpoint(checkpoint) {
  if (checkpoint.version != null && ![1, 2, CHECKPOINT_VERSION].includes(checkpoint.version)) throw new Error('versión de checkpoint no soportada');
  const products = new Map(), campaigns = new Map();
  const legacy = checkpoint.version !== CHECKPOINT_VERSION;
  for (const row of checkpoint.products ?? []) {
    // V1/V2 pueden tener online_only contaminado por la rama o por otra
    // campaña. Reconstruir esa marca solo a partir del texto explícito.
    const saved = (row.promo_details ?? []).map((detail) => legacy ? {
      ...detail,
      online_only: extractAlcampoPromotionDetails({ offers: [{ description: detail.description }] })[0]?.online_only ?? false,
    } : detail);
    if (legacy && row.promo_price > 0 && row.promo_base_price > row.promo_price) {
      // V2 guardaba el precio enriquecido fuera de raw. Repararlo antes de
      // normalizar y volver a comprobar todas las páginas al migrar.
      row.raw = { ...row.raw, price: {
        current: { amount: String(row.promo_price) },
        original: { amount: String(row.promo_base_price) },
      } };
      delete row.raw.promoPrice;
    }
    applyOffer(row, normalizeAlcampoOffer(row.raw, { additionalPromotions: saved }));
    products.set(String(row.id), row);
    for (const detail of row.promo_details) mergeCampaign(campaigns, detail);
  }
  if (!legacy) for (const campaign of checkpoint.campaigns ?? []) {
    mergeCampaign(campaigns, { retailer_promotion_id: campaign.id,
      online_only: campaign.onlineOnly, source_paths: campaign.sourcePaths });
  }
  // Los índices V1/V2 no demuestran cobertura ni ausencia de timeouts.
  // Se conservan productos, pero se vuelven a verificar las páginas.
  return { products, campaigns,
    completed: new Set(legacy ? [] : checkpoint.completed ?? []),
    seenProductIds: new Set(legacy ? [] : checkpoint.seenProductIds ?? []),
    legacy,
  };
}

export async function saveCheckpoint(path, value) {
  const temp = `${path}.tmp`;
  await writeFile(temp, JSON.stringify(value));
  await rename(temp, path);
}

export async function withRetries(action, { attempts = 3, delay = async () => {}, onRetry = () => {} } = {}) {
  for (let attempt = 1; ; attempt++) {
    try { return await action(); }
    catch (error) {
      if (attempt >= attempts || /verificación|pestaña se cerró/i.test(error.message)) throw error;
      onRetry(error, attempt);
      await delay();
    }
  }
}

// Ejecuta primero, confirma después. Los fallos nunca avanzan el checkpoint.
export async function runPending(getTasks, completed, visit, persist) {
  for (;;) {
    const task = getTasks().find((item) => !completed.has(item.key));
    if (!task) return;
    await visit(task);
    completed.add(task.key);
    await persist();
  }
}

function refs(groups) {
  if (!Array.isArray(groups)) throw new Error('listado sin grupos de productos verificables');
  return unique(groups.flatMap((group) => {
    if (!Array.isArray(group.products)) throw new Error('grupo sin referencias de productos');
    return group.products.map((id) => {
      if (typeof id !== 'string' || !id) throw new Error('referencia de producto inválida');
      return id;
    });
  }));
}

export function parseListing(html, kind, campaignId = null) {
  const script = html.match(/<script\b[^>]*data-test=["']initial-state-script["'][^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('SSR sin estado inicial verificable');
  const state = JSON.parse(script.slice(script.indexOf('=') + 1).replace(/;\s*$/, ''));
  const products = state.data?.products;
  const wrapper = kind === 'offer' ? products?.offers : products?.catalogue;
  if (!wrapper || wrapper.error || wrapper.fetchError || wrapper.isFetching) throw new Error('SSR con error o carga pendiente');
  const data = wrapper.data;
  if (campaignId && String(data?.retailerPromotionId) !== String(campaignId)) throw new Error('landing redirigida a otra campaña');
  const ids = refs(kind === 'offer' ? data?.promotionGroups : data?.productGroups);
  if (!products.productEntities || Array.isArray(products.productEntities)) throw new Error('SSR sin productEntities');
  return { ids, entities: products.productEntities, nextPageToken: data.nextPageToken ?? null,
    regionId: state.session?.metadata?.regionId,
    // activePeriod es metadata de campaña; no se atribuye a otras ofertas.
    campaign: kind === 'offer' ? data : null,
  };
}

export function parseApiListing(data) {
  if (!Array.isArray(data?.productGroups) || !data.metadata) throw new Error('paginación sin grupos o metadata');
  const ids = [], entities = {};
  for (const group of data.productGroups) {
    const decorated = group.decoratedProducts ?? [];
    for (const product of decorated) {
      if (!product?.productId) throw new Error('producto decorado sin ID');
      entities[product.productId] = product;
      ids.push(String(product.productId));
    }
    // La web concatena decoratedProducts + otherProductIds (PPWS y PQL).
    const references = group.otherProductIds ?? group.productIds ?? group.products
      ?? (Array.isArray(group.decoratedProducts) ? [] : null);
    if (!Array.isArray(references)) throw new Error('paginación sin referencias completas');
    for (const product of references) {
      const id = typeof product === 'string' ? product : product?.productId;
      if (!id) throw new Error('paginación con referencia inválida');
      ids.push(String(id));
      if (product?.product) entities[id] = { ...product.product, productId: id };
    }
  }
  return { ids: unique(ids), entities, nextPageToken: data.metadata.nextPageToken ?? null };
}

export async function completeListing(initial, { kind, categoryId, requestJson, pause = async () => {}, maxPages = 200 }) {
  const result = {}, tokens = new Set();
  let part = initial;
  for (let index = 0; index < maxPages; index++) {
    const entities = { ...part.entities };
    const missing = part.ids.filter((id) => !entities[id]?.name);
    for (let i = 0; i < missing.length; i += 50) {
      await pause();
      const batch = missing.slice(i, i + 50);
      // Es la consulta de decoración que usa la web; PUT no modifica catálogo.
      const data = await requestJson('/api/webproductpagews/v6/products', 'PUT', batch);
      if (!Array.isArray(data?.products)) throw new Error('decoración sin productos');
      for (const entity of data.products) if (entity?.productId) entities[entity.productId] = entity;
      if (batch.some((id) => !entities[id]?.name)) throw new Error('decoración incompleta; faltan productos enumerados');
    }
    let added = 0;
    for (const id of part.ids) {
      if (!entities[id]?.name || String(entities[id].productId) !== id) throw new Error('producto enumerado sin datos válidos');
      if (!result[id]) added++;
      result[id] = entities[id];
    }
    const token = part.nextPageToken;
    if (!token) return result;
    if (kind === 'offer') throw new Error('landing de oferta paginada: contrato no soportado; no se publica');
    if (tokens.has(token) || (index > 0 && added === 0)) throw new Error('paginación sin avance');
    tokens.add(token);
    const query = new URLSearchParams({ pageToken: token, maxPageSize: '300', maxProductsToDecorate: '50', includeAdditionalPageInfo: 'false' });
    if (categoryId) query.set('retailerCategoryId', categoryId);
    if (kind === 'promotion') {
      if (!initial.regionId) throw new Error('sesión sin región para paginar promociones');
      query.set('regionId', initial.regionId);
    } else query.set('tag', 'web,category-item');
    const endpoint = kind === 'promotion' ? '/api/product-listing-pages/v1/pages/promotions' : '/api/webproductpagews/v6/product-pages';
    await pause();
    part = parseApiListing(await requestJson(`${endpoint}?${query}`, 'GET'));
  }
  throw new Error('límite de páginas alcanzado; cobertura incompleta');
}

export function resolveFoodCategory(entity, catName, catParent, rootNames) {
  const path = entity.categoryPath;
  if (!Array.isArray(path) || !path.length) throw new Error('producto promocional sin categoría verificable');
  const rootName = path[0];
  if (!rootNames.has(rootName)) return null;
  const roots = [...catName].filter(([id, name]) => name === rootName && !catParent.has(id));
  if (roots.length !== 1) throw new Error(`raíz alimentaria ambigua: ${rootName}`);
  const n1 = roots[0][0];
  const children = [...catName].filter(([id, name]) => catParent.get(id) === n1 && name === path[1]);
  if (children.length > 1) throw new Error(`categoría alimentaria ambigua: ${path[1]}`);
  return { n1, n2: children[0]?.[0] ?? n1 };
}
