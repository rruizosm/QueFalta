import type { CommunityRecipe } from '../api/recipes';

export type RecipeFeedSnapshot = {
  recipes: CommunityRecipe[] | null;
  updatedAt: number;
  loading: boolean;
  error: boolean;
};
type StoredFeed = Pick<RecipeFeedSnapshot, 'recipes' | 'updatedAt'>;
type Dependencies = {
  load: (userId: string) => Promise<CommunityRecipe[]>;
  peek: (userId: string) => unknown;
  read: (userId: string) => Promise<unknown>;
  write: (userId: string, snapshot: StoredFeed) => void;
  now?: () => number;
};
type Entry = {
  snapshot: RecipeFeedSnapshot;
  listeners: Set<() => void>;
  revision: number;
  mutations: number;
  request?: Promise<void>;
};
const EMPTY: RecipeFeedSnapshot = { recipes: null, updatedAt: 0, loading: false, error: false };
const FRESH_MS = 60_000;
const MAX_AGE_MS = 24 * 60 * 60_000;

/** Per-account snapshots; a refresh never blanks content or overwrites newer edits. */
export function createRecipeFeedCache(deps: Dependencies) {
  const entries = new Map<string, Entry>();
  const now = deps.now ?? Date.now;
  const stored = (value: unknown): StoredFeed | null => {
    if (!value || typeof value !== 'object') return null;
    const { recipes, updatedAt } = value as StoredFeed;
    if (!Number.isFinite(updatedAt) || now() - updatedAt > MAX_AGE_MS || updatedAt > now()
      || !Array.isArray(recipes) || recipes.length > 50) return null;
    if (!recipes.every((r) => r && typeof r.id === 'string' && typeof r.title === 'string'
      && typeof r.imageUrl === 'string' && r.author && typeof r.author.name === 'string'
      && Array.isArray(r.ingredients) && Array.isArray(r.steps))) return null;
    return { recipes, updatedAt };
  };
  const entry = (userId: string) => {
    let found = entries.get(userId);
    if (!found) {
      const cached = stored(deps.peek(userId));
      found = { snapshot: { ...EMPTY, ...cached }, listeners: new Set(), revision: 0, mutations: 0 };
      entries.set(userId, found);
    }
    return found;
  };
  const publish = (item: Entry, snapshot: RecipeFeedSnapshot) => {
    item.snapshot = snapshot;
    item.listeners.forEach((listener) => listener());
  };
  const snapshot = (userId: string) => userId ? entry(userId).snapshot : EMPTY;
  const refresh = (userId: string, force = false): Promise<void> => {
    if (!userId) return Promise.resolve();
    const item = entry(userId);
    if (item.mutations > 0) return Promise.resolve();
    if (item.request) return item.request;
    if (!force && item.snapshot.recipes !== null && item.snapshot.updatedAt > 0
      && now() - item.snapshot.updatedAt < FRESH_MS) return Promise.resolve();
    const revision = item.revision;
    publish(item, { ...item.snapshot, loading: item.snapshot.recipes === null, error: false });
    // Read disk and request the network concurrently. The first useful snapshot wins the screen.
    void deps.read(userId).then((value) => {
      if (item.revision !== revision || item.snapshot.recipes !== null) return;
      const cached = stored(value);
      if (cached) publish(item, { ...item.snapshot, ...cached, loading: false });
    }).catch(() => {});
    const request = Promise.resolve().then(() => deps.load(userId)).then((recipes) => {
      if (item.revision !== revision) return;
      const next = { recipes, updatedAt: now(), loading: false, error: false };
      deps.write(userId, next);
      publish(item, next);
    }).catch(() => {
      if (item.revision === revision) publish(item, { ...item.snapshot, loading: false, error: true });
    }).finally(() => {
      if (item.request === request) item.request = undefined;
    });
    item.request = request;
    return request;
  };

  return {
    snapshot,
    refresh,
    subscribe(userId: string, listener: () => void) {
      if (!userId) return () => {};
      const item = entry(userId);
      item.listeners.add(listener);
      return () => { item.listeners.delete(listener); };
    },
    update(userId: string, update: (recipes: CommunityRecipe[]) => CommunityRecipe[]) {
      if (!userId) return;
      const item = entry(userId);
      item.revision++;
      const next = { ...item.snapshot, recipes: update(item.snapshot.recipes ?? []).slice(0, 50), loading: false };
      // Preserve the last fetch time; editing a recipe does not make the rest of the feed fresh.
      deps.write(userId, { ...next, updatedAt: next.updatedAt || now() });
      publish(item, next);
    },
    beginMutation(userId: string) {
      const item = entry(userId);
      item.revision++;
      item.mutations++;
      let finished = false;
      return () => {
        if (finished) return;
        finished = true;
        item.mutations--;
        item.revision++;
      };
    },
  };
}
