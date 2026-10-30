import type { PantryItem } from './pantryLayout';

/** Merge into live stock, never restore a stale snapshot over an edit or deletion. */
export function refreshPantryItemImages(
  items: PantryItem[], requested: readonly PantryItem[], urls: ReadonlyMap<string, string>,
  contents: ReadonlyMap<string, string | null> = new Map(),
): PantryItem[] {
  const originals = new Map(requested.map((item) => [item.instanceId, item.product]));
  let changed = false;
  const next = items.map((item) => {
    const original = originals.get(item.instanceId);
    const store = item.product.store ?? 'mercadona';
    if (!original || original.id !== item.product.id || (original.store ?? 'mercadona') !== store
      || original.illustrationUrl !== item.product.illustrationUrl) return item;
    const url = urls.get(`${store}:${item.product.id}`);
    const key = `${store}:${item.product.id}`;
    const metaLabel = contents.has(key) && original.metaLabel === item.product.metaLabel
      ? contents.get(key) : item.product.metaLabel;
    const imageChanged = !!url && url !== item.product.illustrationUrl;
    if (!imageChanged && metaLabel === item.product.metaLabel) return item;
    changed = true;
    const product = { ...item.product,
      ...(metaLabel !== item.product.metaLabel ? { metaLabel } : {}),
      illustrationUrl: url ?? item.product.illustrationUrl };
    if (!imageChanged) return { ...item, product };
    const { visibleBounds: _bounds, boundsImageUrl: _url, ...rest } = item;
    const x = item.visibleBounds && item.boundsImageUrl === original.illustrationUrl
      ? item.x + item.size * item.visibleBounds.left : item.x;
    return { ...rest, x, product };
  });
  return changed ? next : items;
}
