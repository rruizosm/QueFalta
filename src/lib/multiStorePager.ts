import type { BrowseCursor, BrowsePage } from '../api/catalog';

interface StorePageState<T> {
  items: T[];
  index: number;
  cursor: BrowseCursor | null;
  started: boolean;
  done: boolean;
}

export interface MultiStorePager<T> {
  nextPage: (limit: number, signal?: AbortSignal) => Promise<T[]>;
  hasMore: () => boolean;
}

interface MultiStorePagerOptions<T, Store extends string> {
  stores: Store[];
  pageSize?: number;
  loadPage: (
    store: Store,
    cursor: BrowseCursor | null,
    limit: number,
    signal?: AbortSignal,
  ) => Promise<BrowsePage<T>>;
  compare: (a: T, b: T) => number;
}

/**
 * Combina varios catálogos keyset ya ordenados como una sola secuencia.
 * Conserva los sobrantes de cada tienda, por lo que cada llamada devuelve una
 * página global (50 en las pantallas) y nunca 50 filas por supermercado.
 */
export function createMultiStorePager<T, Store extends string>({
  stores,
  pageSize = 50,
  loadPage,
  compare,
}: MultiStorePagerOptions<T, Store>): MultiStorePager<T> {
  const states = new Map<Store, StorePageState<T>>(
    stores.map((store) => [store, {
      items: [],
      index: 0,
      cursor: null,
      started: false,
      done: false,
    }]),
  );

  const fill = async (store: Store, state: StorePageState<T>, signal?: AbortSignal) => {
    while (!state.done && state.index >= state.items.length) {
      if (signal?.aborted) throw new Error('Aborted');
      const page = await loadPage(store, state.started ? state.cursor : null, pageSize, signal);
      state.started = true;
      state.items = page.items;
      state.index = 0;
      state.cursor = page.nextCursor;
      state.done = page.nextCursor == null;
      // Algunos adaptadores pueden descartar filas de una página cruda. Si aún
      // hay cursor, avanza hasta encontrar una fila o alcanzar el final.
      if (state.items.length > 0 || state.done) break;
    }
  };

  const nextPage = async (limit: number, signal?: AbortSignal): Promise<T[]> => {
    const result: T[] = [];

    while (result.length < limit) {
      await Promise.all(
        [...states.entries()]
          .filter(([, state]) => !state.done && state.index >= state.items.length)
          .map(([store, state]) => fill(store, state, signal)),
      );

      let selected: StorePageState<T> | null = null;
      let selectedItem: T | null = null;
      for (const state of states.values()) {
        const item = state.items[state.index];
        if (item == null) continue;
        if (selectedItem == null || compare(item, selectedItem) < 0) {
          selected = state;
          selectedItem = item;
        }
      }

      if (!selected || selectedItem == null) break;
      result.push(selectedItem);
      selected.index += 1;
    }

    return result;
  };

  const hasMore = () =>
    [...states.values()].some((state) => state.index < state.items.length || !state.done);

  return { nextPage, hasMore };
}
