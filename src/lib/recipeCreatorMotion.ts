import type { View } from 'react-native';
import type { RecipeButtonBounds } from '../context/RecipeCreatorContext';

export function measureRecipeButton(view: View | null): Promise<RecipeButtonBounds | null> {
  if (!view) return Promise.resolve(null);
  return new Promise((resolve) => {
    // A native node can disappear before its measure callback is delivered.
    const timeout = setTimeout(() => resolve(null), 100);
    view.measureInWindow((x, y, width, height) => {
      clearTimeout(timeout);
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  });
}

export function recipeLocalOrigin(button: RecipeButtonBounds | null, root: RecipeButtonBounds | null) {
  if (!button || !root) return null;
  const bounds = { ...button, x: button.x - root.x, y: button.y - root.y };
  return Object.values(bounds).every(Number.isFinite) && bounds.width > 0 && bounds.height > 0
    && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= root.width + 1
    && bounds.y + bounds.height <= root.height + 1 ? bounds : null;
}

export function shouldDismissRecipe(distance: number, velocity: number, height: number) {
  'worklet';
  // Reversing the swipe should recover the draft, even after crossing the threshold.
  if (height <= 0 || velocity < -400) return false;
  return distance > Math.min(140, height * 0.18) || (distance > 24 && velocity > 850);
}
