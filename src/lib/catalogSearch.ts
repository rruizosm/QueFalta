import {
  searchProducts,
  searchBonpreuProducts,
  searchCarrefourProducts,
  searchBonareaProducts,
  searchConsumProducts,
  searchDiaProducts,
  searchSorliProducts,
  searchEroskiProducts,
  searchCapraboProducts,
  searchCondisProducts,
  searchAmetllerProducts,
  searchAldiProducts,
  searchGadisProducts,
  searchFroizProducts,
  searchAhorramasProducts,
  searchHiperdinoProducts,
  searchAlcampoProducts,
  searchPlusfrescProducts,
  type CatalogSearchOrder,
} from '../api/catalog';
import type { CatalogStore } from '../constants/stores';
import type { RegionValue } from '../constants/regions';
import {
  mercadonaToUI,
  bonpreuToUI,
  carrefourToUI,
  bonareaToUI,
  consumToUI,
  diaToUI,
  sorliToUI,
  eroskiToUI,
  capraboToUI,
  condisToUI,
  ametllerToUI,
  aldiToUI,
  gadisToUI,
  froizToUI,
  ahorramasToUI,
  hiperdinoToUI,
  alcampoToUI,
  plusfrescToUI,
  type UIProduct,
} from './productAdapters';
import { sortByRelevance } from './sort';

/** Busca productos de una tienda y normaliza las distintas formas del catálogo. */
export async function searchCatalogStore(
  store: CatalogStore,
  query: string,
  region: RegionValue | null,
  postalCode: string | null,
  signal?: AbortSignal,
  limit = 50,
  offset = 0,
  order: CatalogSearchOrder = 'relevance',
): Promise<UIProduct[]> {
  switch (store) {
    case 'mercadona': return (await searchProducts(query, region, limit, signal, offset, order)).map((product) => mercadonaToUI(product));
    case 'esclat': return (await searchBonpreuProducts(query, limit, signal, offset, order)).map(bonpreuToUI);
    case 'carrefour': return (await searchCarrefourProducts(query, region, limit, signal, offset, order)).map(carrefourToUI);
    case 'bonarea': return (await searchBonareaProducts(query, limit, signal, offset, order)).map(bonareaToUI);
    case 'consum': return (await searchConsumProducts(query, region, postalCode, limit, signal, offset, order)).map(consumToUI);
    case 'dia': return (await searchDiaProducts(query, region, limit, signal, offset, order)).map(diaToUI);
    case 'sorli': return (await searchSorliProducts(query, limit, signal, offset, order)).map(sorliToUI);
    case 'eroski': return (await searchEroskiProducts(query, limit, signal, offset, order)).map(eroskiToUI);
    case 'caprabo': return (await searchCapraboProducts(query, limit, signal, offset, order)).map(capraboToUI);
    case 'condis': return (await searchCondisProducts(query, limit, signal, offset, order)).map(condisToUI);
    case 'ametller': return (await searchAmetllerProducts(query, limit, signal, offset, order)).map(ametllerToUI);
    case 'aldi': return (await searchAldiProducts(query, limit, signal, offset, order)).map(aldiToUI);
    case 'gadis': return (await searchGadisProducts(query, limit, signal, offset, order)).map(gadisToUI);
    case 'froiz': return (await searchFroizProducts(query, limit, signal, offset, order)).map(froizToUI);
    case 'ahorramas': return (await searchAhorramasProducts(query, limit, signal, offset, order)).map(ahorramasToUI);
    case 'hiperdino': return (await searchHiperdinoProducts(query, limit, signal, offset, order)).map(hiperdinoToUI);
    case 'alcampo': return (await searchAlcampoProducts(query, limit, signal, offset, order)).map(alcampoToUI);
    case 'plusfresc': return (await searchPlusfrescProducts(query, postalCode, limit, signal, offset, order)).map(plusfrescToUI);
  }
}

/**
 * Busca en varias tiendas. Un espejo temporalmente caído no vacía los
 * resultados de los demás; solo se informa de error cuando fallan todos.
 */
export async function searchCatalogStores(
  stores: CatalogStore[],
  query: string,
  region: RegionValue | null,
  postalCode: string | null,
  signal?: AbortSignal,
  limit = 40,
): Promise<UIProduct[]> {
  const perStoreLimit = Math.max(12, Math.ceil(limit / Math.max(stores.length, 1)) * 3);
  const settled = await Promise.allSettled(
    stores.map((store) => searchCatalogStore(
      store,
      query,
      region,
      postalCode,
      signal,
      perStoreLimit,
    )),
  );

  if (signal?.aborted) throw new Error('Catalog search aborted');
  const successful = settled.filter(
    (result): result is PromiseFulfilledResult<UIProduct[]> => result.status === 'fulfilled',
  );
  if (successful.length === 0 && stores.length > 0) {
    throw new Error('All catalog searches failed');
  }

  const products = successful.flatMap((result) => result.value);
  return sortByRelevance(products, (product) => product.name, query).slice(0, limit);
}
