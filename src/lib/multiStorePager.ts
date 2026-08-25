import type { BrowseCursor } from '../api/catalog';

interface StorePageState<T, Cursor> {
  items: T[];
  index: number;
  cursor: Cursor | null;
  started: boolean;
  done: boolean;
}

const abortedError = () => {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
};

export interface MultiStorePager<T> {
  nextPage: (limit: number, signal?: AbortSignal) => Promise<T[]>;
  hasMore: () => boolean;
}

interface MultiStorePagerOptions<T, Store extends string, Cursor> {
  stores: Store[];
  pageSize?: number;
  loadPage: (
    store: Store,
    cursor: Cursor | null,
    limit: number,
    signal?: AbortSignal,
  ) => Promise<{ items: T[]; nextCursor: Cursor | null }>;
  compare: (a: T, b: T) => number;
}

/**
 * Combina varios catálogos keyset ya ordenados como una sola secuencia.
 * Conserva los sobrantes de cada tienda, por lo que cada llamada devuelve una
 * página global (50 en las pantallas) y nunca 50 filas por supermercado.
 */
export function createMultiStorePager<T, Store extends string, Cursor = BrowseCursor>({
  stores,
  pageSize = 50,
  loadPage,
  compare,
}: MultiStorePagerOptions<T, Store, Cursor>): MultiStorePager<T> {
  const states = new Map<Store, StorePageState<T, Cursor>>(
    stores.map((store) => [store, {
      items: [],
      index: 0,
      cursor: null,
      started: false,
      done: false,
    }]),
  );

  const fill = async (store: Store, state: StorePageState<T, Cursor>, signal?: AbortSignal) => {
    while (!state.done && state.index >= state.items.length) {
      if (signal?.aborted) throw abortedError();
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
      const pending = [...states.entries()]
        .filter(([, state]) => !state.done && state.index >= state.items.length);
      const settled = await Promise.allSettled(
        pending.map(([store, state]) => fill(store, state, signal)),
      );
      if (signal?.aborted) throw abortedError();

      const failures: unknown[] = [];
      settled.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') return;
        const [, state] = pending[index];
        // Un súper caído no invalida las páginas ya disponibles de los demás y
        // tampoco se reintenta en bucle durante esta sesión del paginador.
        state.done = true;
        failures.push(outcome.reason);
      });
      const hasBufferedItems = [...states.values()]
        .some((state) => state.index < state.items.length);
      if (
        pending.length > 0
        && failures.length === pending.length
        && result.length === 0
        && !hasBufferedItems
      ) {
        throw failures[0];
      }

      let selected: StorePageState<T, Cursor> | null = null;
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
