import { colors } from './colors';

/** Emoji + color por nombre de categoría N1 de Mercadona.
 *  Las entradas con el color principal usan getter para seguir al accent
 *  elegido en Apariencia (un valor plano se congelaría al cargar el módulo). */
export const CATEGORY_META: Record<string, { emoji: string; color: string }> = {
  'Fruta y verdura':                { emoji: '🥦', get color() { return colors.accent; } },
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
  'Fitoterapia y parafarmacia':     { emoji: '🌿', get color() { return colors.accent; } },
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
  'Dietética y nutrición':          { emoji: '💪', get color() { return colors.accent; } },
  'Internacional':                  { emoji: '🌍', color: colors.teal },
};

/**
 * Fallback por palabras clave para categorías N1 que NO son de Mercadona
 * (Bonpreu, Carrefour, bonÀrea usan otros nombres). Se comprueba en orden,
 * primer match gana (específico → general). Mercadona no llega aquí porque
 * sus nombres están en CATEGORY_META (match exacto, que tiene prioridad).
 */
const CATEGORY_KEYWORD_RULES: [string, { emoji: string; color: string }][] = [
  // ── Alimentación / frescos ────────────────────────────────────
  ['lácteo',          { emoji: '🥛', color: colors.blue }],
  ['frescos',         { emoji: '🥦', get color() { return colors.accent; } }],
  ['congelado',       { emoji: '🧊', color: colors.blue }],
  ['cocinado',        { emoji: '🍲', color: colors.red }],
  ['despensa',        { emoji: '🥫', color: colors.orange }],
  ['km0',             { emoji: '🌱', get color() { return colors.accent; } }],
  ['km 0',            { emoji: '🌱', get color() { return colors.accent; } }],
  ['brasa',           { emoji: '🔥', color: colors.red }],
  ['san juan',        { emoji: '🎉', color: colors.purple }],
  ['dietas',          { emoji: '🌿', get color() { return colors.accent; } }],
  ['intolerancia',    { emoji: '🌿', get color() { return colors.accent; } }],
  ['aliment',         { emoji: '🍽️', color: colors.orange }],
  // ── Bebidas ───────────────────────────────────────────────────
  ['bodega',          { emoji: '🍷', color: colors.purple }],
  ['vino',            { emoji: '🍷', color: colors.purple }],
  ['bebida',          { emoji: '🥤', color: colors.teal }],
  // ── Bebés y mascotas (juguete antes que bebé) ─────────────────
  ['juguete',         { emoji: '🧸', color: colors.red }],
  ['bebé',            { emoji: '👶', color: colors.teal }],
  ['bebes',           { emoji: '👶', color: colors.teal }],
  ['mascota',         { emoji: '🐾', color: colors.orange }],
  ['ganader',         { emoji: '🚜', color: colors.orange }],
  // ── Salud y belleza ───────────────────────────────────────────
  ['parafarmacia',    { emoji: '💊', color: colors.teal }],
  ['cuidado personal',{ emoji: '🧴', color: colors.blue }],
  ['higiene',         { emoji: '🧴', color: colors.blue }],
  ['cosmética',       { emoji: '💄', color: colors.red }],
  ['perfum',          { emoji: '🌸', color: colors.purple }],
  // ── Hogar y limpieza ──────────────────────────────────────────
  ['droguería',       { emoji: '🧼', color: colors.blue }],
  ['limpieza',        { emoji: '🧹', color: colors.purple }],
  ['electrodom',      { emoji: '🔌', color: colors.inkSoft }],
  // ── Bazar / no alimentación ───────────────────────────────────
  ['automoción',      { emoji: '🚗', color: colors.blue }],
  ['bricolaje',       { emoji: '🔧', color: colors.inkSoft }],
  ['informática',     { emoji: '💻', color: colors.blue }],
  ['papelería',       { emoji: '✏️', color: colors.yellow }],
  ['ropa',            { emoji: '👕', color: colors.teal }],
  ['calzado',         { emoji: '👟', color: colors.teal }],
  ['textil',          { emoji: '🧶', color: colors.teal }],
  // 'hogar'/'jardín' al final: genéricos que no deben pisar "...textil hogar".
  ['hogar',           { emoji: '🏠', color: colors.orange }],
  ['jardín',          { emoji: '🪴', get color() { return colors.accent; } }],
  // ── Comercial / transversal ───────────────────────────────────
  ['oferta',          { emoji: '🏷️', color: colors.red }],
  ['novedad',         { emoji: '✨', color: colors.yellow }],
];

export function getMeta(name: string) {
  const exact = CATEGORY_META[name];
  if (exact) return exact;
  const lower = name.toLowerCase();
  for (const [keyword, meta] of CATEGORY_KEYWORD_RULES) {
    if (lower.includes(keyword)) return meta;
  }
  return { emoji: '🛒', color: colors.inkSoft };
}

/**
 * Categorías N1 reales de Mercadona que aparecen por defecto en el inicio
 * (sustituyen a los antiguos chips locales rotos), en orden de aparición:
 * Fruta y verdura · Carne · Huevos, leche y mantequilla · Panadería y pastelería ·
 * Agua y refrescos · Conservas, caldos y cremas.
 */
export const DEFAULT_HOME_CATEGORY_IDS = [1, 3, 6, 5, 18, 14];
