import { colors } from './colors';

/** Emoji + color por nombre de categoría N1 de Mercadona. */
export const CATEGORY_META: Record<string, { emoji: string; color: string }> = {
  'Fruta y verdura':                { emoji: '🥦', color: colors.accent },
  'Aperitivos':                     { emoji: '🥨', color: colors.yellow },
  'Lácteos y huevos':               { emoji: '🥛', color: colors.blue },
  'Panadería':                      { emoji: '🍞', color: colors.orange },
  'Carne':                          { emoji: '🥩', color: colors.red },
  'Pescado y marisco':              { emoji: '🐟', color: colors.teal },
  'Agua y refrescos':               { emoji: '💧', color: colors.teal },
  'Congelados':                     { emoji: '🧊', color: colors.blue },
  'Limpieza y hogar':               { emoji: '🧹', color: colors.purple },
  'Bodega':                         { emoji: '🍷', color: colors.purple },
  'Cuidado personal':               { emoji: '🧴', color: colors.blue },
  'Mascotas':                       { emoji: '🐾', color: colors.orange },
  'Aceite, especias y salsas':      { emoji: '🫙', color: colors.purple },
  'Conservas y encurtidos':         { emoji: '🥫', color: colors.orange },
  'Conservas, caldos y cremas':     { emoji: '🥫', color: colors.orange },
  'Cuidado del cabello':            { emoji: '💇', color: colors.purple },
  'Cuidado facial y corporal':      { emoji: '🧴', color: colors.blue },
  'Fitoterapia y parafarmacia':     { emoji: '🌿', color: colors.accent },
  'Cacao, café e infusiones':       { emoji: '☕', color: colors.orange },
  'Charcutería y quesos':           { emoji: '🧀', color: colors.yellow },
  'Huevos, leche y mantequilla':    { emoji: '🥛', color: colors.blue },
  'Maquillaje':                     { emoji: '💄', color: colors.red },
  'Marisco y pescado':              { emoji: '🦐', color: colors.teal },
  'Panadería y pastelería':         { emoji: '🥐', color: colors.orange },
  'Pizzas y platos preparados':     { emoji: '🍕', color: colors.red },
  'Postres y yogures':              { emoji: '🍮', color: colors.yellow },
  'Pasta, arroz y legumbres':       { emoji: '🍝', color: colors.orange },
  'Arroz, legumbres y pasta':       { emoji: '🍚', color: colors.orange },
  'Cereales y galletas':            { emoji: '🥣', color: colors.yellow },
  'Café, cacao e infusiones':       { emoji: '☕', color: colors.orange },
  'Dulces y chocolates':            { emoji: '🍫', color: colors.purple },
  'Azúcar, caramelos y chocolate':  { emoji: '🍬', color: colors.purple },
  'Zumos':                          { emoji: '🍊', color: colors.yellow },
  'Alimentación infantil':          { emoji: '🍼', color: colors.teal },
  'Bebé':                           { emoji: '👶', color: colors.teal },
  'Dietética y nutrición':          { emoji: '💪', color: colors.accent },
  'Internacional':                  { emoji: '🌍', color: colors.teal },
};

export function getMeta(name: string) {
  return CATEGORY_META[name] ?? { emoji: '🛒', color: colors.inkSoft };
}

/**
 * Categorías N1 reales de Mercadona que aparecen por defecto en el inicio
 * (sustituyen a los antiguos chips locales rotos), en orden de aparición:
 * Fruta y verdura · Carne · Huevos, leche y mantequilla · Panadería y pastelería ·
 * Agua y refrescos · Conservas, caldos y cremas.
 */
export const DEFAULT_HOME_CATEGORY_IDS = [1, 3, 6, 5, 18, 14];
