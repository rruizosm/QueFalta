/**
 * Comunidad autónoma del usuario → filtro de supermercados del catálogo.
 *
 * La app pide el CÓDIGO POSTAL (5 dígitos) y deriva la comunidad de sus 2
 * primeros dígitos (provincia → CCAA, mapeo fijo). Se guardan ambos:
 * `profiles.postal_code` (la clave que usan todas las APIs que regionalizan:
 * Mercadona wh, Carrefour werks, Dia, Consum X-TOL-ZONE, Plusfresc centro) y
 * `profiles.region`, un código ISO 3166-2:ES (`ES-CT`, `ES-CN`…) o el sentinel
 * `ES` = "toda España / no filtrar" (en ese caso postal_code queda NULL). Los
 * nombres visibles NO viven aquí: salen de i18n (`region.names.${code}` /
 * `region.all`), así el código guardado no depende del idioma.
 * Ver COMUNIDAD-AUTONOMA.md y MULTIZONA-CONSUM-PLUSFRESC.md.
 *
 * La unidad de conocimiento es la huella de cada súper (en qué CCAA opera),
 * afinable sin migrar nada (solo cliente), igual que zones.ts.
 */
import { CATALOG_STORE_KEYS, type CatalogStore } from './stores';

/** Códigos ISO 3166-2:ES de las 17 CCAA + Ceuta/Melilla. */
export type RegionCode =
  | 'ES-AN' | 'ES-AR' | 'ES-AS' | 'ES-CB' | 'ES-CL' | 'ES-CM' | 'ES-CN'
  | 'ES-CT' | 'ES-EX' | 'ES-GA' | 'ES-IB' | 'ES-MC' | 'ES-MD' | 'ES-NC'
  | 'ES-PV' | 'ES-RI' | 'ES-VC' | 'ES-CE' | 'ES-ML';

/** Sentinel: el usuario eligió "toda España" (sin filtro). */
export const REGION_ALL = 'ES' as const;
export type RegionValue = RegionCode | typeof REGION_ALL;

/** Orden de aparición en el selector (alfabético por nombre es; 'ES' va aparte, al final). */
export const REGION_CODES: RegionCode[] = [
  'ES-AN', // Andalucía
  'ES-AR', // Aragón
  'ES-AS', // Asturias
  'ES-CN', // Canarias
  'ES-CB', // Cantabria
  'ES-CM', // Castilla-La Mancha
  'ES-CL', // Castilla y León
  'ES-CT', // Cataluña
  'ES-CE', // Ceuta
  'ES-MD', // Comunidad de Madrid
  'ES-VC', // Comunidad Valenciana
  'ES-EX', // Extremadura
  'ES-GA', // Galicia
  'ES-IB', // Islas Baleares
  'ES-RI', // La Rioja
  'ES-ML', // Melilla
  'ES-NC', // Navarra
  'ES-PV', // País Vasco
  'ES-MC', // Región de Murcia
];

/** Huella de cada súper. null = nacional (disponible en todas las CCAA). */
export const STORE_REGIONS: Record<CatalogStore, RegionCode[] | null> = {
  mercadona: null,
  carrefour: null,
  dia:       null,
  aldi:      null,
  lidl:      null,
  alcampo:   null,
  esclat:    ['ES-CT'],
  sorli:     ['ES-CT'],
  caprabo:   ['ES-CT'],
  ametller:  ['ES-CT'],
  // Plusfresc opera en Catalunya y en la Franja de Ponent (Aragón).
  plusfresc: ['ES-CT', 'ES-AR'],
  gadis:     ['ES-GA', 'ES-CL'],
  froiz:     ['ES-GA', 'ES-CL', 'ES-CM', 'ES-MD'],
  ahorramas: ['ES-CM', 'ES-MD', 'ES-CL'],
  condis:    ['ES-CT'],
  bonarea:   ['ES-CT', 'ES-AR', 'ES-CM', 'ES-MD', 'ES-VC', 'ES-RI', 'ES-NC'],
  consum:    ['ES-AN', 'ES-AR', 'ES-CM', 'ES-CT', 'ES-MC', 'ES-VC'],
  eroski:    ['ES-AS', 'ES-AR', 'ES-CB', 'ES-CL', 'ES-CT', 'ES-GA', 'ES-IB', 'ES-NC', 'ES-PV', 'ES-RI'],
  hiperdino: ['ES-CN'],
};

/** Provincia (2 primeros dígitos del CP, "01"–"52") → comunidad autónoma.
 *  Mapeo oficial fijo: los prefijos postales coinciden 1:1 con las provincias. */
