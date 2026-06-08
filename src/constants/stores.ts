// Agrupado de artículos de la cesta por supermercado.
// La tienda se deduce de los datos del artículo (sin columna en BD): id de
// Mercadona, o el dominio de la imagen. Los manuales caen en "otros".

export type Store = 'mercadona' | 'esclat' | 'otros';

export const STORE_ORDER: Store[] = ['mercadona', 'esclat', 'otros'];

export const STORE_META: Record<Store, { name: string; icon: any }> = {
  mercadona: { name: 'Mercadona', icon: require('../../assets/stores/mercadona.png') },
  esclat: { name: 'BonpreuEsclat', icon: require('../../assets/stores/bonpreuesclat.png') },
  otros: { name: 'Otros', icon: null },
};

type StoreClue = { imageUrl?: string | null; mercadonaProductId?: string | null };

export function storeOfItem(it: StoreClue): Store {
  if (it.imageUrl?.includes('bonpreuesclat')) return 'esclat';
  if (it.mercadonaProductId || it.imageUrl?.includes('mercadona')) return 'mercadona';
  return 'otros';
}

/** Agrupa por tienda en el orden STORE_ORDER, omitiendo las vacías. */
export function groupByStore<T extends StoreClue>(items: T[]): { store: Store; data: T[] }[] {
  return STORE_ORDER
    .map((store) => ({ store, data: items.filter((it) => storeOfItem(it) === store) }))
    .filter((s) => s.data.length > 0);
}
