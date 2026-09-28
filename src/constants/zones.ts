// ─── Zonas de la compra: agrupado de la lista por "pasillo" del súper ─────────
// Cada súper nombra sus categorías a su manera ("Congelados y helados" en Consum,
// "Congelados" en Dia/Mercadona…), así que la lista NO agrupa por el nombre crudo
// sino por una ZONA canónica de QuéFalta, mapeada por palabras clave desde el
// category_name guardado en list_items (N1/hoja del retailer; BM conserva la
// ruta N1 › N2; null = manual/histórico → "Otros").
//
// El ORDEN del array es el orden de pintado y sigue el recorrido típico de una
// tienda: frescos primero y congelados tras el resto de alimentación, con
// droguería/higiene/mascotas después. La evaluación de keywords también sigue
// este orden, salvo que "Congelados" tiene prioridad como condición de
// conservación ("Congelados › Fruta y verdura" no es fruta fresca). Ojo al
// reordenar: hay solapes resueltos por posición (p.ej. "Bollería, repostería y
// azúcar" debe caer en Panadería, no en Desayuno por "azúcar").
//
// Las keywords cubren los N1 de los 6 supers (Mercadona, Bonpreu, Carrefour,
// bonÀrea, Consum, Dia) en castellano + algo de catalán (Bonpreu/bonÀrea), y
// funcionan razonablemente con nombres de hoja ("Frutos secos" → Aperitivos).
// Afinar aquí no requiere migrar datos: el mapeo es solo de cliente.

export interface ShopZone {
  key: string;
  label: string;
  emoji: string;
  /** Se evalúa sobre el nombre normalizado (minúsculas, sin acentos). */
  match: RegExp;
}

export const SHOP_ZONES: ShopZone[] = [
  { key: 'fruta',      label: 'Fruta y verdura',                emoji: '🥦', match: /\bfrutas?\b|\bverduras?\b|hortaliz|fruita|verdura/ },
  { key: 'frescos',    label: 'Carne, pescado y charcutería',   emoji: '🥩', match: /carnes?\b|carnic|pescad|marisc|charcut|embutid|ques|jamon|peix|\bfrescos?\b|xarcut|embotit|butifarra|botifarra|fuet|llonganis|chorizo|salchich|salsitx|sobrassad|sobrasad|morcilla|mortadel|salami|pernil|cansalada|panceta|hamburgues|\bburger\b|\baves?\b|\bpollo\b|\bpollastre\b|\bchicken\b|\bpechugas?\b/ },
  { key: 'lacteos',    label: 'Lácteos y huevos',               emoji: '🥛', match: /lacteo|lactic|huevo|\bous?\b|leche|\bllet\b|mantequilla|yogur|iogurt|postre|formatge/ },
  { key: 'pan',        label: 'Panadería y repostería',         emoji: '🥐', match: /panader|\bpan\b|horno|\bforn\b|boller|reposter|pasteler/ },
  { key: 'desayuno',   label: 'Desayuno y dulces',              emoji: '☕', match: /cafe|cacao|infusion|galleta|cereal|mermelada|chocolat|golosina|dulce|azucar|caramelo|miel|esmorzar/ },
  { key: 'despensa',   label: 'Despensa',                       emoji: '🥫', match: /aceite|\boli\b|salsa|especia|conserva|encurtido|caldo|crema|sopa|pure|arroz|arros|pasta|legumbre|llegum|harina|farina|despensa|rebost|sin gluten|ecologic|saludable|\balimentacion\b(?! infantil)|\balimentacio\b/ },
  { key: 'aperitivos', label: 'Aperitivos',                     emoji: '🥨', match: /aperitiv|frutos secos|fruits secs|snack|patatas fritas|aceituna|oliva/ },
  { key: 'preparados', label: 'Platos preparados',              emoji: '🍕', match: /plato|preparad|pizza|cocinad|cuinat|precuinat|lasan|canelon/ },
  { key: 'bebidas',    label: 'Bebidas',                        emoji: '🥤', match: /agua|aigua|refresco|zumo|\bsuc\b|smoothie|cerveza|cervesa|vino|\bvi\b|licor|bodega|celler|bebida|beguda/ },
  { key: 'congelados', label: 'Congelados',                     emoji: '🧊', match: /congelad|congelat|\bhelados?\b|\bgelats?\b/ },
  { key: 'bebe',       label: 'Bebé',                           emoji: '🍼', match: /infantil|\bbebes?\b|\bnadons?\b|papilla|panal|bolquer/ },
  { key: 'limpieza',   label: 'Droguería y limpieza',           emoji: '🧹', match: /limpieza|neteja|hogar|\bllar\b|drogueria|menaje|deterg|celulosa|papel higienico/ },
  { key: 'higiene',    label: 'Higiene y belleza',              emoji: '🧴', match: /higien|cuidado|cura\b|cabello|cabell|perfum|maquillaje|parafarmacia|salud|salut|belleza|bellesa|facial|corporal|afeitado|bucal|dermo|colonia|fitoterapia/ },
  { key: 'mascotas',   label: 'Mascotas',                       emoji: '🐾', match: /mascota|perro|\bgos\b|gato|\bgat\b|animal/ },
];

