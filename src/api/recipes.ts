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
  /** Personas para las que están calculadas las cantidades; null en recetas antiguas. */
  servings: number | null;
  ingredients: RecipeIngredient[];
  steps: string[];
  /** Una foto opcional por paso; conserva el contrato de texto de versiones anteriores. */
  stepImageUrls?: (string | null)[];
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
  servings: number;
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
  servings?: unknown;
  ingredients: unknown;
  steps: unknown;
  step_image_paths?: unknown;
  recipe_likes?: { user_id: string }[];
  recipe_saves?: { user_id: string }[];
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

function normalizeRecipeServings(value: unknown): number | null {
  const servings = Number(value);
  return Number.isInteger(servings) && servings >= 1 && servings <= 99 ? servings : null;
}

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
    servings: normalizeRecipeServings(row.servings),
    ingredients: Array.isArray(row.ingredients)
      ? (row.ingredients as Partial<RecipeIngredient>[]).map((ingredient) => ({
          ...ingredient,
          quantity: typeof ingredient.quantity === 'string' ? ingredient.quantity : '',
          stepIndexes: normalizeRecipeStepIndexes(ingredient.stepIndexes, steps.length),
        })) as RecipeIngredient[]
      : [],
    steps,
    stepImageUrls: steps.map((_, index) => {
      const path: unknown = Array.isArray(row.step_image_paths) ? row.step_image_paths[index] : null;
      return typeof path === 'string' && path.startsWith(`${row.author_id}/`)
        && /^[\w/-]+\.jpg$/.test(path) && !path.includes('..')
        ? publicImageUrl(path) : null;
    }),
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
  if (!userId) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('id, author_id, title, image_path, servings, ingredients, steps, step_image_paths, created_at, like_count, save_count, profiles!recipes_author_id_fkey(name, username, initials, color, avatar_url, verified), recipe_likes!recipe_likes_recipe_id_fkey(user_id), recipe_saves!recipe_saves_recipe_id_fkey(user_id)')
      // Left embeds preserve recipes with no interactions; RLS also limits these to the viewer.
      .eq('recipe_likes.user_id', userId)
      .eq('recipe_saves.user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
      .abortSignal(controller.signal);

    if (error) throw error;
    const rows = (data ?? []) as unknown as RecipeRow[];
    return rows.map((row) => rowToRecipe(
      row,
      null,
      row.recipe_likes?.some((item) => item.user_id === userId) ?? false,
      row.recipe_saves?.some((item) => item.user_id === userId) ?? false,
    ));
  } finally {
    clearTimeout(timeout);
  }
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

async function uploadRecipeImage(userId: string, imageUri: string): Promise<string> {
  const context = ImageManipulator.manipulate(imageUri);
  context.resize({ width: 1200 });
  const rendered = await context.renderAsync();
  const { uri } = await rendered.saveAsync({
    compress: 0.82,
    format: SaveFormat.JPEG,
  });

  const response = await fetch(uri);
  const bytes = await response.arrayBuffer();
  const imagePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const storage = supabase.storage.from('recipe-images');
  const { error: uploadError } = await storage.upload(imagePath, bytes, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (uploadError) throw uploadError;
  return imagePath;
}

export async function createCommunityRecipe(input: CreateRecipeInput): Promise<CommunityRecipe> {
  if (!Number.isInteger(input.servings) || input.servings < 1 || input.servings > 99) {
    throw new Error('Recipe servings must be an integer between 1 and 99');
  }
  if (input.steps.some((step) => step.imageUri && !step.text.trim())) {
    throw new Error('A step with a photo requires a description');
  }
  const cleanSteps = cleanRecipeSteps(input.steps);
  const storage = supabase.storage.from('recipe-images');
  const uploadedPaths: string[] = [];
  const stepImagePaths: (string | null)[] = [];
  let imagePath: string;
  try {
    imagePath = await uploadRecipeImage(input.userId, input.imageUri);
    uploadedPaths.push(imagePath);
    // Keep memory bounded and retain null slots so images never shift to another step.
    for (const step of cleanSteps) {
      const path = step.imageUri ? await uploadRecipeImage(input.userId, step.imageUri) : null;
      if (path) uploadedPaths.push(path);
      stepImagePaths.push(path);
    }
  } catch (error) {
    if (uploadedPaths.length > 0) await storage.remove(uploadedPaths).catch(() => {});
    throw error;
  }
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
      servings: input.servings,
      ingredients,
      steps: cleanSteps.map((step) => step.text),
      step_image_paths: stepImagePaths,
    })
    .select('id, author_id, title, image_path, servings, ingredients, steps, step_image_paths, created_at, like_count, save_count')
    .single();

  if (error) {
    // Only remove after a definite database rejection, not an uncertain network response.
    if (error.code) await storage.remove(uploadedPaths).catch(() => {});
    throw error;
  }

  return rowToRecipe(data as RecipeRow, input.profile);
}
