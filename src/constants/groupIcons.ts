import { CATEGORY_EMOJIS } from './categoryMeta';
import { SUBCATEGORY_EMOJIS } from './subcategoryEmojis';

/**
 * Selector de icono de grupo. Se deriva de las mismas fuentes que pintan el
 * catálogo para que cualquier icono nuevo de categoría/subcategoría aparezca
 * aquí automáticamente, sin mantener un segundo listado a mano.
 */
export const GROUP_ICON_OPTIONS = Array.from(new Set([
  '🛒',
  ...CATEGORY_EMOJIS,
  ...SUBCATEGORY_EMOJIS,
]));

export const DEFAULT_GROUP_ICON = '🛒';
