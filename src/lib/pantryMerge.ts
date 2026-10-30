import { encodePantryLayout, type PantryItem, type PantryLayout } from './pantryLayout';

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
};
const equal = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const sameLayout = (a: PantryLayout, b: PantryLayout) => equal(JSON.parse(encodePantryLayout(a)), JSON.parse(encodePantryLayout(b)));

/** Rebase only edited fields; deletion wins over edits to a removed instance. */
function mergeFields<T extends object>(before: T, after: T, remote: T): T {
  const result = { ...remote };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof T>) {
    if (equal(before[key], after[key])) continue;
    if (after[key] === undefined) delete result[key];
    else result[key] = after[key];
  }
  return result;
}

export class PantryConflictError extends Error {
  constructor() { super('Pantry shelves changed concurrently'); }
}

/** Structural edits must not reinterpret another member's shelf coordinates. */
export function mergePantryLayout(before: PantryLayout, after: PantryLayout, remote: PantryLayout): PantryLayout {
  if (sameLayout(after, remote)) return remote;
  if ((before.shelfCount !== after.shelfCount && !sameLayout(before, remote))
    || (before.shelfCount !== remote.shelfCount && !sameLayout(before, after))) throw new PantryConflictError();
  const oldItems = new Map(before.items.map(item => [item.instanceId, item]));
  const newItems = new Map(after.items.map(item => [item.instanceId, item]));
  const items: PantryItem[] = remote.items.flatMap(item => {
    const old = oldItems.get(item.instanceId);
    if (!old) return [item];
    const edited = newItems.get(item.instanceId);
    return edited ? [mergeFields(old, edited, item)] : [];
  });
  for (const item of after.items) {
    if (!oldItems.has(item.instanceId) && !items.some(existing => existing.instanceId === item.instanceId)) items.push(item);
  }
  const result = mergeFields(before, after, remote);
  result.items = items;
  result.shelfLabels = mergeFields(before.shelfLabels ?? {}, after.shelfLabels ?? {}, remote.shelfLabels ?? {});
  return result;
}
