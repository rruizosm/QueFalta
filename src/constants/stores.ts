// ─── Catálogo: supermercados que el usuario puede ver/activar ────────────────
// Fuente ÚNICA del switcher del catálogo, de la preferencia de perfil
// "Supermercados" y del agrupado de Lista/Cesta por tienda (de aquí salen los
// nombres e iconos). Para añadir una tienda: súmala aquí, al tipo y a storeOfItem.
export type CatalogStore = 'mercadona' | 'esclat' | 'carrefour' | 'bonarea';

/** Metadatos (nombre + icono) en orden de aparición. */
export const CATALOG_STORES: { key: CatalogStore; name: string; icon: number | null }[] = [
  { key: 'mercadona', name: 'Mercadona',     icon: require('../../assets/stores/mercadona.png') },
  { key: 'esclat',    name: 'BonpreuEsclat', icon: require('../../assets/stores/bonpreuesclat.png') },
  { key: 'carrefour', name: 'Carrefour',     icon: require('../../assets/stores/carrefour.png') },
  { key: 'bonarea',   name: 'bonÀrea',       icon: require('../../assets/stores/bonarea.png') },
];

/** Orden canónico de las claves (para normalizar/ordenar selecciones). */
export const CATALOG_STORE_KEYS: CatalogStore[] = CATALOG_STORES.map((s) => s.key);

// ─── Agrupado de Lista/Cesta por supermercado ────────────────────────────────
// La tienda se deduce de los datos del artículo (sin columna en BD): id de
// Mercadona, o el dominio de la imagen. Los manuales caen en "otros".
export type Store = CatalogStore | 'otros';

export const STORE_ORDER: Store[] = [...CATALOG_STORE_KEYS, 'otros'];

export const STORE_META: Record<Store, { name: string; icon: any }> = {
  ...Object.fromEntries(CATALOG_STORES.map((s) => [s.key, { name: s.name, icon: s.icon }])),
  otros: { name: 'Otros', icon: null },
} as Record<Store, { name: string; icon: any }>;

type StoreClue = { imageUrl?: string | null; mercadonaProductId?: string | null };

// Dominio de la miniatura guardada en list_items: bonpreuesclat.cat, mercadona.es,
// carrefour.es, bonarea.com. Mercadona también se reconoce por su id de producto.
export function storeOfItem(it: StoreClue): Store {
  const url = it.imageUrl ?? '';
  if (url.includes('bonpreuesclat')) return 'esclat';
  if (it.mercadonaProductId || url.includes('mercadona')) return 'mercadona';
  if (url.includes('carrefour')) return 'carrefour';
  if (url.includes('bonarea')) return 'bonarea';
  return 'otros';
}

/** Agrupa por tienda en el orden STORE_ORDER, omitiendo las vacías. */
export function groupByStore<T extends StoreClue>(items: T[]): { store: Store; data: T[] }[] {
  return STORE_ORDER
    .map((store) => ({ store, data: items.filter((it) => storeOfItem(it) === store) }))
    .filter((s) => s.data.length > 0);
}
