// Un barrido parcial puede superar el mínimo absoluto y despublicar la mayor
// parte del catálogo. Comparamos con el último catálogo conocido antes de escribir.
export function assertAldiSyncIntegrity({ products, categories, roots, leaves, failedPages, previousProducts, previousCategories, minProducts }) {
  if (failedPages.length) {
    const sample = failedPages.slice(0, 5).map(({ path, reason }) => `${path}: ${reason}`).join('; ');
    throw new Error(`${failedPages.length} páginas Aldi sin datos (${sample}); abortado sin escribir`);
  }
  if (!roots || !leaves || products < minProducts) {
    throw new Error(`barrido Aldi incompleto: ${roots} secciones, ${leaves} hojas, ${products} productos; abortado sin escribir`);
  }
  if (previousProducts > 0 && products < previousProducts * 0.8) {
    throw new Error(`Aldi cayó de ${previousProducts} a ${products} productos (>20 %); abortado sin escribir`);
  }
  if (previousCategories > 0 && categories < previousCategories * 0.8) {
    throw new Error(`Aldi cayó de ${previousCategories} a ${categories} categorías (>20 %); abortado sin escribir`);
  }
}

// Redirecciones estacionales verificadas el 20-10-2026. No ignorar toda la
// rama verano ni errores genéricos: exigir que el destino siga en el barrido.
const SEASONAL_ALIASES = new Map([
  ['/productos/verano/bebidas-alcoholicas-verano', '/productos/bebidas-alcoholicas'],
  ['/productos/verano/cremas-solares', '/productos/cuidado-personal/proteccion-solar'],
  ['/productos/verano/platos-preparados-y-snacks', '/productos/platos-preparados-y-pizza'],
  ['/productos/verano/bebidas', '/productos/bebidas'],
]);

export function resolveAldiSeasonalAliases({ roots, leaves }) {
  const coverage = new Set([...roots, ...leaves]);
  const aliases = [];
  const canonicalLeaves = leaves.filter((leaf) => {
    const target = SEASONAL_ALIASES.get(leaf);
    if (!target) return true;
    if (!coverage.has(target)) {
      throw new Error(`alias Aldi ${leaf} sin destino ${target} en el barrido; abortado sin escribir`);
    }
    aliases.push({ path: leaf, target });
    return false;
  });
  return { leaves: canonicalLeaves, aliases };
}
