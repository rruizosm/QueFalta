import { validGlobalGtin } from './gtin.mjs';

export const BM_BASE_URL = 'https://www.online.bmsupermercados.es';
export const BM_API_BASE_URL = `${BM_BASE_URL}/api/rest/V1.0`;
export const BM_DEFAULT_POSTAL_CODES = [
  '20009', // Gipuzkoa
  '48009', // Bizkaia
  '01001', // Araba
  '39001', // Cantabria
  '31001', // Navarra
  '26001', // La Rioja
  '28008', // Madrid
  '05001', // Avila
  '19001', // Guadalajara
  '33001', // Asturias
  '50001', // Zaragoza
];

const DELIVERY_TYPE_PRIORITY = new Map([
  ['D', 0], // entrega a domicilio
  ['X', 1],
  ['T', 2], // recogida en tienda
  ['L', 3],
]);

const finiteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clean = (value) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
};

export function parseBmPostalCodes(value) {
  const raw = value == null || String(value).trim() === ''
    ? BM_DEFAULT_POSTAL_CODES
    : String(value).split(',');
  const unique = [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))];
  const invalid = unique.filter((postalCode) => !/^\d{5}$/.test(postalCode));
  if (invalid.length) throw new Error(`Codigos postales BM invalidos: ${invalid.join(', ')}`);
  if (!unique.length) throw new Error('No hay codigos postales BM que explorar');
  return unique;
}

export function bmCatalogOffset(page, pageSize) {
  if (!Number.isInteger(page) || page < 1) throw new Error('La pagina BM debe ser un entero positivo');
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('El tamano de pagina BM debe ser un entero positivo');
  return (page - 1) * pageSize;
}

export function flattenBmShippingAreas(payload, requestedPostalCode) {
  if (!Array.isArray(payload)) throw new Error('shipping/area no devolvio un array');
  return payload.flatMap((group) => {
    const areas = Array.isArray(group?.shippingAreas) ? group.shippingAreas : [];
    return areas.map((area) => ({
      requestedPostalCode,
      groupId: clean(group?.groupId),
      groupName: clean(group?.groupName),
      shippingZoneId: clean(area?.shippingZoneId),
      deliveryTypeId: clean(area?.deliveryTypeId),
      enabled: area?.enabled !== false,
      description: clean(area?.description),
      zoneId: clean(area?.zone?.id),
      storeCode: clean(area?.zone?.storeCode),
      storeName: clean(area?.zone?.name),
      storePostalCode: clean(area?.zone?.address?.zipCode),
      city: clean(area?.zone?.address?.city),
      region: clean(area?.zone?.address?.region) ?? clean(group?.groupName),
    }));
  });
}

export function selectPreferredBmLocation(areas) {
  if (!Array.isArray(areas)) return null;
  return [...areas]
    .filter((area) => area?.enabled && area?.zoneId && area?.shippingZoneId)
    .sort((left, right) => {
      const leftPriority = DELIVERY_TYPE_PRIORITY.get(left.deliveryTypeId) ?? 99;
      const rightPriority = DELIVERY_TYPE_PRIORITY.get(right.deliveryTypeId) ?? 99;
      return leftPriority - rightPriority
        || String(left.shippingZoneId).localeCompare(String(right.shippingZoneId));
    })[0] ?? null;
}

export function bmLocationHeaders(location) {
  if (!location?.zoneId || !location?.shippingZoneId) {
    throw new Error('La ubicacion BM no tiene zoneId y shippingZoneId');
  }
  return {
    'X-TOL-LOCALE': 'es',
    'X-TOL-ZONE': String(location.zoneId),
    'X-TOL-CHANNEL': '1',
    'X-TOL-CURRENCY': 'EUR',
    'X-TOL-SHIPPING-ZONE': String(location.shippingZoneId),
  };
}

export function flattenBmCategories(payload) {
  if (!Array.isArray(payload)) throw new Error('shopping/category/menu no devolvio un array');
  const rows = [];
  const visit = (node, parentId = null, pathIds = []) => {
    if (node?.id == null) return;
    const id = String(node.id);
    const nextPath = [...pathIds, id];
    rows.push({
      id,
      name: clean(node.name ?? node.nombre) ?? `Categoria ${id}`,
      parentId,
      level: finiteNumber(node.level) ?? nextPath.length,
      pathIds: nextPath,
      url: clean(node.url),
      childCount: Array.isArray(node.subcategories) ? node.subcategories.length : 0,
    });
    for (const child of node.subcategories ?? []) visit(child, id, nextPath);
  };
  for (const node of payload) visit(node);
  return rows;
}

function priceEntry(product, id) {
  const prices = Array.isArray(product?.priceData?.prices) ? product.priceData.prices : [];
  return prices.find((price) => price?.id === id) ?? null;
}

function priceValue(entry, key) {
  return finiteNumber(entry?.value?.[key]);
}

export function classifyBmOffer(offer, hasOfferPrice = false) {
  if (!offer && !hasOfferPrice) return null;
  const text = [offer?.minDescription, offer?.shortDescription, offer?.longDescription]
    .map((value) => clean(value))
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/cuenta bm|en tu cuenta|saldo|cheque/.test(text)) return 'club';
  if (/2\s*(?:a|ª|da)|segunda unidad/.test(text)) return 'second_unit';
  if (/\b\d+\s*x\s*\d+\b|\b\d+\s*por\s*[\d,.]+/.test(text)) return 'multibuy';
  if (hasOfferPrice || offer?.promotionType === 1 || /oferta|descuento|ahorra/.test(text)) return 'discount';
  return 'other';
}

