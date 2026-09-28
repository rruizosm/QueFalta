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
