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

export interface PantryProduct {
  id: string;
  name: string;
  illustrationUrl: string;
}

export interface PantryPlacement {
  x: number;
  y: number;
  size: number;
  /** Missing in legacy layouts: those products still belong to the top shelf. */
  shelfIndex?: number;
}

export interface PantryItem extends PantryPlacement {
  instanceId: string;
  product: PantryProduct;
}

export interface PantryLayout {
  items: PantryItem[];
  shelfCount: number;
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
  return fitsPantryShelf(desired, shelfCount) && occupied.map((entry) => clampPantryPlacement(entry, shelfCount)).every((entry) => {
    if (pantryShelfIndex(entry, shelfCount) !== pantryShelfIndex(desired, shelfCount)) return true;
    const minimumDistance = desiredHalfWidth + pantryProductWidth(entry.size) / 2 + PANTRY_PRODUCT_GAP;
    return Math.abs(desired.x - entry.x) >= minimumDistance - 1e-9;
  });
}

/** Fixed add targets that are not covered by the current product frames. */
export function availablePantrySlots(occupied: readonly PantryPlacement[], shelfCount = PANTRY_DEFAULT_SHELF_COUNT): { index: number; placement: PantryPlacement }[] {
  return Array.from({ length: shelfCount }, (_, shelfIndex) =>
    Array.from({ length: PANTRY_SLOT_COUNT }, (_, slot) => ({
      index: shelfIndex * PANTRY_SLOT_COUNT + slot, placement: pantrySlotPlacement(slot, shelfIndex, shelfCount),
    }))).flat()
    .filter(({ placement }) => isPantryPlacementFree(placement, occupied, shelfCount));
}

/** Nearest free interval at the requested size; never moves or shrinks a neighbour. */
export function findPantryPlacement(placement: PantryPlacement, occupied: readonly PantryPlacement[], shelfCount = PANTRY_DEFAULT_SHELF_COUNT): PantryPlacement | null {
  'worklet';
  const desired = clampPantryPlacement(placement, shelfCount);
  if (!fitsPantryShelf(desired, shelfCount)) return null;
  const sorted = occupied.map((entry) => clampPantryPlacement(entry, shelfCount))
    .filter((entry) => pantryShelfIndex(entry, shelfCount) === pantryShelfIndex(desired, shelfCount)).sort((a, b) => a.x - b.x);
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
  for (const item of items) {
    const placement = findPantryPlacement(item, placed, shelfCount);
    if (placement) placed.push({ ...item, ...placement });
    else pending.push({ ...item, ...clampPantryPlacement(item, shelfCount) });
  }
  // Reserve existing positions on every shelf before recovering overflow.
  for (const item of pending) {
    const placement = findPantryPlacementOnAnyShelf(item, placed, shelfCount);
    if (placement) placed.push({ ...item, ...placement });
    else unplaced.push(item);
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
      || typeof value.product?.id !== 'string' || !/^\d+$/.test(value.product.id)
      || typeof value.product.name !== 'string' || !value.product.name.trim()
      || !isPantryImageUrl(value.product.illustrationUrl)
      || ![value.x, value.y, value.size].every((n) => typeof n === 'number' && Number.isFinite(n))) return [];
    seen.add(value.instanceId);
    return [{ instanceId: value.instanceId, product: value.product, ...clampPantryPlacement(value as PantryPlacement, shelfCount) }];
  }), shelfCount);
  return { items, shelfCount };
}

export function encodePantryLayout(layout: PantryLayout): string {
  const shelfCount = normalizePantryShelfCount(layout.shelfCount);
  return JSON.stringify({ version: 1, shelfCount, items: normalizePantryItems(layout.items, shelfCount) });
}
