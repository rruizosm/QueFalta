import type { NewListItem } from '../api/lists';
import type { RecipeIngredient } from '../api/recipes';

function ingredientPrice(ingredient: RecipeIngredient): number | null {
  if (ingredient.unitPrice !== undefined) {
    return typeof ingredient.unitPrice === 'number'
      && Number.isFinite(ingredient.unitPrice)
      && ingredient.unitPrice >= 0
      ? ingredient.unitPrice
      : null;
  }

  // Las recetas antiguas solo guardaban el precio formateado del envase.
  // No interpretar promociones ni precios por kg/l como precio de compra.
  const label = ingredient.priceLabel?.trim() ?? '';
  if (!/^\d+(?:[.,]\d{1,2})?\s*€$/.test(label)) return null;
  return Number(label.replace('€', '').trim().replace(',', '.'));
}

export function recipeIngredientsToListItems(ingredients: RecipeIngredient[]): NewListItem[] {
  return ingredients.map((ingredient) => ({
    storeKey: ingredient.store,
    productName: ingredient.productName,
    // El carrito cuenta envases; «250 g» o «al gusto» son cantidades de cocina.
    quantity: 1,
    unit: 'ud',
    note: ingredient.quantity?.trim() || null,
    categoryName: ingredient.categoryName ?? null,
    mercadonaProductId: ingredient.store === 'mercadona' ? ingredient.productId : null,
    storeProductId: ingredient.productId,
    unitPrice: ingredientPrice(ingredient),
    imageUrl: ingredient.productImageUrl,
  }));
}