/** Zona cajón de sastre: manuales, históricos sin categoría y no reconocidos. */
export const OTHER_ZONE: ShopZone = { key: 'otros', label: 'Otros', emoji: '🛒', match: /$ ^/ };

// Quita los diacriticos combinantes (U+0300-U+036F) tras descomponer con NFD.
const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const frozenZone = SHOP_ZONES.find((z) => z.key === 'congelados')!;
const ROOT_ZONE_PRIORITY = new Set(['congelados', 'bebe', 'bebidas', 'limpieza', 'higiene', 'mascotas']);

function matchZone(name: string): ShopZone | undefined {
  // La condición de congelado prevalece sobre el tipo de alimento, tanto en
  // rutas de categorías como en el fallback por nombre de productos sin zona.
  if (frozenZone.match.test(name)) return frozenZone;
  return SHOP_ZONES.find((z) => z.match.test(name));
}

/** Zona canónica para un nombre de categoría de cualquier súper (null → Otros). */
export function zoneOfCategory(categoryName: string | null | undefined): ShopZone {
  if (!categoryName) return OTHER_ZONE;
  const path = categoryName.split(/\s*(?:->|›|→)\s*/).filter(Boolean);
  if (path.length > 1) {
    const root = matchZone(normalize(path[0]));
    // En BM, conservación y secciones no alimentarias gobiernan toda la rama;
    // raíces genéricas como Alimentación o Frescos dejan decidir a la hoja.
    if (root && ROOT_ZONE_PRIORITY.has(root.key)) return root;
    for (let i = path.length - 1; i > 0; i--) {
      const leaf = matchZone(normalize(path[i]));
      if (leaf) return leaf;
    }
    return root ?? OTHER_ZONE;
  }
  const name = normalize(categoryName);
  return matchZone(name) ?? OTHER_ZONE;
}

/** Zona de un artículo de la lista: primero por su categoría y, si esta no resuelve
 *  (manuales sin categoría, o categorías-cajón de algunos súpers como la colección
 *  promocional "Para comer" de Bonpreu, que mezcla de todo y no casa con ningún
 *  pasillo), se deduce del propio NOMBRE del producto. El fallback solo puede SACAR
 *  cosas de "Otros" hacia un pasillo plausible, nunca recolocar lo ya bien clasificado. */
export function zoneOfItem(
  categoryName: string | null | undefined,
  productName?: string | null,
): ShopZone {
  const byCat = zoneOfCategory(categoryName);
  if (byCat.key !== OTHER_ZONE.key) return byCat;
  if (productName) {
    const name = normalize(productName);
    const z = matchZone(name);
    if (z) return z;
  }
  return OTHER_ZONE;
}

/** Agrupa por zona en el orden de recorrido (Otros al final), omitiendo vacías. */
export function groupByZone<T extends { categoryName: string | null; productName?: string }>(
  items: T[],
): { zone: ShopZone; data: T[] }[] {
  return [...SHOP_ZONES, OTHER_ZONE]
    .map((zone) => ({ zone, data: items.filter((it) => zoneOfItem(it.categoryName, it.productName).key === zone.key) }))
    .filter((g) => g.data.length > 0);
}

/** Orden de los artículos dentro de una zona: pendientes primero (los "en cesta"
 *  bajan, como hasta ahora) y alfabético dentro de cada estado. */
export function sortZoneItems<T extends { productName: string; inCart: boolean }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => Number(a.inCart) - Number(b.inCart) || a.productName.localeCompare(b.productName, 'es'),
  );
}
