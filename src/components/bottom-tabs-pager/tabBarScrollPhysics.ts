/** Tunable scroll/geometry values; pt/dp, except progress and scale. */
export const TAB_BAR_SCROLL = {
  fullHeight: 64,
  compactHeight: 62,
  compactScale: 0.94,
  compactContentScale: 0.90 / 0.94,
  compactTranslateY: 4,
  downDeadZone: 18,
  upDeadZone: 10,
  compactDistance: 100,
  minTouchTarget: 44,
  reducedMotionMs: 180,
  spring: { mass: 0.9, damping: 20, stiffness: 220, overshootClamping: true },
} as const;

export function tabBarTopReduction(progress: number): number {
  'worklet';
  const p = Math.max(0, Math.min(1, progress));
  const height = TAB_BAR_SCROLL.fullHeight + (TAB_BAR_SCROLL.compactHeight - TAB_BAR_SCROLL.fullHeight) * p;
  const scale = 1 + (TAB_BAR_SCROLL.compactScale - 1) * p;
  return TAB_BAR_SCROLL.fullHeight - height * (1 + scale) / 2 + TAB_BAR_SCROLL.compactTranslateY * p;
}

export type ScrollIntent = {
  lastY: number;
  anchor: number;
  extremum: number;
  direction: number;
  baseProgress: number;
  expanded: boolean;
};

export function beginScrollIntent(y: number, progress: number): ScrollIntent {
  'worklet';
  return { lastY: y, anchor: y, extremum: y, direction: 0, baseProgress: progress, expanded: false };
}

/** Extremum-based hysteresis accumulates slow intent but rejects alternating jitter. */
export function advanceScrollIntent(state: ScrollIntent, y: number, progress: number) {
  'worklet';
  const delta = y - state.lastY;
  if (delta === 0) return { progress, expand: false };
  if (state.direction === 0) state.direction = delta > 0 ? 1 : -1;
  state.lastY = y;
  if (state.direction < 0) {
    state.extremum = Math.min(state.extremum, y);
    if (y - state.extremum >= TAB_BAR_SCROLL.downDeadZone) {
      state.direction = 1;
      state.anchor = state.extremum;
      state.extremum = y;
      state.baseProgress = progress;
      state.expanded = false;
    } else {
      const expand = !state.expanded && state.anchor - y >= TAB_BAR_SCROLL.upDeadZone;
      if (expand) state.expanded = true;
      return { progress, expand };
    }
  } else {
    state.extremum = Math.max(state.extremum, y);
    if (state.extremum - y >= TAB_BAR_SCROLL.upDeadZone) {
      state.direction = -1;
      state.anchor = state.extremum;
      state.extremum = y;
      state.baseProgress = progress;
      state.expanded = true;
      return { progress, expand: true };
    }
  }
  const distance = Math.max(0, y - state.anchor - TAB_BAR_SCROLL.downDeadZone);
  return { progress: distance > 0 ? Math.max(0, Math.min(1, state.baseProgress + distance / TAB_BAR_SCROLL.compactDistance)) : progress, expand: false };
}
