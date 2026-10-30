import type { PantryVisibleBounds } from './pantryVisibleBounds';

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
// The canvas already sits inside the wider board; keep a small inner safety margin.
export const PANTRY_SHELF_INSET = 0.01;
export const PANTRY_PRODUCT_GAP = 0.012;
// Fallback touch frame only. Measured photos use their visible bounds for touch and spacing.
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
  /** Package contents from the catalogue (e.g. 500 g or 1 L), when supplied. */
  metaLabel?: string | null;
  /** Missing in layouts saved before Lidl support: Mercadona. */
  store?: 'mercadona' | 'lidl' | 'bonarea' | 'carrefour';
}

export interface PantryPlacement {
  /** User-positioned shelf coordinates survive normalization and reloads. */
  manualPosition?: true;
  /** Measured within the square image canvas, including contain offsets. */
  visibleBounds?: PantryVisibleBounds;
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
  /** Bounds are valid only for this exact image URL. */
  boundsImageUrl?: string;
  /** Saved overflow waits behind the products already placed on each shelf. */
  pendingPlacement?: boolean;
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

export function pantryLocalDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Calendar days, independent of daylight-saving changes and UTC offsets. */
export function pantryExpiryStatus(expiry: unknown, today = pantryLocalDateKey()): 'soon' | 'expired' | null {
  if (!isPantryExpiryDate(expiry) || !isPantryExpiryDate(today)) return null;
  const days = (Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  return days < 0 ? 'expired' : days <= 3 ? 'soon' : null;
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

/** A sign owns its shelf and all following unsigned shelves, up to the next sign. */
export function pantryShelfGroupIndex(index: number, shelfCount: number,
  labels: Readonly<Record<string, PantryShelfLabel>> = {}): number | null {
  if (!Number.isInteger(index) || index < 0 || index >= shelfCount) return null;
  for (let current = index; current >= 0; current--) {
    if (labels[String(current)]) return current;
  }
  return null;
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

/** Insert below a shelf, keeping its lower neighbours and their signs together. */
export function insertPantryShelfBelow(layout: PantryLayout, index: number): PantryLayout {
  if (!Number.isInteger(index) || index < 0 || index >= layout.shelfCount) return layout;
  const shelfCount = layout.shelfCount + 1;
  const items = layout.items.map(item => {
    const previous = pantryShelfIndex(item, layout.shelfCount);
    return previous > index ? { ...item, shelfIndex: previous + 1,
      y: pantryShelfSurfaceY(previous + 1) - item.size * PANTRY_ASPECT_RATIO / 2 } : item;
  });
  const shelfLabels = layout.shelfLabels && Object.fromEntries(Object.entries(layout.shelfLabels)
    .map(([key, label]) => [Number(key) > index ? Number(key) + 1 : key, label]));
  return { ...layout, shelfCount, items: normalizePantryItems(items, shelfCount),
    ...(shelfLabels ? { shelfLabels } : {}) };
}

/** Every shelf can be removed while keeping at least one shelf in the inventory. */
export function removablePantryShelfIndices(layout: PantryLayout): number[] {
  if (layout.shelfCount <= 1) return [];
  return Array.from({ length: layout.shelfCount }, (_, index) => index);
}

/** Remove the shelf and all its stock, including products awaiting placement. */
export function removePantryShelf(layout: PantryLayout, index: number): PantryLayout {
  if (!Number.isInteger(index) || !removablePantryShelfIndices(layout).includes(index)) return layout;
  const shelfCount = layout.shelfCount - 1;
  const items = layout.items.filter(item => pantryShelfIndex(item, layout.shelfCount) !== index).map(item => {
    const previous = pantryShelfIndex(item, layout.shelfCount);
    return previous > index ? { ...item, shelfIndex: previous - 1,
      y: pantryShelfSurfaceY(previous - 1) - item.size * PANTRY_ASPECT_RATIO / 2 } : item;
  });
  const shelfLabels = layout.shelfLabels && Object.fromEntries(Object.entries(layout.shelfLabels)
    .filter(([key]) => Number(key) !== index)
    .map(([key, label]) => [Number(key) > index ? Number(key) - 1 : key, label]));
  return { ...layout, shelfCount, items: normalizePantryItems(items, shelfCount),
    ...(shelfLabels ? { shelfLabels } : {}) };
}

export function normalizePantryShelfCount(value: unknown): number {
  'worklet';
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value : PANTRY_DEFAULT_SHELF_COUNT;
}

export function pantryShelfSurfaceY(index: number): number {
  'worklet';
  return PANTRY_SHELF_SURFACE_YS[index] ?? PANTRY_SHELF_SURFACE_YS[2] + (index - 2) * PANTRY_SHELF_SPACING_Y;
}

export function pantryCanvasHeightRatio(shelfCount: number): number {
  return 1 + (normalizePantryShelfCount(shelfCount) - PANTRY_DEFAULT_SHELF_COUNT) * PANTRY_SHELF_SPACING_Y;
}

/** Validate persisted/decoder metadata before it reaches geometry or worklets. */
export function normalizePantryVisibleBounds(value: unknown): PantryVisibleBounds | undefined {
  'worklet';
  if (!value || typeof value !== 'object') return undefined;
  const bounds = value as PantryVisibleBounds;
  if (![bounds.left, bounds.top, bounds.right, bounds.bottom].every(entry =>
    typeof entry === 'number' && Number.isFinite(entry) && entry >= 0 && entry <= 1)
    || bounds.left >= bounds.right || bounds.top >= bounds.bottom) return undefined;
  return bounds;
}

/** Unknown photos reserve their whole canvas until measured, also offline. */
export function pantryHorizontalExtents(placement: PantryPlacement): { left: number; right: number } {
  'worklet';
  const bounds = normalizePantryVisibleBounds(placement.visibleBounds);
  return { left: placement.size * (0.5 - (bounds?.left ?? 0)),
    right: placement.size * ((bounds?.right ?? 1) - 0.5) };
}

/** Apply to live matching copies only; do not restore deleted items or stale URLs. */
export function updatePantryImageBounds(items: PantryItem[], url: string, value: PantryVisibleBounds): PantryItem[] {
  const bounds = normalizePantryVisibleBounds(value);
  if (!bounds) return items;
  let changed = false;
  const next = items.map(item => {
    if (item.product.illustrationUrl !== url) return item;
    const previous = item.visibleBounds;
    if (item.boundsImageUrl === url && previous && previous.left === bounds.left && previous.top === bounds.top
      && previous.right === bounds.right && previous.bottom === bounds.bottom) return item;
    changed = true;
    // Keep the previous visible left edge until the row is repacked. A newly
    // revealed transparent margin must not change the product’s relative order.
    const oldExtents = pantryHorizontalExtents({ ...item,
      visibleBounds: item.boundsImageUrl === url ? item.visibleBounds : undefined });
    const newExtents = pantryHorizontalExtents({ ...item, visibleBounds: bounds });
    return { ...item, x: item.x - oldExtents.left + newExtents.left,
      boundsImageUrl: url, visibleBounds: bounds };
  });
  return changed ? next : items;
}

/** New copies can reuse measurements from stock without another download. */
export function pantryProductImageGeometry(product: PantryProduct, items: readonly PantryItem[]):
  Pick<PantryItem, 'visibleBounds' | 'boundsImageUrl'> {
  const source = items.find(item => item.product.illustrationUrl === product.illustrationUrl
    && item.boundsImageUrl === product.illustrationUrl && normalizePantryVisibleBounds(item.visibleBounds));
  return source ? { visibleBounds: source.visibleBounds, boundsImageUrl: source.boundsImageUrl } : {};
}

export function pantryProductWidth(size: number, visibleBounds?: PantryVisibleBounds): number {
  'worklet';
  const bounds = normalizePantryVisibleBounds(visibleBounds);
  return size * (bounds ? bounds.right - bounds.left : PANTRY_PRODUCT_FRAME_RATIO);
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
  const visibleBounds = normalizePantryVisibleBounds(placement.visibleBounds);
  const extents = pantryHorizontalExtents({ size, x, y: 0, visibleBounds });
  const shelfIndex = pantryShelfIndex(placement, shelfCount);
  return {
    size,
    shelfIndex,
    ...(placement.manualPosition === true ? { manualPosition: true as const } : {}),
    ...(visibleBounds ? { visibleBounds } : {}),
    x: Math.min(1 - PANTRY_SHELF_INSET - extents.right, Math.max(PANTRY_SHELF_INSET + extents.left, x)),
    // Ignore a dragged or legacy y. Resizing keeps the bottom on the shelf.
    y: pantryShelfSurfaceY(shelfIndex) - halfHeight,
  };
}

export function defaultPantryPlacement(index: number, shelfCount = PANTRY_DEFAULT_SHELF_COUNT, visibleBounds?: PantryVisibleBounds): PantryPlacement {
  return pantrySlotPlacement(index % PANTRY_SLOT_COUNT,
    Math.floor(index / PANTRY_SLOT_COUNT) % shelfCount, shelfCount, visibleBounds);
}

export function pantrySlotPlacement(index: number, shelfIndex = 0, shelfCount = PANTRY_DEFAULT_SHELF_COUNT, visibleBounds?: PantryVisibleBounds): PantryPlacement {
  const slot = Math.min(PANTRY_SLOT_COUNT - 1, Math.max(0, Math.trunc(index)));
  const usableWidth = 1 - PANTRY_SHELF_INSET * 2;
  return clampPantryPlacement({
    x: PANTRY_SHELF_INSET + usableWidth * (slot + 0.5) / PANTRY_SLOT_COUNT,
    y: 0,
    size: PANTRY_DEFAULT_SIZE,
    visibleBounds,
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
  const desiredExtents = pantryHorizontalExtents(desired);
  return fitsPantryShelf(desired, shelfCount) && occupied.every((entry) => {
    if (pantryShelfIndex(entry, shelfCount) !== desired.shelfIndex) return true;
    const normalized = clampPantryPlacement(entry, shelfCount);
    const other = pantryHorizontalExtents(normalized);
    return desired.x + desiredExtents.right + PANTRY_PRODUCT_GAP <= normalized.x - other.left + 1e-9
      || normalized.x + other.right + PANTRY_PRODUCT_GAP <= desired.x - desiredExtents.left + 1e-9;
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
    .map((entry) => clampPantryPlacement(entry, shelfCount))
    .sort((a, b) => a.x - pantryHorizontalExtents(a).left - (b.x - pantryHorizontalExtents(b).left));
  let left = PANTRY_SHELF_INSET;
  let bestX: number | null = null;
  let bestDistance = Infinity;
  for (let index = 0; index <= sorted.length; index++) {
    const next = sorted[index];
    const extents = pantryHorizontalExtents(desired);
    const right = next ? next.x - pantryHorizontalExtents(next).left - PANTRY_PRODUCT_GAP : 1 - PANTRY_SHELF_INSET;
    const minX = left + extents.left;
    const maxX = right - extents.right;
    // Tolerate floating-point roundoff at an exact fit, not visible overlap.
    if (minX <= maxX + 1e-9) {
      const x = Math.max(minX, Math.min(maxX, desired.x));
      const distance = Math.abs(x - desired.x);
      if (distance < bestDistance - 1e-9) { bestX = x; bestDistance = distance; }
    }
    if (next) left = Math.max(left, next.x + pantryHorizontalExtents(next).right + PANTRY_PRODUCT_GAP);
  }
  return bestX === null ? null : { ...desired, x: bestX };
}

/** Explicit sign selection may use its unsigned continuation, never another group. */
export function findPantryPlacementInGroup(placement: PantryPlacement, occupied: readonly PantryPlacement[],
  groupIndex: number, shelfCount: number, labels: Readonly<Record<string, PantryShelfLabel>> = {}): PantryPlacement | null {
  if (pantryShelfGroupIndex(groupIndex, shelfCount, labels) !== groupIndex) return null;
  for (let index = groupIndex; index < shelfCount; index++) {
    if (index !== groupIndex && labels[String(index)]) break;
    const found = findPantryPlacement({ ...placement, shelfIndex: index }, occupied, shelfCount);
    if (found) return found;
  }
  return null;
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

// Worklet dependencies must be initialized before callers capture their closures.
function nextPackedPantryPlacement(placement: PantryPlacement, left: number, shelfIndex: number,
  shelfCount: number): PantryPlacement | null {
  'worklet';
  const next = clampPantryPlacement({ ...placement, shelfIndex }, shelfCount);
  const extents = pantryHorizontalExtents(next);
  const x = left + extents.left;
  if (!fitsPantryShelf(next, shelfCount) || x + extents.right > 1 - PANTRY_SHELF_INSET + 1e-9) return null;
  return { ...next, x };
}

/** Pack visible edges against the left inset, preserving the supplied order. */
export function compactPantryRow(placements: readonly PantryPlacement[], shelfIndex: number,
  shelfCount = PANTRY_DEFAULT_SHELF_COUNT): PantryPlacement[] | null {
  'worklet';
  const result: PantryPlacement[] = [];
  let left = PANTRY_SHELF_INSET;
  for (const placement of placements) {
    const next = nextPackedPantryPlacement(placement, left, shelfIndex, shelfCount);
    if (!next) return null;
    result.push(next);
    left = next.x + pantryHorizontalExtents(next).right + PANTRY_PRODUCT_GAP;
  }
  return result;
}

/** Keep the aimed x and move only colliding neighbours, respecting visual order. */
function positionPantryRowAroundAnchor(placements: readonly PantryPlacement[], index: number,
  shelfIndex: number, shelfCount: number): PantryPlacement[] | null {
  'worklet';
  const row = placements.map(entry => clampPantryPlacement({ ...entry, shelfIndex, manualPosition: true }, shelfCount));
  if (row.some(entry => !fitsPantryShelf(entry, shelfCount))) return null;
  const anchor = row[index];
  const extents = pantryHorizontalExtents(anchor);
  let minX = PANTRY_SHELF_INSET + extents.left;
  let maxX = 1 - PANTRY_SHELF_INSET - extents.right;
  for (let i = 0; i < index; i++) {
    const other = pantryHorizontalExtents(row[i]);
    minX += other.left + other.right + PANTRY_PRODUCT_GAP;
  }
  for (let i = index + 1; i < row.length; i++) {
    const other = pantryHorizontalExtents(row[i]);
    maxX -= other.left + other.right + PANTRY_PRODUCT_GAP;
  }
  if (minX > maxX + 1e-9) return null;
  anchor.x = Math.max(minX, Math.min(maxX, anchor.x));
  let left = anchor.x - extents.left;
  for (let i = index - 1; i >= 0; i--) {
    const other = pantryHorizontalExtents(row[i]);
    row[i].x = Math.min(row[i].x, left - PANTRY_PRODUCT_GAP - other.right);
    left = row[i].x - other.left;
  }
  let right = anchor.x + extents.right;
  for (let i = index + 1; i < row.length; i++) {
    const other = pantryHorizontalExtents(row[i]);
    row[i].x = Math.max(row[i].x, right + PANTRY_PRODUCT_GAP + other.left);
    right = row[i].x + other.right;
  }
  return row;
}

/** Manual drags preserve spacing; legacy/accessibility ordering can still pack rows. */
export function insertPantryPlacement(positions: Readonly<Record<string, PantryPlacement>>, instanceId: string,
  placement: PantryPlacement, shelfCount = PANTRY_DEFAULT_SHELF_COUNT,
  beforeId?: string | null): Record<string, PantryPlacement> | null {
  'worklet';
  const original = positions[instanceId];
  if (!original) return null;
  const desired = clampPantryPlacement({ ...placement, visibleBounds: original.visibleBounds }, shelfCount);
  const targetShelf = pantryShelfIndex(desired, shelfCount);
  const ids = Object.keys(positions).filter(id => id !== instanceId && pantryShelfIndex(positions[id], shelfCount) === targetShelf)
    .sort((a, b) => positions[a].x - pantryHorizontalExtents(positions[a]).left
      - (positions[b].x - pantryHorizontalExtents(positions[b]).left));
  const extents = pantryHorizontalExtents(desired);
  const visibleCenter = desired.x + (extents.right - extents.left) / 2;
  let index = beforeId === null ? ids.length : beforeId === undefined ? -1 : ids.indexOf(beforeId);
  if (index < 0) {
    index = ids.findIndex(id => {
      const entry = positions[id];
      const other = pantryHorizontalExtents(entry);
      return visibleCenter < entry.x + (other.right - other.left) / 2;
    });
    if (index < 0) index = ids.length;
  }
  ids.splice(index, 0, instanceId);
  const entries = ids.map(id => id === instanceId ? desired : positions[id]);
  const preserveSpacing = desired.manualPosition === true || original.manualPosition === true
    || ids.some(id => positions[id]?.manualPosition === true);
  const target = preserveSpacing
    ? positionPantryRowAroundAnchor(entries, index, targetShelf, shelfCount)
    : compactPantryRow(entries, targetShelf, shelfCount);
  if (!target) return null;
  const result = { ...positions };
  ids.forEach((id, i) => { result[id] = target[i]; });
  const sourceShelf = pantryShelfIndex(original, shelfCount);
  if (sourceShelf !== targetShelf) {
    const sourceIds = Object.keys(positions).filter(id => id !== instanceId && pantryShelfIndex(positions[id], shelfCount) === sourceShelf)
      .sort((a, b) => positions[a].x - pantryHorizontalExtents(positions[a]).left
        - (positions[b].x - pantryHorizontalExtents(positions[b]).left));
    const source = preserveSpacing
      ? sourceIds.map(id => ({ ...positions[id], manualPosition: true as const }))
      : compactPantryRow(sourceIds.map(id => positions[id]), sourceShelf, shelfCount);
    if (!source) return null;
    sourceIds.forEach((id, i) => { result[id] = source[i]; });
  }
  return result;
}

export interface PantryMoveSpace {
  shelfIndex: number;
  left: number;
  right: number;
  placement: PantryPlacement;
}

/** Real empty intervals that fit this photo, excluding the product being held. */
export function pantryMoveSpaces(positions: Readonly<Record<string, PantryPlacement>>, instanceId: string,
  shelfCount: number): PantryMoveSpace[] {
  'worklet';
  const held = positions[instanceId];
  if (!held) return [];
  const result: PantryMoveSpace[] = [];
  for (let shelfIndex = 0; shelfIndex < shelfCount; shelfIndex++) {
    const photo = clampPantryPlacement({ ...held, shelfIndex }, shelfCount);
    if (!fitsPantryShelf(photo, shelfCount)) continue;
    const extents = pantryHorizontalExtents(photo);
    const entries = Object.keys(positions).filter(id => id !== instanceId
      && pantryShelfIndex(positions[id], shelfCount) === shelfIndex)
      .map(id => positions[id]).sort((a, b) => a.x - pantryHorizontalExtents(a).left
        - (b.x - pantryHorizontalExtents(b).left));
    let left = PANTRY_SHELF_INSET;
    for (let index = 0; index <= entries.length; index++) {
      const next = entries[index];
      const right = next ? next.x - pantryHorizontalExtents(next).left - PANTRY_PRODUCT_GAP : 1 - PANTRY_SHELF_INSET;
      if (right - left >= extents.left + extents.right - 1e-9) {
        result.push({ shelfIndex, left, right,
          placement: { ...photo, x: left + extents.left } });
      }
      if (next) left = Math.max(left, next.x + pantryHorizontalExtents(next).right + PANTRY_PRODUCT_GAP);
    }
  }
  return result;
}

/** Accept approximate insertion into a shelf if the complete row still fits. */
export function pantryDropPlacement(positions: Readonly<Record<string, PantryPlacement>>, instanceId: string,
  x: number, surfaceY: number, shelfCount: number, shelfOffsets: readonly number[]): PantryPlacement | null {
  'worklet';
  const held = positions[instanceId];
  if (!held || !Number.isFinite(x) || !Number.isFinite(surfaceY)) return null;
  const firstSurface = pantryShelfSurfaceY(0) + (shelfOffsets[0] ?? 0);
  const lastSurface = pantryShelfSurfaceY(shelfCount - 1) + (shelfOffsets[shelfCount - 1] ?? 0);
  if (surfaceY < firstSurface - PANTRY_SHELF_SPACING_Y / 2
    || surfaceY > lastSurface + PANTRY_SHELF_SPACING_Y / 2) return null;
  let shelfIndex = 0;
  let distance = Infinity;
  for (let index = 0; index < shelfCount; index++) {
    const next = Math.abs(surfaceY - pantryShelfSurfaceY(index) - (shelfOffsets[index] ?? 0));
    if (next < distance) { distance = next; shelfIndex = index; }
  }
  const extents = pantryHorizontalExtents(held);
  const tolerance = 0.04;
  if (x + extents.right < PANTRY_SHELF_INSET - tolerance
    || x - extents.left > 1 - PANTRY_SHELF_INSET + tolerance) return null;
  const desired = clampPantryPlacement({ ...held, x, shelfIndex, manualPosition: true }, shelfCount);
  // The whole row may make room around this insertion, without shrinking art.
  // Preserve the aimed x when valid; adjust only for boundaries or required room.
  return insertPantryPlacement(positions, instanceId, desired, shelfCount) ? desired : null;
}

/** Preserve manually arranged shelves; compact legacy rows and recover overflow. */
export function arrangePantryItems(items: readonly PantryItem[], shelfCount = PANTRY_DEFAULT_SHELF_COUNT): { placed: PantryItem[]; unplaced: PantryItem[] } {
  const placed: PantryItem[] = [];
  const pending: PantryItem[] = [];
  const unplaced: PantryItem[] = [];
  const cursors = new Map<number, number>();
  const manualShelves = new Set(items.filter(item => item.manualPosition === true)
    .map(item => pantryShelfIndex(item, shelfCount)));
  const withPlacement = (item: PantryItem, placement: PantryPlacement, pending = false): PantryItem => {
    const next = item.x === placement.x && item.y === placement.y && item.size === placement.size
      && item.shelfIndex === placement.shelfIndex ? item : { ...item, ...placement };
    if (pending && !next.pendingPlacement) return { ...next, pendingPlacement: true };
    if (!pending && next.pendingPlacement) {
      const { pendingPlacement: _pending, ...placedItem } = next;
      return placedItem;
    }
    return next;
  };
  const ordered = items.map(original => {
    if (original.visibleBounds && (original.boundsImageUrl !== original.product.illustrationUrl
      || !normalizePantryVisibleBounds(original.visibleBounds))) {
      const { visibleBounds: _bounds, boundsImageUrl: _url, ...rest } = original;
      return rest;
    }
    return original;
  }).sort((a, b) => Number(!!a.pendingPlacement) - Number(!!b.pendingPlacement)
    || pantryShelfIndex(a, shelfCount) - pantryShelfIndex(b, shelfCount)
    || a.x - pantryHorizontalExtents(a).left - (b.x - pantryHorizontalExtents(b).left));
  const reserve = (item: PantryItem, placement: PantryPlacement) => {
    placed.push(withPlacement(item, placement));
    const index = pantryShelfIndex(placement, shelfCount);
    cursors.set(index, Math.max(cursors.get(index) ?? PANTRY_SHELF_INSET,
      placement.x + pantryHorizontalExtents(placement).right + PANTRY_PRODUCT_GAP));
  };
  for (const item of ordered) {
    const shelfIndex = pantryShelfIndex(item, shelfCount);
    const placement = manualShelves.has(shelfIndex)
      ? findPantryPlacement(item, placed, shelfCount)
      : nextPackedPantryPlacement(item, cursors.get(shelfIndex) ?? PANTRY_SHELF_INSET, shelfIndex, shelfCount);
    if (placement) reserve(item, placement);
    else pending.push(withPlacement(item, clampPantryPlacement(item, shelfCount), true));
  }
  // Keep existing shelf owners ahead of products recovered from a full shelf.
  for (const item of pending) {
    const preferred = pantryShelfIndex(item, shelfCount);
    let recovered = false;
    for (let offset = 0; offset < shelfCount; offset++) {
      const shelfIndex = (preferred + offset) % shelfCount;
      const placement = manualShelves.has(shelfIndex)
        ? findPantryPlacement({ ...item, shelfIndex }, placed, shelfCount)
        : nextPackedPantryPlacement(item, cursors.get(shelfIndex) ?? PANTRY_SHELF_INSET, shelfIndex, shelfCount);
      if (placement) { reserve(item, placement); recovered = true; break; }
    }
    if (!recovered) unplaced.push(item);
  }
  // Preserve saved/list order; shelf order is represented by the coordinates.
  const inputOrder = new Map(items.map((item, index) => [item.instanceId, index]));
  placed.sort((a, b) => inputOrder.get(a.instanceId)! - inputOrder.get(b.instanceId)!);
  unplaced.sort((a, b) => inputOrder.get(a.instanceId)! - inputOrder.get(b.instanceId)!);
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
  // New inventories start with two shelves; legacy layouts keep their original fallback.
  if (!raw) return { items: [], shelfCount: 2 };
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
      || (value.product.store === 'lidl' ? !/^\d+(?:_ES)?$/.test(value.product.id)
        : value.product.store === 'bonarea' ? !/^\d+\*[A-Za-z0-9]+$/.test(value.product.id)
          : value.product.store === 'carrefour' ? !/^(?:\d+|f?prod\d+|VC\d+A(?:ECOMM)?-\d+)$/.test(value.product.id)
          : !/^\d+$/.test(value.product.id))
      || (value.product.store !== undefined && value.product.store !== 'mercadona' && value.product.store !== 'lidl' && value.product.store !== 'bonarea' && value.product.store !== 'carrefour')
      || typeof value.product.name !== 'string' || !value.product.name.trim()
      || !isPantryImageUrl(value.product.illustrationUrl)
      || ![value.x, value.y, value.size].every((n) => typeof n === 'number' && Number.isFinite(n))) return [];
    seen.add(value.instanceId);
    return [{ instanceId: value.instanceId, product: value.product,
      ...(value.pendingPlacement === true ? { pendingPlacement: true } : {}),
      ...(value.quantity !== undefined ? { quantity: pantryQuantity(value.quantity) } : {}),
      ...(typeof value.notes === 'string' ? { notes: value.notes.slice(0, PANTRY_MAX_NOTES_LENGTH) } : {}),
      ...(typeof value.kitchenLocation === 'string' ? { kitchenLocation: value.kitchenLocation.slice(0, PANTRY_MAX_LOCATION_LENGTH) } : {}),
      ...(isPantryExpiryDate(value.expiryDate) ? { expiryDate: value.expiryDate } : {}),
      ...(value.boundsImageUrl === value.product.illustrationUrl && normalizePantryVisibleBounds(value.visibleBounds)
        ? { boundsImageUrl: value.boundsImageUrl } : {}),
      ...clampPantryPlacement({ ...value as PantryPlacement,
        visibleBounds: value.boundsImageUrl === value.product.illustrationUrl ? value.visibleBounds : undefined }, shelfCount) }];
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
