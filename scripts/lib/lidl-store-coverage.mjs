// Three matching complete observations per store; historical catalogs had
// 40 leaves. Langreo was rechecked on 2026-10-13 across all 70 current leaves
// with 100% price/image. See scripts/README-lidl-sync.md and its evidence.
// No exceptions for unverified stores.
export const LIDL_VERIFIED_SMALL_CATALOGS = Object.freeze({
  ES0367: 2145,
  ES0410: 2028,
  ES0431: 2151,
  ES0529: 2195,
  ES0530: 2166,
  ES0548: 2199,
  ES0848: 2146,
});

export function lidlMinimumProducts(storeId, defaultMinimum = 2200) {
  const verified = LIDL_VERIFIED_SMALL_CATALOGS[storeId];
  return verified ? Math.min(defaultMinimum, Math.floor(verified * 0.98)) : defaultMinimum;
}

// Lidl replaced the flat food categories with roots containing subcategories.
// Identify the three food families by name and check every leaf in them before
// declaring the source empty. Three empty subcategories alone are not enough.
export async function probeLidlCatalog({ storeId, roots, leaves, fetchLeaf }) {
  const families = [/\bpan(?:aderia)?\b/, /\bfrutas?\b/, /\bcarne\b/];
  const normalize = (name) => String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const groups = families.map((family) => {
    const matches = roots.filter((root) => family.test(normalize(root.name)));
    return matches.length === 1
      ? leaves.filter((leaf) => leaf.rootId === String(matches[0].id))
      : [];
  });
  const results = new Map();
  // An unknown tree needs the complete crawl; never infer absence from it.
  if (groups.some((group) => !group.length)) return results;
  const candidates = [...groups.map((group) => group[0]), ...groups.flatMap((group) => group.slice(1))];
  for (const leaf of candidates) {
    const rows = await fetchLeaf(leaf);
    results.set(leaf.id, rows);
    if (rows.length) return results;
  }
  throw new Error(`LIDL_CATALOG_EMPTY ${storeId}: pan, fruta y carne vacíos tras reintentos; no se publica`);
}
