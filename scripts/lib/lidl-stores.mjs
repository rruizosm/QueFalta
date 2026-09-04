const clean = (value) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
};

const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** El directorio usa ES03572 y Product Catalog usa ES3572. */
export function lidlCatalogStoreId(objectNumber) {
  const match = clean(objectNumber)?.toUpperCase().match(/^([A-Z]{2})0([0-9]{4})$/);
  return match ? `${match[1]}${match[2]}` : null;
}

export function normalizeLidlStore(store, syncedAt = new Date().toISOString()) {
  const id = lidlCatalogStoreId(store?.objectNumber);
  const address = store?.address ?? {};
  const marketing = store?.marketingData ?? {};
  const latitude = finiteNumber(address.latitude);
  const longitude = finiteNumber(address.longitude);
  const postalCode = clean(address.zip);
  const zone = clean(marketing.zone)?.toUpperCase();
  const status = clean(store?.status?.name)?.toLowerCase();
  if (!id || !postalCode?.match(/^[0-9]{5}$/) || latitude == null || longitude == null
      || !['PEN', 'BAL', 'CAN'].includes(zone) || !status) return null;

  return {
    id,
    directory_object_number: String(store.objectNumber).toUpperCase(),
    name: clean(store.storeName) ?? `Lidl ${id}`,
    street: clean(address.streetName),
    street_number: clean(address.streetNumber),
    postal_code: postalCode,
    city: clean(address.city) ?? postalCode,
    autonomous_community: clean(address.state),
    latitude,
    longitude,
    offer_region: marketing.offerRegion == null ? null : String(marketing.offerRegion),
    offer_region_name: clean(marketing.offerRegionName),
    zone,
    zone_name: clean(marketing.zoneName),
    status,
    status_from: store?.status?.from ?? null,
    status_to: store?.status?.to ?? null,
    selectable: status === 'open',
    published: true,
    raw: {
      status: store?.status ?? null,
      infoIcons: Array.isArray(marketing.infoIcons) ? marketing.infoIcons : [],
    },
    synced_at: syncedAt,
  };
}

/** Crea las coincidencias exactas. Las filas `nearby` podrán añadirse después
 * con un índice postal geocodificado sin cambiar el contrato de la app. */
export function buildLidlExactPostalCandidates(stores, syncedAt = new Date().toISOString()) {
  const byPostalCode = new Map();
  for (const store of stores) {
    if (!store.selectable) continue;
    const candidates = byPostalCode.get(store.postal_code) ?? [];
    candidates.push(store);
    byPostalCode.set(store.postal_code, candidates);
  }

  return [...byPostalCode.entries()].flatMap(([postalCode, candidates]) => (
    [...candidates]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((store, index) => ({
        postal_code: postalCode,
        store_id: store.id,
        match_kind: 'exact',
        distance_km: 0,
        rank: index + 1,
        is_default: index === 0,
        published: true,
        synced_at: syncedAt,
      }))
  ));
}

export function assertLidlStoreDirectory(stores, {
  minStores = 700,
  minOpenStores = 680,
} = {}) {
  if (stores.length < minStores) {
    throw new Error(`solo ${stores.length} tiendas Lidl (< ${minStores}); no se escribe`);
  }
  const ids = new Set(stores.map((store) => store.id));
  if (ids.size !== stores.length) throw new Error('el directorio Lidl contiene ids duplicados');
  const openStores = stores.filter((store) => store.selectable).length;
  if (openStores < minOpenStores) {
    throw new Error(`solo ${openStores} tiendas Lidl abiertas (< ${minOpenStores}); no se escribe`);
  }
}
