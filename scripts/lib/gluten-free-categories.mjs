// IDs del catálogo del supermercado, no IDs generados en Supabase.
// Las ramas mixtas «Pasta integral y sin gluten» / «Pasta sin Gluten e
// Integral» también contienen pasta con gluten y no certifican su ausencia.
export const GLUTEN_FREE_CATEGORY_IDS = Object.freeze({
  ahorramas: [
    'alimentacion/galletas-cereales-y-barritas/galletas/galletas-sin-gluten',
    'alimentacion/galletas-cereales-y-barritas/cereales/cereales-sin-gluten',
    'alimentacion/harina-levadura-y-preparados/harina/harina-sin-gluten',
  ],
  bm: ['4110'],
  consum: ['2717', '5016', '5338'],
  eroski: ['5000385', '2060143', '2060863', '2059795'],
  caprabo: ['5000385', '2060143', '2060863', '2059795'],
});

export function isGlutenFreeCategory(store, categoryIds) {
  const roots = GLUTEN_FREE_CATEGORY_IDS[store] ?? [];
  return Array.isArray(categoryIds) && categoryIds.some((value) => {
    const id = String(value ?? '');
    return roots.some((root) => id === root || (store === 'ahorramas' && id.startsWith(`${root}/`)));
  });
}
