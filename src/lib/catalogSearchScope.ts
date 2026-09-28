let generation = 0;
const listeners = new Set<() => void>();
export const getCatalogSearchGeneration = () => generation;
export function subscribeCatalogSearch(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function invalidateCatalogSearch(): void {
  generation++;
  listeners.forEach((listener) => listener());
}
export function catalogSearchChanged(): Error {
  return Object.assign(new Error('Catalog search context changed'), {
    name: 'AbortError', code: 'CATALOG_SEARCH_CONTEXT_CHANGED',
  });
}
export function assertCatalogSearchGeneration(expected: number): void {
  if (expected !== generation) throw catalogSearchChanged();
}