export const PROVINCE_REGION: Record<string, RegionCode> = {
  '01': 'ES-PV', // Álava
  '02': 'ES-CM', // Albacete
  '03': 'ES-VC', // Alicante
  '04': 'ES-AN', // Almería
  '05': 'ES-CL', // Ávila
  '06': 'ES-EX', // Badajoz
  '07': 'ES-IB', // Illes Balears
  '08': 'ES-CT', // Barcelona
  '09': 'ES-CL', // Burgos
  '10': 'ES-EX', // Cáceres
  '11': 'ES-AN', // Cádiz
  '12': 'ES-VC', // Castellón
  '13': 'ES-CM', // Ciudad Real
  '14': 'ES-AN', // Córdoba
  '15': 'ES-GA', // A Coruña
  '16': 'ES-CM', // Cuenca
  '17': 'ES-CT', // Girona
  '18': 'ES-AN', // Granada
  '19': 'ES-CM', // Guadalajara
  '20': 'ES-PV', // Gipuzkoa
  '21': 'ES-AN', // Huelva
  '22': 'ES-AR', // Huesca
  '23': 'ES-AN', // Jaén
  '24': 'ES-CL', // León
  '25': 'ES-CT', // Lleida
  '26': 'ES-RI', // La Rioja
  '27': 'ES-GA', // Lugo
  '28': 'ES-MD', // Madrid
  '29': 'ES-AN', // Málaga
  '30': 'ES-MC', // Murcia
  '31': 'ES-NC', // Navarra
  '32': 'ES-GA', // Ourense
  '33': 'ES-AS', // Asturias
  '34': 'ES-CL', // Palencia
  '35': 'ES-CN', // Las Palmas
  '36': 'ES-GA', // Pontevedra
  '37': 'ES-CL', // Salamanca
  '38': 'ES-CN', // Santa Cruz de Tenerife
  '39': 'ES-CB', // Cantabria
  '40': 'ES-CL', // Segovia
  '41': 'ES-AN', // Sevilla
  '42': 'ES-CL', // Soria
  '43': 'ES-CT', // Tarragona
  '44': 'ES-AR', // Teruel
  '45': 'ES-CM', // Toledo
  '46': 'ES-VC', // Valencia
  '47': 'ES-CL', // Valladolid
  '48': 'ES-PV', // Bizkaia
  '49': 'ES-CL', // Zamora
  '50': 'ES-AR', // Zaragoza
  '51': 'ES-CE', // Ceuta
  '52': 'ES-ML', // Melilla
};

/** CP español (5 dígitos) → su comunidad autónoma; null si no es un CP válido
 *  (longitud/prefijo). Única validación necesaria: prefijo "01"–"52". */
export function regionFromPostalCode(cp: string): RegionCode | null {
  if (!/^\d{5}$/.test(cp)) return null;
  return PROVINCE_REGION[cp.slice(0, 2)] ?? null;
}

/** ¿Está `store` disponible en `region`?  'ES'/null → todos visibles. */
export function storeInRegion(store: CatalogStore, region: RegionValue | null): boolean {
  if (region == null || region === REGION_ALL) return true;
  const regions = STORE_REGIONS[store];
  return regions == null || regions.includes(region);
}

/** Súpers disponibles en una CCAA (en el orden canónico de CATALOG_STORE_KEYS). */
export function storesForRegion(region: RegionValue | null): CatalogStore[] {
  return CATALOG_STORE_KEYS.filter((s) => storeInRegion(s, region));
}

/** Solo los súpers nacionales (fallback si la preferencia ∩ región queda vacía). */
export function nationalStores(): CatalogStore[] {
  return CATALOG_STORE_KEYS.filter((s) => STORE_REGIONS[s] == null);
}

/** Puente a los nombres locales que usa mercadona_products.regions (futura
 *  sinergia: filtrar productos regionales de Mercadona por la CCAA del usuario). */
export const REGION_MERCADONA_NAME: Partial<Record<RegionCode, string>> = {
  'ES-CT': 'Catalunya', 'ES-VC': 'Comunitat Valenciana', 'ES-IB': 'Illes Balears',
  'ES-PV': 'Euskadi',   'ES-AN': 'Andalucía', 'ES-CM': 'Castilla-La Mancha',
  'ES-CL': 'Castilla y León', 'ES-AR': 'Aragón', 'ES-GA': 'Galicia',
  'ES-CN': 'Canarias',  'ES-MD': 'Comunidad de Madrid', 'ES-MC': 'Región de Murcia',
  'ES-NC': 'Navarra',   'ES-AS': 'Asturias', 'ES-CB': 'Cantabria',
  'ES-EX': 'Extremadura', 'ES-RI': 'La Rioja', 'ES-CE': 'Ceuta', 'ES-ML': 'Melilla',
};
