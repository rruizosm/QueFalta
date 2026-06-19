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
