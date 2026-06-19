// Orden alfabético de listas (categorías, subcategorías, productos) por su nombre
// YA localizado: los nombres vienen en el idioma activo (Mercadona devuelve català
// con lang=ca, etc.), así que ordenar por el texto mostrado equivale a ordenar
// "según el idioma".
//
// Comparación insensible a acentos y mayúsculas (misma normalización NFD que usa
// la búsqueda en catalog.ts / StoreProductList), DETERMINISTA en Hermes —el motor
// de RN no trae ICU completo, así que localeCompare por sí solo no garantiza un
// orden alfabético fiable—; solo se usa localeCompare como desempate fino.
import { getLanguage } from '../i18n';

const strip = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Comparador alfabético (a→z) insensible a acentos/mayúsculas. */
export function compareByName(a: string, b: string): number {
  const na = strip(a);
  const nb = strip(b);
  if (na < nb) return -1;
  if (na > nb) return 1;
  return a.localeCompare(b, getLanguage());
}

/** Devuelve una copia ordenada alfabéticamente por el nombre que extrae `name`. */
export function sortByName<T>(items: T[], name: (item: T) => string): T[] {
  return [...items].sort((x, y) => compareByName(name(x), name(y)));
}

// ─── Orden por RELEVANCIA (resultados de búsqueda) ───────────────────────────
// Alfabético es el orden correcto para NAVEGAR (categorías, subcategorías, todo el
// catálogo), pero el peor para BUSCAR: con "aigua", "Aigua de coco" gana a "Aigua
// mineral" solo porque c < m. En búsqueda el usuario espera el match más ajustado
// primero, así que se puntúa cada nombre y se ordena de mayor a menor relevancia.

/** Escapa los metacaracteres de regex de `s` para usarla como literal. */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Puntúa cuán relevante es `name` para `query` (mayor = más relevante). Señales,
 *  de más a menos peso: el nombre ES la consulta (match exacto), el nombre EMPIEZA
 *  por la consulta entera, y por cada palabra de la consulta: que aparezca como
 *  palabra entera (no incrustada en otra), que sea la primera del nombre y que
 *  aparezca cuanto antes. Insensible a acentos/mayúsculas (misma normalización que
 *  el resto). Se asume `name` ya casa con `query` (viene filtrado); las palabras
 *  que no aparezcan simplemente no suman. */
export function relevanceScore(name: string, query: string): number {
  const n = strip(name).trim();
  const q = strip(query).trim();
  if (!q) return 0;
  let score = 0;
  if (n === q) score += 1000;          // el nombre es exactamente la consulta
  if (n.startsWith(q)) score += 400;   // el nombre empieza por la frase buscada
  for (const w of q.split(/\s+/).filter(Boolean)) {
    const idx = n.indexOf(w);
    if (idx === -1) continue;
    if (new RegExp(`\\b${escapeRegExp(w)}\\b`).test(n)) score += 100; // palabra entera
    if (n.startsWith(w)) score += 60;                                  // cabeza del nombre
    score += Math.max(0, 40 - idx);                                    // cuanto antes, mejor
  }
  return score;
}

/** Copia de `items` ordenada por relevancia (desc) respecto a `query`. Desempata
 *  con el alfabético de `compareByName` para un orden estable y predecible. */
export function sortByRelevance<T>(items: T[], name: (item: T) => string, query: string): T[] {
  return [...items]
    .map((item) => ({ item, score: relevanceScore(name(item), query) }))
    .sort((a, b) => (b.score - a.score) || compareByName(name(a.item), name(b.item)))
    .map((x) => x.item);
}
