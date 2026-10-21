/** Stable reference proportions: extra shelves extend below, never rescale art. */
export const PANTRY_ASPECT_RATIO = 1065 / 1477;
export const PANTRY_MIN_SIZE = 0.14;
export const PANTRY_DEFAULT_SIZE = 0.28;
export const PANTRY_SHELF_SURFACE_YS = [0.29, 0.56, 0.83] as const;
export const PANTRY_DEFAULT_SHELF_COUNT: number = PANTRY_SHELF_SURFACE_YS.length;
export const PANTRY_SHELF_SPACING_Y = 0.27;
export const PANTRY_SHELF_SURFACE_Y = PANTRY_SHELF_SURFACE_YS[0];
// Leave room below the preceding board and its supports, without shrinking art.
export const PANTRY_SHELF_CLEARANCE_Y = 0.04;
// Keep the entire illustration above the board and inside the canvas.
export const PANTRY_MAX_SIZE = PANTRY_SHELF_SURFACE_Y / PANTRY_ASPECT_RATIO;
export const PANTRY_SHELF_INSET = 0.02;
export const PANTRY_PRODUCT_GAP = 0.012;
// Product art is delivered on a square transparent canvas, but the visible
// packages are much narrower. Use a compact interaction/collision frame so
// transparent pixels do not force neighbouring products apart.
export const PANTRY_PRODUCT_FRAME_RATIO = 0.55;
export const PANTRY_SLOT_COUNT = 5;
export const PANTRY_MAX_QUANTITY = 999;
export const PANTRY_MAX_NOTES_LENGTH = 100;
export const PANTRY_MAX_LOCATION_LENGTH = 60;
export const PANTRY_MAX_SHELF_NAME_LENGTH = 40;

export type PantrySection = 'pantry' | 'fridge';

export interface PantryProduct {
  id: string;
  name: string;
  illustrationUrl: string;
  /** Missing in layouts saved before Lidl support: Mercadona. */
  store?: 'mercadona' | 'lidl';
}

export interface PantryPlacement {
  x: number;
  y: number;
  size: number;
  /** Missing in legacy layouts: those products still belong to the top shelf. */
  shelfIndex?: number;
}

export interface PantryPurchaseProduct {
  product: PantryProduct;
  quantity: number;
}

export interface PantryItem extends PantryPlacement {
  instanceId: string;
  product: PantryProduct;
  /** Legacy entries represent one unit and have no notes. */
  quantity?: number;
  notes?: string;
  /** Optional user-defined place in the kitchen, independent of shelf placement. */
  kitchenLocation?: string;
  /** Optional local-calendar date, formatted YYYY-MM-DD. */
  expiryDate?: string;
}

export function pantryQuantity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(PANTRY_MAX_QUANTITY, Math.trunc(value))) : 1;
}

export function isPantryExpiryDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export interface PantryLayout {
  items: PantryItem[];
  shelfCount: number;
  /** User-defined kitchen locations, independent of the physical shelves. */
  kitchenLocations?: string[];
  /** Optional so existing v1 inventories remain compatible. Keys are shelf indices. */
  shelfLabels?: Record<string, PantryShelfLabel>;
}

function normalizeKitchenLocations(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const locations = value.filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().slice(0, PANTRY_MAX_LOCATION_LENGTH)).filter(Boolean);
  return locations;
}

export interface PantryShelfLabel {
  name: string;
  emoji: string | null;
}

function normalizePantryShelfLabels(value: unknown, shelfCount: number): Record<string, PantryShelfLabel> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, label]) => {
    if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= shelfCount
      || !label || typeof label !== 'object' || typeof label.name !== 'string') return [];
    return [[key, { name: label.name.slice(0, PANTRY_MAX_SHELF_NAME_LENGTH),
      emoji: typeof label.emoji === 'string' && label.emoji.trim() ? label.emoji.trim().slice(0, 32) : null }]];
  }));
}

/** Label edits never normalize or move products. */
export function updatePantryShelfLabel(layout: PantryLayout, index: number, label: PantryShelfLabel | null): PantryLayout {
  if (!Number.isInteger(index) || index < 0 || index >= layout.shelfCount) return layout;
  const labels = { ...layout.shelfLabels };
  if (label) Object.assign(labels, normalizePantryShelfLabels({ [index]: label }, layout.shelfCount));
  else delete labels[index];
  return { ...layout, shelfLabels: labels };
}

export function normalizePantryShelfCount(value: unknown): number {
  'worklet';
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? Math.max(PANTRY_DEFAULT_SHELF_COUNT, value) : PANTRY_DEFAULT_SHELF_COUNT;
}

