import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import type { CatalogStore } from '../constants/stores';
import type { UserProfile } from './profile';
import type { UIProduct } from '../lib/productAdapters';

export interface RecipeIngredient {
  store: CatalogStore;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  priceLabel: string;
  metaLabel: string | null;
  quantity: string;
}

export interface CommunityRecipe {
  id: string;
  authorId: string;
  title: string;
  imageUrl: string;
  ingredients: RecipeIngredient[];
  steps: string[];
  createdAt: string;
  author: {
    name: string;
    username: string | null;
    initials: string;
    color: string;
    avatarUrl: string | null;
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
  steps: string[];
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
  profiles?: {
    name?: string | null;
    username?: string | null;
    initials?: string | null;
    color?: string | null;
    avatar_url?: string | null;
  } | null;
};

const ingredientFromProduct = ({
  product,
  quantity,
}: CreateRecipeInput['ingredients'][number]): RecipeIngredient => ({
  store: product.store,
  productId: product.id,
  productName: product.name,
  productImageUrl: product.imageUrl,
  priceLabel: product.priceLabel,
  metaLabel: product.metaLabel,
  quantity: quantity.trim(),
});

const publicImageUrl = (path: string): string => (
  supabase.storage.from('recipe-images').getPublicUrl(path).data.publicUrl
);

function rowToRecipe(row: RecipeRow, profileFallback?: UserProfile | null): CommunityRecipe {
  const author = row.profiles ?? (profileFallback ? {
    name: profileFallback.name,
    username: profileFallback.username,
    initials: profileFallback.initials,
    color: profileFallback.color,
    avatar_url: profileFallback.avatarUrl,
  } : null);

  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    imageUrl: publicImageUrl(row.image_path),
    ingredients: Array.isArray(row.ingredients)
      ? (row.ingredients as Partial<RecipeIngredient>[]).map((ingredient) => ({
          ...ingredient,
          quantity: typeof ingredient.quantity === 'string' ? ingredient.quantity : '',
        })) as RecipeIngredient[]
      : [],
    steps: Array.isArray(row.steps)
      ? row.steps.filter((step): step is string => typeof step === 'string')
      : [],
    createdAt: row.created_at,
    author: {
      name: author?.name?.trim() || 'QuéFalta',
      username: author?.username?.trim() || null,
      initials: author?.initials?.trim() || 'Q',
      color: author?.color || '#2f6cb5',
      avatarUrl: author?.avatar_url || null,
    },
  };
}

export async function fetchCommunityRecipes(limit = 50): Promise<CommunityRecipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, author_id, title, image_path, ingredients, steps, created_at, profiles!recipes_author_id_fkey(name, username, initials, color, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as unknown as RecipeRow[]).map((row) => rowToRecipe(row));
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

  const ingredients = input.ingredients.map(ingredientFromProduct);
  const cleanSteps = input.steps.map((step) => step.trim()).filter(Boolean);
  const { data, error } = await supabase
    .from('recipes')
    .insert({
      author_id: input.userId,
      title: input.title.trim(),
      image_path: imagePath,
      ingredients,
      steps: cleanSteps,
    })
    .select('id, author_id, title, image_path, ingredients, steps, created_at')
    .single();

  if (error) {
    await storage.remove([imagePath]).catch(() => {});
    throw error;
  }

  return rowToRecipe(data as RecipeRow, input.profile);
}
