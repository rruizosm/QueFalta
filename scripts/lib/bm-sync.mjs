import { flattenBmCategories } from './bm.mjs';

const DEFAULT_EXCLUDED_ROOTS = new Set(['99999']);

const clean = (value) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
};

const finiteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const priceFormat = (value) => Number.isFinite(value)
  ? `${value.toFixed(2).replace('.', ',')} €`
  : null;

export function canonicalBmPriceUnit(value) {
  const unit = clean(value)?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!unit) return null;
  if (/\bkg\b|kilo/.test(unit)) return 'kg';
  if (/^l$|litro/.test(unit)) return 'l';
  if (/\bud\b|unidad|^u\.?$/.test(unit)) return 'ud';
  return null;
}

const dateOnly = (value) => {
  const text = clean(value);
  if (!text) return null;
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

/**
 * Reduce el árbol BM a los dos únicos niveles navegables de QueFalta.
 * Cada nodo N2-N6 queda asociado a su N1/N2; los niveles profundos no generan
 * filas de categoría, pero su ruta se devuelve para guardarla en raw.
 */
export function buildBmTwoLevelNavigation(
  menuPayload,
  { excludedRootIds = DEFAULT_EXCLUDED_ROOTS, syncedAt = new Date().toISOString() } = {},
) {
  const sourceRows = flattenBmCategories(menuPayload);
  const sourceById = new Map(sourceRows.map((row) => [row.id, row]));
  const categoryById = new Map();
  const navigationBySourceId = new Map();

  for (const source of sourceRows) {
    const [rootId, subcategoryId] = source.pathIds;
    if (!rootId || !subcategoryId || excludedRootIds.has(rootId)) continue;
    const root = sourceById.get(rootId);
    const subcategory = sourceById.get(subcategoryId);
    if (!root || !subcategory) continue;

    categoryById.set(rootId, {
      id: rootId,
      name: root.name,
      parent_id: null,
      product_count: 0,
      published: true,
      synced_at: syncedAt,
    });
    categoryById.set(subcategoryId, {
      id: subcategoryId,
      name: subcategory.name,
      parent_id: rootId,
      product_count: 0,
      published: true,
      synced_at: syncedAt,
    });
    navigationBySourceId.set(source.id, {
      rootCategoryId: rootId,
      rootCategoryName: root.name,
      categoryId: subcategoryId,
      categoryName: subcategory.name,
      sourcePathIds: [...source.pathIds],
    });
  }

  const categories = [...categoryById.values()].sort((left, right) => {
    const leftLevel = left.parent_id == null ? 1 : 2;
    const rightLevel = right.parent_id == null ? 1 : 2;
    return leftLevel - rightLevel
      || left.name.localeCompare(right.name, 'es', { sensitivity: 'base' })
      || left.id.localeCompare(right.id);
  });

  return { categories, navigationBySourceId, sourceRows };
}

export function resolveBmProductNavigation(product, navigationBySourceId) {
  const sourceIds = [product?.categoryId, ...(product?.categoryIds ?? [])]
    .filter(Boolean)
    .map(String);
  for (const sourceId of new Set(sourceIds)) {
    const navigation = navigationBySourceId.get(sourceId);
    if (navigation) return navigation;
  }
  return null;
}

function promotionColumns(product) {
  const offer = product.offer;
  return {
    promo_type: offer?.type ?? null,
    promo_name: offer?.label ?? (offer ? 'Oferta' : null),
    promo_text: offer?.description ?? null,
    promo_price: product.offerPrice ?? (offer ? finiteNumber(offer.amount) : null),
    promo_base_price: offer ? product.basePrice : null,
    promo_start: dateOnly(offer?.startsAt),
    promo_end: dateOnly(offer?.endsAt),
    offer_id: offer?.id ?? null,
    promotion_id: offer?.promotionId ?? null,
    promo_discount: finiteNumber(offer?.discount),
  };
}

function packagingOf(rawProduct, normalizedProduct) {
  const description = clean(rawProduct?.productData?.description);
  const name = clean(normalizedProduct?.name);
  if (!description || !name || !description.toLowerCase().startsWith(name.toLowerCase())) return null;
  return clean(description.slice(name.length));
}

function slimRawProduct(rawProduct, navigation) {
  const productData = rawProduct?.productData ?? {};
  const { attributeGroups, attributes, ...productDataSlim } = productData;
  return {
    ...rawProduct,
    productData: productDataSlim,
    quefaltaNavigation: navigation ? {
      rootCategoryId: navigation.rootCategoryId,
      categoryId: navigation.categoryId,
      sourcePathIds: navigation.sourcePathIds,
    } : null,
  };
}

export function bmProductRow(rawProduct, product, navigation, syncedAt) {
  const pricePerUnitUnit = canonicalBmPriceUnit(product.pricePerUnitUnit);
  return {
    id: product.id,
    retailer_product_id: product.sourceId,
    ean: product.ean,
    global_gtin: product.globalGtin,
    display_name: product.name,
    brand: product.brand,
    packaging: packagingOf(rawProduct, product),
    thumbnail: product.imageUrl,
    product_url: product.productUrl,
    root_category_id: navigation?.rootCategoryId ?? null,
    category_id: navigation?.categoryId ?? null,
    category_name: navigation?.categoryName ?? null,
    unit_price: product.effectivePrice,
    base_unit_price: product.basePrice,
    price_format: priceFormat(product.effectivePrice),
    price_per_unit: pricePerUnitUnit ? product.pricePerUnit : null,
    price_per_unit_unit: pricePerUnitUnit,
    price_unit_type: product.priceUnitType,
    minimum_unit: product.minimumUnit,
    interval_unit: product.intervalUnit,
    ...promotionColumns(product),
    available: product.available,
    is_new: product.novelty,
    published: true,
    raw: slimRawProduct(rawProduct, navigation),
    synced_at: syncedAt,
  };
}

export function bmLocationPriceRow(product, locationId, syncedAt) {
  const pricePerUnitUnit = canonicalBmPriceUnit(product.pricePerUnitUnit);
  return {
    id: `bm:${locationId}:${product.id}`,
    store: 'bm',
    product_id: product.id,
    location_id: locationId,
    unit_price: product.effectivePrice,
    base_unit_price: product.basePrice,
    price_format: priceFormat(product.effectivePrice),
    price_per_unit: pricePerUnitUnit ? product.pricePerUnit : null,
    price_per_unit_unit: pricePerUnitUnit,
    ...promotionColumns(product),
    available: product.available,
    is_new: product.novelty,
    published: true,
    raw: {
      sourceId: product.sourceId,
      availability: product.availability,
      temporaryOutOfStock: product.temporaryOutOfStock,
      sourceCategoryIds: product.categoryIds,
      offer: product.offer,
    },
    synced_at: syncedAt,
  };
}

export function bmAreaRows(areas, selected, syncedAt) {
  const deliveryTypes = new Set(['D', 'X', 'T', 'L']);
  const locations = new Map();
  const postalLocations = new Map();
  for (const area of areas ?? []) {
    if (!area?.shippingZoneId || !area?.zoneId || !area?.requestedPostalCode
      || !deliveryTypes.has(area.deliveryTypeId)) continue;
    locations.set(area.shippingZoneId, {
      id: area.shippingZoneId,
      zone_id: area.zoneId,
      store_code: area.storeCode,
      name: area.storeName ?? area.description ?? `BM ${area.zoneId}`,
      delivery_type_id: area.deliveryTypeId,
      group_id: area.groupId,
      group_name: area.groupName,
      description: area.description,
      store_postal_code: area.storePostalCode,
      city: area.city,
      region: area.region,
      enabled: area.enabled !== false,
      published: area.enabled !== false,
      raw: area,
      synced_at: syncedAt,
    });
    const key = `${area.requestedPostalCode}:${area.shippingZoneId}`;
    postalLocations.set(key, {
      postal_code: area.requestedPostalCode,
      location_id: area.shippingZoneId,
      is_preferred: area.shippingZoneId === selected?.shippingZoneId,
      enabled: area.enabled !== false,
      raw: { deliveryTypeId: area.deliveryTypeId, groupName: area.groupName },
      synced_at: syncedAt,
    });
  }
  return {
    locations: [...locations.values()],
    postalLocations: [...postalLocations.values()],
  };
}

export function assertBmCatalogCoverage(
  summaries,
  { minLocations = 7, minProducts = 6500, minCoverageRatio = 0.97 } = {},
) {
  if (summaries.length < minLocations) {
    throw new Error(`solo ${summaries.length} ubicaciones BM (< ${minLocations}); no se escribe`);
  }
  for (const summary of summaries) {
    if (summary.products < minProducts) {
      throw new Error(
        `BM ${summary.locationId}: solo ${summary.products} productos (< ${minProducts}); no se escribe`,
      );
    }
    const ratio = summary.total > 0 ? summary.products / summary.total : 0;
    if (ratio < minCoverageRatio) {
      throw new Error(
        `BM ${summary.locationId}: cobertura ${(ratio * 100).toFixed(1)}% (< ${(minCoverageRatio * 100).toFixed(1)}%); no se escribe`,
      );
    }
  }
}
