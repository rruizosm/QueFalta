export interface RecipeStepInput {
  text: string;
  ingredientKeys: readonly string[];
}

export interface CleanRecipeStep {
  text: string;
  ingredientKeys: string[];
}

export const recipeProductKey = (product: { store: string; id: string }): string => (
  `${product.store}:${product.id}`
);

export function cleanRecipeSteps(steps: readonly RecipeStepInput[]): CleanRecipeStep[] {
  return steps.flatMap((step) => {
    const text = step.text.trim();
    if (!text) return [];

    return [{
      text,
      ingredientKeys: [...new Set(step.ingredientKeys.filter((key) => !!key))],
    }];
  });
}

export function stepIndexesForIngredient(
  steps: readonly CleanRecipeStep[],
  ingredientKey: string,
): number[] {
  return steps.flatMap((step, index) => (
    step.ingredientKeys.includes(ingredientKey) ? [index] : []
  ));
}

export function normalizeRecipeStepIndexes(value: unknown, stepCount: number): number[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.filter((index): index is number => (
    Number.isInteger(index) && index >= 0 && index < stepCount
  )))].sort((a, b) => a - b);
}
