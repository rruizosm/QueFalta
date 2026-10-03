// Random identifiers for deduplication, never credentials or device identifiers.
export function sponsorEventId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

export function visibleBannerFraction(x: number, y: number, width: number, height: number,
  viewportWidth: number, top: number, bottom: number): number {
  if (![x,y,width,height,viewportWidth,top,bottom].every(Number.isFinite) || width<=0 || height<=0) return 0;
  const w = Math.max(0, Math.min(x+width, viewportWidth)-Math.max(x,0));
  const h = Math.max(0, Math.min(y+height, bottom)-Math.max(y,top));
  return w*h/(width*height);
}

/** Sampled dwell: gaps >400ms reset the clock (e.g. suspended JS). */
export function createBannerDwell() {
  let since: number | null = null;
  let previous: number | null = null;
  return {
    reset() { since=null; previous=null; },
    sample(fraction: number, now: number) {
      if (fraction < 0.5 || !Number.isFinite(fraction)) { since=null; previous=null; return false; }
      if (previous === null || now-previous>400 || now<previous) since=now;
      previous=now;
      return since !== null && now-since>=1000;
    },
  };
}