export function pantryShelfSurfaceY(index: number): number {
  'worklet';
  return PANTRY_SHELF_SURFACE_YS[index] ?? PANTRY_SHELF_SURFACE_YS[2] + (index - 2) * PANTRY_SHELF_SPACING_Y;
}

export function pantryCanvasHeightRatio(shelfCount: number): number {
  return 1 + (normalizePantryShelfCount(shelfCount) - PANTRY_DEFAULT_SHELF_COUNT) * PANTRY_SHELF_SPACING_Y;
}

export function pantryProductWidth(size: number): number {
  'worklet';
  return size * PANTRY_PRODUCT_FRAME_RATIO;
}

export function pantryShelfIndex(placement: PantryPlacement, shelfCount = PANTRY_DEFAULT_SHELF_COUNT): number {
  'worklet';
  return Math.min(shelfCount - 1, Math.max(0,
    Number.isFinite(placement.shelfIndex) ? Math.trunc(placement.shelfIndex!) : 0));
}

/** Snap a dragged product's bottom edge to the nearest shelf. */
export function pantryShelfIndexAtY(surfaceY: number, shelfCount = PANTRY_DEFAULT_SHELF_COUNT): number {
  'worklet';
  let index = 0;
  for (let next = 1; next < shelfCount; next++) {
    if (surfaceY >= (pantryShelfSurfaceY(next - 1) + pantryShelfSurfaceY(next)) / 2) index = next;
  }
  return index;
}

export function clampPantryPlacement(placement: PantryPlacement, shelfCount = PANTRY_DEFAULT_SHELF_COUNT): PantryPlacement {
  'worklet';
  const size = Math.min(PANTRY_MAX_SIZE, Math.max(PANTRY_MIN_SIZE,
    Number.isFinite(placement.size) ? placement.size : PANTRY_DEFAULT_SIZE));
  const x = Number.isFinite(placement.x) ? placement.x : 0.5;
  const halfHeight = size * PANTRY_ASPECT_RATIO / 2;
  const halfWidth = pantryProductWidth(size) / 2;
  const shelfIndex = pantryShelfIndex(placement, shelfCount);
  return {
    size,
    shelfIndex,
    x: Math.min(1 - PANTRY_SHELF_INSET - halfWidth, Math.max(PANTRY_SHELF_INSET + halfWidth, x)),
    // Ignore a dragged or legacy y. Resizing keeps the bottom on the shelf.
    y: pantryShelfSurfaceY(shelfIndex) - halfHeight,
  };
}

export function defaultPantryPlacement(index: number, shelfCount = PANTRY_DEFAULT_SHELF_COUNT): PantryPlacement {
  return pantrySlotPlacement(index % PANTRY_SLOT_COUNT,
    Math.floor(index / PANTRY_SLOT_COUNT) % shelfCount, shelfCount);
}

export function pantrySlotPlacement(index: number, shelfIndex = 0, shelfCount = PANTRY_DEFAULT_SHELF_COUNT): PantryPlacement {
  const slot = Math.min(PANTRY_SLOT_COUNT - 1, Math.max(0, Math.trunc(index)));
  const usableWidth = 1 - PANTRY_SHELF_INSET * 2;
  return clampPantryPlacement({
    x: PANTRY_SHELF_INSET + usableWidth * (slot + 0.5) / PANTRY_SLOT_COUNT,
    y: 0,
    size: PANTRY_DEFAULT_SIZE,
    shelfIndex,
  }, shelfCount);
}

function fitsPantryShelf(placement: PantryPlacement, shelfCount: number): boolean {
  'worklet';
  const index = pantryShelfIndex(placement, shelfCount);
  const ceiling = index === 0 ? 0 : pantryShelfSurfaceY(index - 1) + PANTRY_SHELF_CLEARANCE_Y;
  return placement.y - placement.size * PANTRY_ASPECT_RATIO / 2 >= ceiling - 1e-9;
}

export function isPantryPlacementFree(placement: PantryPlacement, occupied: readonly PantryPlacement[], shelfCount = PANTRY_DEFAULT_SHELF_COUNT): boolean {
  'worklet';
  const desired = clampPantryPlacement(placement, shelfCount);
  const desiredHalfWidth = pantryProductWidth(desired.size) / 2;
  return fitsPantryShelf(desired, shelfCount) && occupied.every((entry) => {
    if (pantryShelfIndex(entry, shelfCount) !== desired.shelfIndex) return true;
    const normalized = clampPantryPlacement(entry, shelfCount);
    const minimumDistance = desiredHalfWidth + pantryProductWidth(normalized.size) / 2 + PANTRY_PRODUCT_GAP;
    return Math.abs(desired.x - normalized.x) >= minimumDistance - 1e-9;
  });
}

