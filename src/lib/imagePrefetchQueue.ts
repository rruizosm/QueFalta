export interface ImagePrefetchHandle {
  cancel: () => void;
  /** Resolves when this caller's accepted images have finished (successfully or not). */
  ready: Promise<void>;
}

/** One bounded queue across screens; cancellation releases only that caller's work. */
export function createImagePrefetchQueue(load: (uri: string) => Promise<boolean>, concurrency = 2, capacity = 24) {
  const jobs = new Map<string, { owners: Set<symbol>; started: boolean }>();
  const requests = new Map<symbol, { pending: Set<string>; resolve: () => void }>();
  const recent = new Map<string, number>();
  let active = 0;

  const finishRequest = (owner: symbol) => {
    const request = requests.get(owner);
    if (!request || request.pending.size > 0) return;
    requests.delete(owner);
    request.resolve();
  };

  const pump = () => {
    for (const [uri, job] of jobs) {
      if (active >= concurrency) break;
      if (job.started) continue;
      job.started = true;
      active++;
      void Promise.resolve().then(() => load(uri)).then((success) => {
        if (success) {
          recent.delete(uri);
          recent.set(uri, Date.now() + 300000);
          while (recent.size > 128) recent.delete(recent.keys().next().value!);
        }
      }).catch(() => {}).finally(() => {
        for (const owner of job.owners) {
          const request = requests.get(owner);
          request?.pending.delete(uri);
          finishRequest(owner);
        }
        active--;
        jobs.delete(uri);
        pump();
      });
    }
  };

  return (uris: string[]): ImagePrefetchHandle => {
    const owner = Symbol();
    const pending = new Set<string>();
    let resolveReady!: () => void;
    const ready = new Promise<void>((resolve) => { resolveReady = resolve; });

    for (const uri of new Set(uris)) {
      if (!uri || (recent.get(uri) ?? 0) > Date.now()) continue;
      const job = jobs.get(uri);
      if (job) {
        job.owners.add(owner);
        pending.add(uri);
      } else if (jobs.size < capacity) {
        jobs.set(uri, { owners: new Set([owner]), started: false });
        pending.add(uri);
      }
    }

    if (pending.size > 0) requests.set(owner, { pending, resolve: resolveReady });
    else resolveReady();
    pump();

    let cancelled = false;
    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      for (const [uri, job] of jobs) {
        job.owners.delete(owner);
        if (!job.started && job.owners.size === 0) jobs.delete(uri);
      }
      const request = requests.get(owner);
      if (request) {
        request.pending.clear();
        finishRequest(owner);
      }
      pump();
    };

    return { cancel, ready };
  };
}
