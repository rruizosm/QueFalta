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
  searchLidlProducts,
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
import type { AppLanguage } from '../i18n';
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
  lidlToUI,
  gadisToUI,
  froizToUI,
  ahorramasToUI,
  hiperdinoToUI,
  alcampoToUI,
  plusfrescToUI,
  type UIProduct,
} from './productAdapters';
import { sortByRelevance } from './sort';

const BILINGUAL_CATALOG_STORES = new Set<CatalogStore>([
  'mercadona', 'esclat', 'bonarea', 'sorli', 'condis', 'ametller', 'plusfresc',
]);

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
  searchLanguage?: AppLanguage,
  lidlStoreId: string | null = null,
): Promise<UIProduct[]> {
  switch (store) {
    case 'mercadona': return (await searchProducts(query, region, limit, signal, offset, order, searchLanguage)).map((product) => mercadonaToUI(product));
    case 'esclat': return (await searchBonpreuProducts(query, limit, signal, offset, order, searchLanguage)).map(bonpreuToUI);
    case 'carrefour': return (await searchCarrefourProducts(query, region, limit, signal, offset, order)).map(carrefourToUI);
    case 'bonarea': return (await searchBonareaProducts(query, limit, signal, offset, order, searchLanguage)).map(bonareaToUI);
    case 'consum': return (await searchConsumProducts(query, region, postalCode, limit, signal, offset, order)).map(consumToUI);
    case 'dia': return (await searchDiaProducts(query, region, limit, signal, offset, order)).map(diaToUI);
    case 'sorli': return (await searchSorliProducts(query, limit, signal, offset, order, searchLanguage)).map(sorliToUI);
    case 'eroski': return (await searchEroskiProducts(query, limit, signal, offset, order)).map(eroskiToUI);
    case 'caprabo': return (await searchCapraboProducts(query, limit, signal, offset, order)).map(capraboToUI);
    case 'condis': return (await searchCondisProducts(query, limit, signal, offset, order, searchLanguage)).map(condisToUI);
    case 'ametller': return (await searchAmetllerProducts(query, limit, signal, offset, order, searchLanguage)).map(ametllerToUI);
    case 'aldi': return (await searchAldiProducts(query, limit, signal, offset, order)).map(aldiToUI);
    case 'lidl': return (await searchLidlProducts(query, limit, signal, offset, order, lidlStoreId)).map(lidlToUI);
    case 'gadis': return (await searchGadisProducts(query, limit, signal, offset, order)).map(gadisToUI);
    case 'froiz': return (await searchFroizProducts(query, limit, signal, offset, order)).map(froizToUI);
    case 'ahorramas': return (await searchAhorramasProducts(query, limit, signal, offset, order)).map(ahorramasToUI);
    case 'hiperdino': return (await searchHiperdinoProducts(query, limit, signal, offset, order)).map(hiperdinoToUI);
    case 'alcampo': return (await searchAlcampoProducts(query, limit, signal, offset, order)).map(alcampoToUI);
    case 'plusfresc': return (await searchPlusfrescProducts(query, postalCode, limit, signal, offset, order, searchLanguage)).map(plusfrescToUI);
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
  searchBothLanguages = false,
  lidlStoreId: string | null = null,
): Promise<UIProduct[]> {
  const perStoreLimit = Math.max(12, Math.ceil(limit / Math.max(stores.length, 1)) * 3);
  const searches: { store: CatalogStore; language?: AppLanguage }[] = [];
  for (const store of stores) {
    if (searchBothLanguages && BILINGUAL_CATALOG_STORES.has(store)) {
      searches.push({ store, language: 'ca' }, { store, language: 'es' });
    } else {
      searches.push({ store });
    }
  }
  const settled = await Promise.allSettled(
    searches.map(({ store, language }) => searchCatalogStore(
      store,
      query,
      region,
      postalCode,
      signal,
      perStoreLimit,
      0,
      'relevance',
      language,
      lidlStoreId,
    )),
  );

  if (signal?.aborted) throw new Error('Catalog search aborted');
  const successful = settled.filter(
    (result): result is PromiseFulfilledResult<UIProduct[]> => result.status === 'fulfilled',
  );
  if (successful.length === 0 && stores.length > 0) {
    throw new Error('All catalog searches failed');
  }

  const productsByKey = new Map<string, UIProduct>();
  for (const product of successful.flatMap((result) => result.value)) {
    productsByKey.set(`${product.store}:${product.id}`, product);
  }
  const products = [...productsByKey.values()];
  // En búsqueda bilingüe el nombre visible puede no coincidir con el idioma
  // escrito. Se conserva el ranking del servidor que encontró el término en
  // vez de volver a puntuar, por ejemplo, una consulta ES contra el nombre CA.
  return (searchBothLanguages
    ? products
    : sortByRelevance(products, (product) => product.name, query)
  ).slice(0, limit);
}