/** Fixed add targets that are not covered by the current product frames. */
export function availablePantrySlots(occupied: readonly PantryPlacement[], shelfCount = PANTRY_DEFAULT_SHELF_COUNT): { index: number; placement: PantryPlacement }[] {
  const shelves = groupPantryShelves(occupied, shelfCount);
  return Array.from({ length: shelfCount }, (_, shelfIndex) =>
    Array.from({ length: PANTRY_SLOT_COUNT }, (_, slot) => ({
      index: shelfIndex * PANTRY_SLOT_COUNT + slot, placement: pantrySlotPlacement(slot, shelfIndex, shelfCount),
    }))).flat()
    .filter(({ placement }) => isPantryPlacementFree(placement, shelves.get(placement.shelfIndex!) ?? [], shelfCount));
}

/** Only products on the same shelf can collide. Do not scan the whole pantry per slot/item. */
function groupPantryShelves<T extends PantryPlacement>(items: readonly T[], shelfCount: number): Map<number, T[]> {
  const shelves = new Map<number, T[]>();
  for (const item of items) {
    const index = pantryShelfIndex(item, shelfCount);
    const shelf = shelves.get(index);
    if (shelf) shelf.push(item);
    else shelves.set(index, [item]);
  }
  return shelves;
}

/** Nearest free interval at the requested size; never moves or shrinks a neighbour. */
export function findPantryPlacement(placement: PantryPlacement, occupied: readonly PantryPlacement[], shelfCount = PANTRY_DEFAULT_SHELF_COUNT): PantryPlacement | null {
  'worklet';
  const desired = clampPantryPlacement(placement, shelfCount);
  if (!fitsPantryShelf(desired, shelfCount)) return null;
  const sorted = occupied.filter((entry) => pantryShelfIndex(entry, shelfCount) === desired.shelfIndex)
    .map((entry) => clampPantryPlacement(entry, shelfCount)).sort((a, b) => a.x - b.x);
  let left = PANTRY_SHELF_INSET;
  let bestX: number | null = null;
  let bestDistance = Infinity;
  for (let index = 0; index <= sorted.length; index++) {
    const next = sorted[index];
    const desiredHalfWidth = pantryProductWidth(desired.size) / 2;
    const right = next ? next.x - pantryProductWidth(next.size) / 2 - PANTRY_PRODUCT_GAP : 1 - PANTRY_SHELF_INSET;
    const minX = left + desiredHalfWidth;
    const maxX = right - desiredHalfWidth;
    // Tolerate floating-point roundoff at an exact fit, not visible overlap.
    if (minX <= maxX + 1e-9) {
      const x = Math.max(minX, Math.min(maxX, desired.x));
      const distance = Math.abs(x - desired.x);
      if (distance < bestDistance - 1e-9) { bestX = x; bestDistance = distance; }
    }
    if (next) left = Math.max(left, next.x + pantryProductWidth(next.size) / 2 + PANTRY_PRODUCT_GAP);
  }
  return bestX === null ? null : { ...desired, x: bestX };
}

/** General add/recovery can use another shelf; a drag or explicit slot cannot. */
export function findPantryPlacementOnAnyShelf(placement: PantryPlacement, occupied: readonly PantryPlacement[], shelfCount = PANTRY_DEFAULT_SHELF_COUNT): PantryPlacement | null {
  const preferred = pantryShelfIndex(placement, shelfCount);
  for (let offset = 0; offset < shelfCount; offset++) {
    const shelfIndex = (preferred + offset) % shelfCount;
    const found = findPantryPlacement({ ...placement, shelfIndex }, occupied, shelfCount);
    if (found) return found;
  }
  return null;
}

