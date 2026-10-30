/**
 * Agrupación de la lista por las categorías propias del supermercado.
 * Algunas fuentes guardan la ruta completa N1 › N2; la cesta usa su hoja N2.
 * No se infiere una categoría por palabras clave ni por el nombre del producto.
 */
export interface ShopZone {
  key: string;
  label: string;
  emoji: string;
}

export const OTHER_ZONE: ShopZone = { key: 'otros', label: 'Otros', emoji: '🛒' };

export function categoryOfItem(categoryName: string | null | undefined): ShopZone {
  const path = (categoryName ?? '').split(/\s*(?:->|›|→)\s*/).filter(Boolean);
  const label = path.at(-1)?.trim();
  if (!label) return OTHER_ZONE;

  return {
    key: label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es'),
    label,
    emoji: '🛒',
  };
}

/** Agrupa por subcategoría del retailer, en orden alfabético, con Otros al final. */
export function groupByZone<T extends { categoryName: string | null }>(
  items: T[],
): { zone: ShopZone; data: T[] }[] {
  const groups = new Map<string, { zone: ShopZone; data: T[] }>();
  for (const item of items) {
    const zone = categoryOfItem(item.categoryName);
    const group = groups.get(zone.key);
    if (group) group.data.push(item);
    else groups.set(zone.key, { zone, data: [item] });
  }
  return [...groups.values()].sort((a, b) => {
    if (a.zone.key === OTHER_ZONE.key) return 1;
    if (b.zone.key === OTHER_ZONE.key) return -1;
    return a.zone.label.localeCompare(b.zone.label, 'es');
  });
}

/** Artículos pendientes primero y alfabéticos dentro de cada subcategoría. */
export function sortZoneItems<T extends { productName: string; inCart: boolean }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => Number(a.inCart) - Number(b.inCart) || a.productName.localeCompare(b.productName, 'es'),
  );
}
