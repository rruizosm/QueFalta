/** Bounded, short-lived memory cache. Instantiate separately for each account/day/group. */
export class WordRankingCache<T> {
  private values = new Map<string, { value: T; expires: number }>();
  private pending = new Map<string, Promise<T>>();
  private generation = 0;
  private running = 0;
  private queue: (() => void)[] = [];
  private controllers = new Set<AbortController>();
  constructor(private now = () => performance.now(), private limit = 12, private ttl = 60_000) {}

  peek(key: string, allowStale = false): T | null {
    const entry = this.values.get(key);
    if (!entry) return null;
    const age = this.now() - entry.expires;
    if (age >= 240_000) { this.values.delete(key); return null; }
    if (age >= 0 && !allowStale) return null;
    return entry.value;
  }

  get(key: string, fetch: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const cached = this.peek(key);
    if (cached !== null) return Promise.resolve(cached);
    const existing = this.pending.get(key);
    if (existing) return existing;
    if (this.pending.size >= this.limit) return Promise.reject(new Error('WORD_CACHE_BUSY'));
    const generation = this.generation;
    const scheduled = new Promise<T>((resolve, reject) => {
      const run = () => {
        if (generation !== this.generation) { reject(new Error('WORD_CACHE_INVALIDATED')); return; }
        this.running++;
        const controller = new AbortController();
        this.controllers.add(controller);
        Promise.resolve().then(() => fetch(controller.signal)).then(resolve, reject).finally(() => {
          this.controllers.delete(controller); this.running--; this.pump();
        });
      };
      this.queue.push(run);
      this.pump();
    });
    const request = scheduled.then((value) => {
      if (generation !== this.generation) throw new Error('WORD_CACHE_INVALIDATED');
      this.values.delete(key);
      this.values.set(key, { value, expires: this.now() + this.ttl });
      while (this.values.size > this.limit) this.values.delete(this.values.keys().next().value!);
      return value;
    }).catch((error) => {
      if (generation !== this.generation) throw new Error('WORD_CACHE_INVALIDATED');
      throw error;
    }).finally(() => { if (this.pending.get(key) === request) this.pending.delete(key); });
    this.pending.set(key, request);
    return request;
  }

  private pump() {
    while (this.running < 2 && this.queue.length) this.queue.shift()!();
  }

  clear() {
    this.generation++;
    this.controllers.forEach((controller) => controller.abort());
    this.values.clear();
    this.pending.clear();
    this.pump();
  }
}