/** Old overlapping layouts are repaired without dropping an instance or changing its size. */
export function arrangePantryItems(items: readonly PantryItem[], shelfCount = PANTRY_DEFAULT_SHELF_COUNT): { placed: PantryItem[]; unplaced: PantryItem[] } {
  const placed: PantryItem[] = [];
  const pending: PantryItem[] = [];
  const unplaced: PantryItem[] = [];
  const shelves = new Map<number, PantryItem[]>();
  const withPlacement = (item: PantryItem, placement: PantryPlacement): PantryItem =>
    item.x === placement.x && item.y === placement.y && item.size === placement.size
      && item.shelfIndex === placement.shelfIndex ? item : { ...item, ...placement };
  const reserve = (item: PantryItem, placement: PantryPlacement) => {
    const next = withPlacement(item, placement);
    placed.push(next);
    const index = pantryShelfIndex(next, shelfCount);
    const shelf = shelves.get(index);
    if (shelf) shelf.push(next);
    else shelves.set(index, [next]);
  };
  for (const item of items) {
    const placement = findPantryPlacement(item, shelves.get(pantryShelfIndex(item, shelfCount)) ?? [], shelfCount);
    if (placement) reserve(item, placement);
    else pending.push(withPlacement(item, clampPantryPlacement(item, shelfCount)));
  }
  // Reserve existing positions on every shelf before recovering overflow.
  for (const item of pending) {
    const preferred = pantryShelfIndex(item, shelfCount);
    let recovered = false;
    for (let offset = 0; offset < shelfCount; offset++) {
      const shelfIndex = (preferred + offset) % shelfCount;
      const placement = findPantryPlacement({ ...item, shelfIndex }, shelves.get(shelfIndex) ?? [], shelfCount);
      if (placement) { reserve(item, placement); recovered = true; break; }
    }
    if (!recovered) unplaced.push(item);
  }
  return { placed, unplaced };
}

export function normalizePantryItems(items: readonly PantryItem[], shelfCount = PANTRY_DEFAULT_SHELF_COUNT): PantryItem[] {
  const { placed, unplaced } = arrangePantryItems(items, shelfCount);
  // Overflow remains saved and accessible in the screen's recovery list.
  return [...placed, ...unplaced];
}

/** Empty/invalid URLs must never become selectable products or persisted art. */
export function isPantryImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value !== value.trim()) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

export function decodePantryLayout(raw: string | null): PantryLayout {
  if (!raw) return { items: [], shelfCount: PANTRY_DEFAULT_SHELF_COUNT };
  const saved: unknown = JSON.parse(raw);
  if (!saved || typeof saved !== 'object' || !('version' in saved) || saved.version !== 1
    || !('items' in saved) || !Array.isArray(saved.items)) {
    throw new Error('Unsupported pantry layout');
  }
  const shelfCount = normalizePantryShelfCount('shelfCount' in saved ? saved.shelfCount : undefined);
  const seen = new Set<string>();
  const items = normalizePantryItems(saved.items.flatMap((item: unknown): PantryItem[] => {
    if (!item || typeof item !== 'object') return [];
    const value = item as Partial<PantryItem>;
    if (typeof value.instanceId !== 'string' || !value.instanceId || seen.has(value.instanceId)
      || typeof value.product?.id !== 'string'
      || (value.product.store === 'lidl' ? !/^\d+(?:_ES)?$/.test(value.product.id) : !/^\d+$/.test(value.product.id))
      || (value.product.store !== undefined && value.product.store !== 'mercadona' && value.product.store !== 'lidl')
      || typeof value.product.name !== 'string' || !value.product.name.trim()
      || !isPantryImageUrl(value.product.illustrationUrl)
      || ![value.x, value.y, value.size].every((n) => typeof n === 'number' && Number.isFinite(n))) return [];
    seen.add(value.instanceId);
    return [{ instanceId: value.instanceId, product: value.product,
      ...(value.quantity !== undefined ? { quantity: pantryQuantity(value.quantity) } : {}),
      ...(typeof value.notes === 'string' ? { notes: value.notes.slice(0, PANTRY_MAX_NOTES_LENGTH) } : {}),
      ...(typeof value.kitchenLocation === 'string' ? { kitchenLocation: value.kitchenLocation.slice(0, PANTRY_MAX_LOCATION_LENGTH) } : {}),
      ...(isPantryExpiryDate(value.expiryDate) ? { expiryDate: value.expiryDate } : {}),
      ...clampPantryPlacement(value as PantryPlacement, shelfCount) }];
  }), shelfCount);
  const shelfLabels = normalizePantryShelfLabels('shelfLabels' in saved ? saved.shelfLabels : undefined, shelfCount);
  const kitchenLocations = normalizeKitchenLocations('kitchenLocations' in saved ? saved.kitchenLocations : undefined);
  return { items, shelfCount, ...(Object.keys(shelfLabels).length ? { shelfLabels } : {}),
    ...(kitchenLocations ? { kitchenLocations } : {}) };
}

export function encodePantryLayout(layout: PantryLayout): string {
  const shelfCount = normalizePantryShelfCount(layout.shelfCount);
  const shelfLabels = normalizePantryShelfLabels(layout.shelfLabels, shelfCount);
  const kitchenLocations = normalizeKitchenLocations(layout.kitchenLocations);
  return JSON.stringify({ version: 1, shelfCount, items: normalizePantryItems(layout.items, shelfCount),
    ...(Object.keys(shelfLabels).length ? { shelfLabels } : {}),
    ...(kitchenLocations ? { kitchenLocations } : {}) });
}
