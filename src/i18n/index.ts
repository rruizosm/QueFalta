/**
 * i18n — traducción de la UI (castellano / català).
 *
 * Sigue el mismo patrón que el sistema de tema (constants/colors.ts):
 * un idioma actual MUTABLE a nivel de módulo + `applyLanguage(lang)` que lo
 * cambia de forma SÍNCRONA, y un `t(key)` que lee ese valor en cada llamada.
 * La reactividad (re-render al cambiar de idioma) la aporta `LanguageContext`
 * vía `useTranslation()`: los componentes que llaman a `t` se suscriben al
 * contexto y se vuelven a renderizar, igual que `useThemedStyles`.
 *
 * Las traducciones de los PRODUCTOS no viven aquí: vienen de la API de cada
 * súper (Mercadona soporta catalán, otros no). Esto es solo la UI propia.
 */
import {
  resources, type AppLanguage, DEFAULT_LANGUAGE, type TranslationTree,
} from './translations';

export {
  LANGUAGE_OPTIONS, DEFAULT_LANGUAGE, type AppLanguage,
} from './translations';

let current: AppLanguage = DEFAULT_LANGUAGE;

export function applyLanguage(lang: AppLanguage): void {
  current = lang;
}

export function getLanguage(): AppLanguage {
  return current;
}

/** Recorre una clave con notación de puntos ("profile.title") en el diccionario. */
function resolve(dict: TranslationTree, path: string): string | undefined {
  let node: string | TranslationTree | undefined = dict;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Traduce una clave al idioma actual. Si falta en català cae al castellano, y
 * si tampoco existe devuelve la propia clave (visible en desarrollo).
 * Interpola `{{param}}` con `params`.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let str =
    resolve(resources[current], key) ??
    resolve(resources[DEFAULT_LANGUAGE], key) ??
    key;

  if (params) {
    for (const k of Object.keys(params)) {
      str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(params[k]));
    }
  }
  return str;
}
