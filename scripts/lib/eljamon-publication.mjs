// Los errores individuales de categoría excluyen solo el producto afectado.
// Recuentos, snapshot y publicación deben usar exactamente las mismas filas.
export function prepareEljamonPublication(products, categories, runStart) {
  const rows = [];
  const excluded = [];
  for (const product of products) {
    if (product.raw?.category_resolution === 'unresolved' || !Array.isArray(product.category_ids) || product.category_ids.length < 2) {
      excluded.push({ id: product.id, display_name: product.display_name, reason: 'unresolved_category' });
    } else rows.push(product);
  }
  const categoryRows = [...categories].map((category) => ({
    ...category,
    product_count: rows.filter((product) => product.category_ids.includes(category.id)).length,
    published: true,
    synced_at: runStart,
  }));
  return { rows, categoryRows, excluded };
}
