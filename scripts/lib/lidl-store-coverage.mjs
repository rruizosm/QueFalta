// Three matching complete observations per store on 2026-09-04: the two
// fleet attempts and a sequential DRY_RUN. All 40 leaves, 100% price/image.
// See scripts/README-lidl-sync.md. No exceptions for unverified stores.
export const LIDL_VERIFIED_SMALL_CATALOGS = Object.freeze({
  ES0367: 2145,
  ES0431: 2151,
  ES0529: 2195,
  ES0530: 2166,
  ES0848: 2146,
});

export function lidlMinimumProducts(storeId, defaultMinimum = 2200) {
  const verified = LIDL_VERIFIED_SMALL_CATALOGS[storeId];
  return verified ? Math.min(defaultMinimum, Math.floor(verified * 0.98)) : defaultMinimum;
}
