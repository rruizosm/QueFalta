import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import type { CatalogStore } from '../constants/stores';
import type { UserProfile } from './profile';
import type { UIProduct } from '../lib/productAdapters';
import {
  cleanRecipeSteps,
  normalizeRecipeStepIndexes,
  recipeProductKey,
  stepIndexesForIngredient,
  type RecipeStepInput,
} from '../lib/recipeSteps';

export interface RecipeIngredient {
  store: CatalogStore;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  priceLabel: string;
  metaLabel: string | null;
  quantity: string;
  /** Opcionales para admitir recetas publicadas antes de añadir el carrito. */
  categoryName?: string | null;
  unitPrice?: number | null;
  /** Pasos (índice desde cero) en los que se utiliza el ingrediente. */
  stepIndexes?: number[];
}

export interface CommunityRecipe {
  id: string;
  authorId: string;
  title: string;
  imageUrl: string;
  ingredients: RecipeIngredient[];
  steps: string[];
  createdAt: string;
  likeCount: number;
  saveCount: number;
  isLiked: boolean;
  isSaved: boolean;
  author: {
    name: string;
    username: string | null;
    initials: string;
    color: string;
    avatarUrl: string | null;
    verified: boolean;
  };
}

export interface CreateRecipeInput {
  userId: string;
  title: string;
  imageUri: string;
  ingredients: {
    product: UIProduct;
    quantity: string;
  }[];
  steps: RecipeStepInput[];
  profile: UserProfile | null;
}

type RecipeRow = {
  id: string;
  author_id: string;
  title: string;
  image_path: string;
  ingredients: unknown;
  steps: unknown;
  created_at: string;
  like_count: number;
  save_count: number;
  profiles?: {
    name?: string | null;
    username?: string | null;
    initials?: string | null;
    color?: string | null;
    avatar_url?: string | null;
    verified?: boolean | null;
  } | null;
};

const ingredientFromProduct = ({
  product,
  quantity,
}: CreateRecipeInput['ingredients'][number], stepIndexes: number[]): RecipeIngredient => ({
  store: product.store,
  productId: product.id,
  productName: product.name,
  productImageUrl: product.imageUrl,
  priceLabel: product.priceLabel,
  metaLabel: product.metaLabel,
  quantity: quantity.trim(),
  categoryName: product.categoryName,
  unitPrice: product.unitPrice,
  ...(stepIndexes.length > 0 ? { stepIndexes } : {}),
});

const publicImageUrl = (path: string): string => (
  supabase.storage.from('recipe-images').getPublicUrl(path).data.publicUrl
);

type RecipeInteractionRow = {
  recipe_id: string;
};

function rowToRecipe(
  row: RecipeRow,
  profileFallback?: UserProfile | null,
  isLiked = false,
  isSaved = false,
): CommunityRecipe {
  const author = row.profiles ?? (profileFallback ? {
    name: profileFallback.name,
    username: profileFallback.username,
    initials: profileFallback.initials,
    color: profileFallback.color,
    avatar_url: profileFallback.avatarUrl,
    verified: profileFallback.verified,
  } : null);

  const steps = Array.isArray(row.steps)
    ? row.steps.filter((step): step is string => typeof step === 'string')
    : [];

  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    imageUrl: publicImageUrl(row.image_path),
    ingredients: Array.isArray(row.ingredients)
      ? (row.ingredients as Partial<RecipeIngredient>[]).map((ingredient) => ({
          ...ingredient,
          quantity: typeof ingredient.quantity === 'string' ? ingredient.quantity : '',
          stepIndexes: normalizeRecipeStepIndexes(ingredient.stepIndexes, steps.length),
        })) as RecipeIngredient[]
      : [],
    steps,
    createdAt: row.created_at,
    likeCount: Math.max(0, Number(row.like_count) || 0),
    saveCount: Math.max(0, Number(row.save_count) || 0),
    isLiked,
    isSaved,
    author: {
      name: author?.name?.trim() || 'QuéFalta',
      username: author?.username?.trim() || null,
      initials: author?.initials?.trim() || 'Q',
      color: author?.color || '#2f6cb5',
      avatarUrl: author?.avatar_url || null,
      verified: author?.verified ?? false,
    },
  };
}

