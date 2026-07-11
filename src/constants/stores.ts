import { Image as RNImage } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

// ─── Catálogo: supermercados que el usuario puede ver/activar ────────────────
// Fuente ÚNICA del switcher del catálogo, de la preferencia de perfil
// "Supermercados" y del agrupado de Lista/Cesta por tienda (de aquí salen los
// nombres e iconos). Para añadir una tienda: súmala aquí, al tipo y a storeOfItem.
export type CatalogStore = 'mercadona' | 'esclat' | 'carrefour' | 'bonarea' | 'consum' | 'dia' | 'sorli' | 'eroski' | 'caprabo';

/** Metadatos (nombre + icono) en orden de aparición. */
export const CATALOG_STORES: { key: CatalogStore; name: string; icon: number | null }[] = [
  { key: 'mercadona', name: 'Mercadona',     icon: require('../../assets/stores/mercadona.png') },
  { key: 'esclat',    name: 'BonpreuEsclat', icon: require('../../assets/stores/bonpreuesclat.png') },
  { key: 'carrefour', name: 'Carrefour',     icon: require('../../assets/stores/carrefour.png') },
  { key: 'bonarea',   name: 'bonÀrea',       icon: require('../../assets/stores/bonarea.png') },
  { key: 'consum',    name: 'Consum',        icon: require('../../assets/stores/consum.png') },
  { key: 'dia',       name: 'Dia',           icon: require('../../assets/stores/dia.png') },
  { key: 'sorli',     name: 'Sorli',         icon: require('../../assets/stores/sorli.png') },
  { key: 'eroski',    name: 'Eroski',        icon: require('../../assets/stores/eroski.png') },
  { key: 'caprabo',   name: 'Caprabo',       icon: require('../../assets/stores/caprabo.png') },
];

/** Orden canónico de las claves (para normalizar/ordenar selecciones). */
export const CATALOG_STORE_KEYS: CatalogStore[] = CATALOG_STORES.map((s) => s.key);

/** URIs resueltos de los logos locales (los `require` son módulos, no URLs;
 *  expo-image cachea/prefetchea por URI). */
const STORE_ICON_URIS: string[] = CATALOG_STORES
  .map((s) => (s.icon != null ? RNImage.resolveAssetSource(s.icon)?.uri : null))
  .filter((uri): uri is string => !!uri);

/** Precarga los logos de los súpers en la caché (memoria+disco) de expo-image
 *  para que se muestren AL INSTANTE en el paso de onboarding "Supermercados",
 *  sin el parpadeo de "cargando". Se llama al entrar al asistente; los logos se
 *  pintan con <Image> de expo-image (misma caché, mismo URI → acierto directo). */
export function prefetchStoreIcons(): void {
  if (STORE_ICON_URIS.length) {
    ExpoImage.prefetch(STORE_ICON_URIS, 'memory-disk').catch(() => {});
  }
}

// ─── Agrupado de Lista/Cesta por supermercado ────────────────────────────────
// La tienda se deduce de los datos del artículo (sin columna en BD): id de
// Mercadona, o el dominio de la imagen. Los manuales caen en "otros".
export type Store = CatalogStore | 'otros';

export const STORE_ORDER: Store[] = [...CATALOG_STORE_KEYS, 'otros'];

export const STORE_META: Record<Store, { name: string; icon: any }> = {
  ...Object.fromEntries(CATALOG_STORES.map((s) => [s.key, { name: s.name, icon: s.icon }])),
  otros: { name: 'Otros', icon: null },
} as Record<Store, { name: string; icon: any }>;

type StoreClue = { imageUrl?: string | null; mercadonaProductId?: string | null };

// Dominio de la miniatura guardada en list_items: bonpreuesclat.cat, mercadona.es,
// carrefour.es, bonarea.com, cdn-consum.aktiosdigitalservices.com, dia.es,
// cdn.sorliclic.com, eroski.es, capraboacasa.com. Mercadona también se reconoce
// por su id de producto.
export function storeOfItem(it: StoreClue): Store {
  const url = it.imageUrl ?? '';
  if (url.includes('bonpreuesclat')) return 'esclat';
  if (it.mercadonaProductId || url.includes('mercadona')) return 'mercadona';
  if (url.includes('carrefour')) return 'carrefour';
  if (url.includes('bonarea')) return 'bonarea';
  if (url.includes('consum')) return 'consum';
  if (url.includes('dia.es')) return 'dia';
  if (url.includes('sorliclic')) return 'sorli';
  if (url.includes('capraboacasa')) return 'caprabo';
  if (url.includes('eroski')) return 'eroski';
  return 'otros';
}

/** Agrupa por tienda en el orden STORE_ORDER, omitiendo las vacías. */
export function groupByStore<T extends StoreClue>(items: T[]): { store: Store; data: T[] }[] {
  return STORE_ORDER
    .map((store) => ({ store, data: items.filter((it) => storeOfItem(it) === store) }))
    .filter((s) => s.data.length > 0);
}
