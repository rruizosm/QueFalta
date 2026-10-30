// Patrones compartidos por el backfill SQL y los syncs. Coincidencias completas:
// «glutamato», «glutamina» y «Gluta-Hya» no son declaraciones sin gluten.
export const GLUTEN_FREE_NAME_PATTERN = '(^|[^a-z0-9])((sin|sense|sans|sem)[ /.-]*(gluten|glutren|glutenl)|ni +gluten|libres? +(de +)?gluten|gluten[ -]*free|glutenfrei|free +(from|of) +gluten|senza *glutine|s *[./] *(gluten|glut|gl)|0 *% *(de +)?gluten|no +contiene +gluten)([^a-z]|$)';
export const GLUTEN_FREE_SHORT_PATTERN = '(^|[^a-z0-9])s *[./] *g([^a-z0-9]|$)';
// S/G también puede significar «sin gas»: solo se acepta junto a un tipo de
// alimento sólido inequívoco, como las galletas y el pan de El Jamón.
export const GLUTEN_FREE_SHORT_FOOD_PATTERN = '(^|[^a-z0-9])(pan|galletas?|pasta|harina|bizcochos?|magdalenas?|boll(o|ito)s?|brio(che|xe)|pizzas?|cereales|crackers|barquillos)([^a-z0-9]|$)';
const explicit = new RegExp(GLUTEN_FREE_NAME_PATTERN);
const short = new RegExp(GLUTEN_FREE_SHORT_PATTERN);
const food = new RegExp(GLUTEN_FREE_SHORT_FOOD_PATTERN);

export function hasGlutenFreeName(...names) {
  return names.some((value) => {
    if (typeof value !== 'string') return false;
    const name = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
    return explicit.test(name) || (short.test(name) && food.test(name));
  });
}
