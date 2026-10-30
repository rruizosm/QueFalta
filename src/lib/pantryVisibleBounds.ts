/** Normalized bounds within the square used by contentFit="contain". */
export interface PantryVisibleBounds { left: number; top: number; right: number; bottom: number }

/** Plain JS also runs in WebView: Hermes does not preserve Function.toString source. */
export const pantryVisibleBoundsScript = `function (rgba, width, height) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] < 16) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  const side = Math.max(width, height);
  return {
    left: ((side - width) / 2 + left) / side,
    top: ((side - height) / 2 + top) / side,
    right: ((side - width) / 2 + right + 1) / side,
    bottom: ((side - height) / 2 + bottom + 1) / side,
  };
}`;
