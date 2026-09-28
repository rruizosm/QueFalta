import { browseAhorramasProducts, browseAlcampoProducts, browseAldiProducts, browseAmetllerProducts, browseBmProducts, browseBonareaProducts, browseBonpreuProducts, browseCapraboProducts, browseCarrefourProducts, browseCondisProducts, browseConsumProducts, browseDiaProducts, browseEljamonProducts, browseEroskiProducts, browseFroizProducts, browseGadisProducts, browseHiperdinoProducts, browseLidlProducts, browsePlusfrescProducts, browseProducts, browseSorliProducts, type BrowseCursor, type BrowsePage } from './catalog';
import { ahorramasToUI, alcampoToUI, aldiToUI, ametllerToUI, bmToUI, bonareaToUI, bonpreuToUI, capraboToUI, carrefourToUI, condisToUI, consumToUI, diaToUI, eljamonToUI, eroskiToUI, froizToUI, gadisToUI, hiperdinoToUI, lidlToUI, mercadonaToUI, plusfrescToUI, sorliToUI, type UIProduct } from '../lib/productAdapters';
import type { CatalogStore } from '../constants/stores';
import type { RegionValue } from '../constants/regions';
import { getLanguage } from '../i18n';
import { cacheCatalogRequest, catalogRequestKey, peekCatalogRequest, withCatalogRequestSignal } from '../lib/catalogRequestCache';
type ProductBrowseOrder = 'priceAsc' | 'priceDesc' | 'pricePerUnitAsc' | 'pricePerUnitDesc';
export async function loadBrowsePage(
  store: CatalogStore,
  cursor: BrowseCursor | null,
  region: RegionValue | null,
  postalCode: string | null,
  lidlStoreId: string | null,
  signal?: AbortSignal,
  order: ProductBrowseOrder = 'priceAsc',
  limit = 50,
): Promise<BrowsePage<UIProduct>> {
  if (signal?.aborted) { const error = new Error('Cancelled browse'); error.name = 'AbortError'; throw error; }
  return withCatalogRequestSignal(cacheCatalogRequest(catalogRequestKey('browse', [getLanguage(), store, cursor, region, postalCode, lidlStoreId, order, limit]), () => loadBrowsePageUncached(store, cursor, region, postalCode, lidlStoreId, undefined, order, limit)), signal);
}
export function peekBrowsePage(
  store: CatalogStore,
  cursor: BrowseCursor | null,
  region: RegionValue | null,
  postalCode: string | null,
  lidlStoreId: string | null,
  _signal?: AbortSignal,
  order: ProductBrowseOrder = 'priceAsc',
  limit = 50,
): BrowsePage<UIProduct> | undefined {
  return peekCatalogRequest(catalogRequestKey('browse', [getLanguage(), store, cursor, region, postalCode, lidlStoreId, order, limit]));
}
// Propagar los errores: reintentar en otro orden duplica la carga durante un
// timeout y mezcla cursores de precio con nombres. El paginador combinado ya
// conserva los resultados de los supermercados que sí respondieron.
async function loadBrowsePageUncached(
  store: CatalogStore,
  cursor: BrowseCursor | null,
  region: RegionValue | null,
  postalCode: string | null,
  lidlStoreId: string | null,
  signal?: AbortSignal,
  order: ProductBrowseOrder = 'priceAsc',
  limit = 50,
): Promise<BrowsePage<UIProduct>> {
  switch (store) {
    case 'mercadona': { const { items, nextCursor } = await browseProducts(cursor, region, limit, signal, order as never); return { items: items.map((p) => mercadonaToUI(p)), nextCursor }; }
    case 'esclat':    { const { items, nextCursor } = await browseBonpreuProducts(cursor, limit, signal, order as never); return { items: items.map(bonpreuToUI), nextCursor }; }
    case 'carrefour': { const { items, nextCursor } = await browseCarrefourProducts(cursor, region, limit, signal, order as never); return { items: items.map(carrefourToUI), nextCursor }; }
    case 'bonarea':   { const { items, nextCursor } = await browseBonareaProducts(cursor, limit, signal, order as never); return { items: items.map(bonareaToUI), nextCursor }; }
    case 'consum':    { const { items, nextCursor } = await browseConsumProducts(cursor, region, postalCode, limit, signal, order as never); return { items: items.map(consumToUI), nextCursor }; }
    case 'dia':       { const { items, nextCursor } = await browseDiaProducts(cursor, region, limit, signal, order as never); return { items: items.map(diaToUI), nextCursor }; }
    case 'sorli':     { const { items, nextCursor } = await browseSorliProducts(cursor, limit, signal, order as never); return { items: items.map(sorliToUI), nextCursor }; }
    case 'eroski':    { const { items, nextCursor } = await browseEroskiProducts(cursor, limit, signal, order as never); return { items: items.map(eroskiToUI), nextCursor }; }
    case 'caprabo':   { const { items, nextCursor } = await browseCapraboProducts(cursor, limit, signal, order as never); return { items: items.map(capraboToUI), nextCursor }; }
    case 'condis':    { const { items, nextCursor } = await browseCondisProducts(cursor, limit, signal, order as never); return { items: items.map(condisToUI), nextCursor }; }
    case 'ametller':  { const { items, nextCursor } = await browseAmetllerProducts(cursor, limit, signal, order as never); return { items: items.map(ametllerToUI), nextCursor }; }
    case 'aldi':      { const { items, nextCursor } = await browseAldiProducts(cursor, limit, signal, order as never); return { items: items.map(aldiToUI), nextCursor }; }
    case 'lidl':      { const { items, nextCursor } = await browseLidlProducts(cursor, limit, signal, order as never, lidlStoreId); return { items: items.map(lidlToUI), nextCursor }; }
    case 'bm':        { const { items, nextCursor } = await browseBmProducts(cursor, postalCode, limit, signal, order as never); return { items: items.map(bmToUI), nextCursor }; }
    case 'eljamon':   { const { items, nextCursor } = await browseEljamonProducts(cursor, limit, signal, order as never); return { items: items.map(eljamonToUI), nextCursor }; }
    case 'gadis':     { const { items, nextCursor } = await browseGadisProducts(cursor, limit, signal, order as never); return { items: items.map(gadisToUI), nextCursor }; }
    case 'froiz':     { const { items, nextCursor } = await browseFroizProducts(cursor, limit, signal, order as never); return { items: items.map(froizToUI), nextCursor }; }
    case 'ahorramas': { const { items, nextCursor } = await browseAhorramasProducts(cursor, limit, signal, order as never); return { items: items.map(ahorramasToUI), nextCursor }; }
    case 'hiperdino': { const { items, nextCursor } = await browseHiperdinoProducts(cursor, limit, signal, order as never); return { items: items.map(hiperdinoToUI), nextCursor }; }
    case 'alcampo':   { const { items, nextCursor } = await browseAlcampoProducts(cursor, limit, signal, order as never); return { items: items.map(alcampoToUI), nextCursor }; }
    case 'plusfresc': { const { items, nextCursor } = await browsePlusfrescProducts(cursor, postalCode, limit, signal, order as never); return { items: items.map(plusfrescToUI), nextCursor }; }
  }
}
