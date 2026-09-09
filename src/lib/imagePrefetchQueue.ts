/** One bounded queue across screens; cancellation releases only that caller's work. */
export function createImagePrefetchQueue(load: (uri: string) => Promise<boolean>, concurrency = 2, capacity = 24) {
  const jobs = new Map<string, { owners: Set<symbol>; started: boolean }>();
  const recent = new Map<string, number>();
  let active = 0;
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
        active--;
        jobs.delete(uri);
        pump();
      });
    }
  };
  return (uris: string[]): (() => void) => {
    const owner = Symbol();
    for (const uri of new Set(uris)) {
      if (!uri || (recent.get(uri) ?? 0) > Date.now()) continue;
      const job = jobs.get(uri);
      if (job) job.owners.add(owner);
      else if (jobs.size < capacity) jobs.set(uri, { owners: new Set([owner]), started: false });
    }
    pump();
    return () => {
      for (const [uri, job] of jobs) {
        job.owners.delete(owner);
        if (!job.started && job.owners.size === 0) jobs.delete(uri);
      }
    };
  };
}
