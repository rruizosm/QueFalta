/** Bounded, session-only cache. Failed requests are never retained. */
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 180;
const entries = new Map<string, { value: unknown; expires: number }>();
const pending = new Map<string, Promise<unknown>>();
let generation = 0;

// Empty filters and omitted filters describe the same first page.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
      .map(([k, v]) => [k, canonical(v)]));
  }
  return value ?? null;
}

export function catalogRequestKey(resource: string, context: unknown): string {
  return JSON.stringify([resource, canonical(context)]);
}

export function peekCatalogRequest<T>(key: string): T | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (entry.expires <= Date.now()) { entries.delete(key); return undefined; }
  entries.delete(key);
  entries.set(key, entry);
  return entry.value as T;
}

export function seedCatalogRequest<T>(key: string, value: T): T {
  entries.delete(key);
  entries.set(key, { value, expires: Date.now() + TTL_MS });
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  return value;
}

export function cacheCatalogRequest<T>(key: string, load: () => Promise<T>): Promise<T> {
  const cached = peekCatalogRequest<T>(key);
  if (cached !== undefined) return Promise.resolve(cached);
  const inflight = pending.get(key);
  if (inflight) return inflight as Promise<T>;
  const startedGeneration = generation;
  const promise = Promise.resolve().then(load).then((value) => {
    if (generation === startedGeneration) {
      seedCatalogRequest(key, value);
    }
    return value;
  }).finally(() => { if (pending.get(key) === promise) pending.delete(key); });
  pending.set(key, promise);
  return promise;
}

export function clearCatalogRequests(): void {
  generation++;
  entries.clear();
  pending.clear();
}

/** Cancel one reader, while leaving the shared download available to others. */
export function withCatalogRequestSignal<T>(request: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return request;
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      const error = new Error('Cancelled catalog request');
      error.name = 'AbortError';
      reject(error);
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    request.then((value) => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) abort();
      else resolve(value);
    }, (error: unknown) => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
  });
}