export function normalizeBmProduct(product, location = null) {
  if (!product || typeof product !== 'object') throw new Error('Producto BM invalido');
  const code = clean(product.code);
  const name = clean(product.productData?.name ?? product.productData?.description);
  if (!code || !name) throw new Error('Producto BM sin code o productData.name');

  const regular = priceEntry(product, 'PRICE');
  const offerPriceEntry = priceEntry(product, 'OFFER_PRICE');
  const primaryOffer = Array.isArray(product.offers) ? product.offers[0] ?? null : null;
  const rawEan = String(product.ean ?? '').replace(/\D/g, '');
  const categories = Array.isArray(product.categories) ? product.categories : [];
  const leafCategory = categories.find((category) => category?.type === 0) ?? categories[0] ?? null;
  const basePrice = priceValue(regular, 'centAmount');
  const offerPrice = priceValue(offerPriceEntry, 'centAmount');
  const basePricePerUnit = priceValue(regular, 'centUnitAmount');
  const offerPricePerUnit = priceValue(offerPriceEntry, 'centUnitAmount');
  const temporaryOutOfStock = product.productData?.temporaryOutOfStock === true;
  const availability = clean(product.productData?.availability);

  return {
    id: code,
    sourceId: product.id == null ? null : String(product.id),
    ean: rawEan || null,
    globalGtin: validGlobalGtin(rawEan) ? rawEan : null,
    name,
    brand: clean(product.productData?.brand?.name ?? product.productData?.brand),
    imageUrl: clean(product.productData?.imageURL),
    productUrl: clean(product.productData?.url),
    categoryId: leafCategory?.id == null ? null : String(leafCategory.id),
    categoryName: clean(leafCategory?.name),
    categoryIds: categories.map((category) => String(category.id)),
    basePrice,
    offerPrice,
    effectivePrice: offerPrice ?? basePrice,
    pricePerUnit: offerPricePerUnit ?? basePricePerUnit,
    pricePerUnitUnit: clean(product.priceData?.unitPriceUnitType)?.toLowerCase(),
    priceUnitType: clean(product.priceData?.priceUnitType),
    minimumUnit: finiteNumber(product.priceData?.minimumUnit),
    intervalUnit: finiteNumber(product.priceData?.intervalUnit),
    novelty: product.productData?.novelty === true,
    availability,
    temporaryOutOfStock,
    available: availability !== '0' && !temporaryOutOfStock,
    offer: primaryOffer ? {
      id: primaryOffer.id == null ? null : String(primaryOffer.id),
      promotionId: primaryOffer.promotionId == null ? null : String(primaryOffer.promotionId),
      type: classifyBmOffer(primaryOffer, offerPrice != null),
      label: clean(primaryOffer.minDescription),
      description: clean(primaryOffer.shortDescription),
      startsAt: clean(primaryOffer.from),
      endsAt: clean(primaryOffer.to),
      amount: finiteNumber(primaryOffer.amount),
      discount: finiteNumber(primaryOffer.discount),
    } : offerPrice != null ? {
      id: null,
      promotionId: null,
      type: 'discount',
      label: 'OFERTA',
      description: null,
      startsAt: null,
      endsAt: null,
      amount: offerPrice,
      discount: null,
    } : null,
    location: location ? {
      postalCode: location.requestedPostalCode,
      zoneId: String(location.zoneId),
      shippingZoneId: String(location.shippingZoneId),
    } : null,
  };
}

export function validateBmCatalogPage(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('catalog/product no devolvio un objeto');
  if (!Array.isArray(payload.products)) throw new Error('catalog/product no contiene products[]');
  if (!Number.isFinite(Number(payload.totalCount))) throw new Error('catalog/product no contiene totalCount numerico');
  return payload;
}

export function summarizeBmProducts(products) {
  const promotionTypes = {};
  for (const product of products) {
    if (product.offer?.type) promotionTypes[product.offer.type] = (promotionTypes[product.offer.type] ?? 0) + 1;
  }
  return {
    sampledProducts: products.length,
    withValidGtin: products.filter((product) => product.globalGtin).length,
    withOffer: products.filter((product) => product.offer).length,
    novelties: products.filter((product) => product.novelty).length,
    temporarilyOutOfStock: products.filter((product) => product.temporaryOutOfStock).length,
    variableMeasure: products.filter((product) => product.minimumUnit !== 1 || product.intervalUnit !== 1).length,
    promotionTypes,
  };
}

export function compareBmProductSamples(referenceProducts, candidateProducts) {
  const reference = new Map(referenceProducts.map((product) => [product.id, product]));
  const candidate = new Map(candidateProducts.map((product) => [product.id, product]));
  const commonIds = [...reference.keys()].filter((id) => candidate.has(id));
  const priceExamples = [];
  let priceDifferences = 0;
  let offerDifferences = 0;
  let availabilityDifferences = 0;

  for (const id of commonIds) {
    const left = reference.get(id);
    const right = candidate.get(id);
    if (left.effectivePrice !== right.effectivePrice) {
      priceDifferences++;
      if (priceExamples.length < 5) {
        priceExamples.push({ id, name: left.name, referencePrice: left.effectivePrice, candidatePrice: right.effectivePrice });
      }
    }
    if ((left.offer?.type ?? null) !== (right.offer?.type ?? null)) offerDifferences++;
    if (left.available !== right.available) availabilityDifferences++;
  }

  return {
    referenceSample: reference.size,
    candidateSample: candidate.size,
    commonProducts: commonIds.length,
    onlyInReference: [...reference.keys()].filter((id) => !candidate.has(id)).length,
    onlyInCandidate: [...candidate.keys()].filter((id) => !reference.has(id)).length,
    priceDifferences,
    offerDifferences,
    availabilityDifferences,
    priceExamples,
  };
}