export async function fetchCommunityRecipes(userId: string, limit = 50): Promise<CommunityRecipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, author_id, title, image_path, ingredients, steps, created_at, like_count, save_count, profiles!recipes_author_id_fkey(name, username, initials, color, avatar_url, verified)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = (data ?? []) as unknown as RecipeRow[];
  const recipeIds = rows.map((row) => row.id);
  if (recipeIds.length === 0) return [];

  const [likesResult, savesResult] = await Promise.all([
    supabase
      .from('recipe_likes')
      .select('recipe_id')
      .eq('user_id', userId)
      .in('recipe_id', recipeIds),
    supabase
      .from('recipe_saves')
      .select('recipe_id')
      .eq('user_id', userId)
      .in('recipe_id', recipeIds),
  ]);

  if (likesResult.error) throw likesResult.error;
  if (savesResult.error) throw savesResult.error;

  const likedIds = new Set(
    ((likesResult.data ?? []) as RecipeInteractionRow[]).map((item) => item.recipe_id),
  );
  const savedIds = new Set(
    ((savesResult.data ?? []) as RecipeInteractionRow[]).map((item) => item.recipe_id),
  );

  return rows.map((row) => rowToRecipe(
    row,
    null,
    likedIds.has(row.id),
    savedIds.has(row.id),
  ));
}

async function setRecipeInteraction(
  table: 'recipe_likes' | 'recipe_saves',
  recipeId: string,
  userId: string,
  active: boolean,
): Promise<void> {
  if (active) {
    const { error } = await supabase
      .from(table)
      .insert({ recipe_id: recipeId, user_id: userId });
    if (error && error.code !== '23505') throw error;
    return;
  }

  const { error } = await supabase
    .from(table)
    .delete()
    .eq('recipe_id', recipeId)
    .eq('user_id', userId);
  if (error) throw error;
}

export function setRecipeLiked(recipeId: string, userId: string, liked: boolean): Promise<void> {
  return setRecipeInteraction('recipe_likes', recipeId, userId, liked);
}

export function setRecipeSaved(recipeId: string, userId: string, saved: boolean): Promise<void> {
  return setRecipeInteraction('recipe_saves', recipeId, userId, saved);
}

export async function createCommunityRecipe(input: CreateRecipeInput): Promise<CommunityRecipe> {
  const context = ImageManipulator.manipulate(input.imageUri);
  context.resize({ width: 1200 });
  const rendered = await context.renderAsync();
  const { uri } = await rendered.saveAsync({
    compress: 0.82,
    format: SaveFormat.JPEG,
  });

  const response = await fetch(uri);
  const bytes = await response.arrayBuffer();
  const imagePath = `${input.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const storage = supabase.storage.from('recipe-images');
  const { error: uploadError } = await storage.upload(imagePath, bytes, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const cleanSteps = cleanRecipeSteps(input.steps);
  const ingredients = input.ingredients.map((ingredient) => ingredientFromProduct(
    ingredient,
    stepIndexesForIngredient(cleanSteps, recipeProductKey(ingredient.product)),
  ));
  const { data, error } = await supabase
    .from('recipes')
    .insert({
      author_id: input.userId,
      title: input.title.trim(),
      image_path: imagePath,
      ingredients,
      steps: cleanSteps.map((step) => step.text),
    })
    .select('id, author_id, title, image_path, ingredients, steps, created_at, like_count, save_count')
    .single();

  if (error) {
    await storage.remove([imagePath]).catch(() => {});
    throw error;
  }

  return rowToRecipe(data as RecipeRow, input.profile);
}
