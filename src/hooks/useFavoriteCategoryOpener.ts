import { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { getMeta } from '../constants/categoryMeta';
import { fetchCategories, type N1Category } from '../api/mercadona';
import {
  fetchBonpreuCategoryTree, fetchCarrefourCategoryTree, fetchBonareaCategoryTree,
  fetchConsumCategoryTree, fetchDiaCategoryTree, fetchSorliCategoryTree,
  fetchEroskiCategoryTree, fetchCapraboCategoryTree, fetchCondisCategoryTree,
  fetchAmetllerCategoryTree, fetchAldiCategoryTree, fetchLidlCategoryTree, fetchHiperdinoCategoryTree,
  fetchAlcampoCategoryTree, fetchPlusfrescCategoryTree, fetchGadisCategoryTree, fetchFroizCategoryTree, fetchAhorramasCategoryTree,
} from '../api/catalog';
import { useFavorites } from '../context/FavoritesContext';
import { useProfile } from '../context/ProfileContext';
import type { CatalogStore } from '../constants/stores';
import type { FavoriteCategory } from '../types';

// Árbol de subcategorías (N1→N2) normalizado para navegar desde un favorito.
type MirrorTree = { id: string; name: string; children: { id: string; name: string }[] }[];

type MirrorFetcherStore = Exclude<CatalogStore, 'mercadona' | 'lidl'>;
const TREE_FETCHERS: Record<MirrorFetcherStore, () => Promise<MirrorTree>> = {
  esclat: fetchBonpreuCategoryTree,
  carrefour: fetchCarrefourCategoryTree,
  bonarea: fetchBonareaCategoryTree,
  consum: fetchConsumCategoryTree,
  dia: fetchDiaCategoryTree,
  sorli: fetchSorliCategoryTree,
  eroski: fetchEroskiCategoryTree,
  caprabo: fetchCapraboCategoryTree,
  condis: fetchCondisCategoryTree,
  ametller: fetchAmetllerCategoryTree,
  aldi: fetchAldiCategoryTree,
  hiperdino: fetchHiperdinoCategoryTree,
  alcampo: fetchAlcampoCategoryTree,
  plusfresc: fetchPlusfrescCategoryTree,
  gadis: fetchGadisCategoryTree,
  froiz: fetchFroizCategoryTree,
  ahorramas: fetchAhorramasCategoryTree,
};

/**
 * Lógica compartida (Inicio y Favoritos) para abrir las subcategorías de una
 * categoría favorita de cualquier súper. Carga las categorías N1 de Mercadona y
 * hace prefetch perezoso del árbol de los espejos que tengan alguna categoría
 * favorita, para poder navegar al tocarla. Expone también `liveCategories` y
 * `goToMercadonaCategory` para los chips de Mercadona del Inicio.
 */
export function useFavoriteCategoryOpener() {
  const navigation = useNavigation<any>();
  const { categories: favCategories } = useFavorites();
  const { profile } = useProfile();
  const [liveCategories, setLiveCategories] = useState<N1Category[]>([]);
  const [trees, setTrees] = useState<Partial<Record<CatalogStore, MirrorTree>>>({});

  // Categorías reales de Mercadona (una vez).
  useEffect(() => {
    fetchCategories().then(setLiveCategories).catch(() => {});
  }, []);

  useEffect(() => {
    setTrees((current) => current.lidl === undefined
      ? current
      : { ...current, lidl: undefined });
  }, [profile?.lidlStoreId]);

  // Prefetch del árbol de los súpers (no-Mercadona) que tengan alguna categoría favorita.
  useEffect(() => {
    const pending = [...new Set(favCategories.map((c) => c.store))]
      .filter((s): s is Exclude<CatalogStore, 'mercadona'> => s !== 'mercadona' && !trees[s]);
    pending.forEach((s) => {
      const request = s === 'lidl'
        ? fetchLidlCategoryTree(profile?.lidlStoreId ?? null)
        : TREE_FETCHERS[s]();
      request.then((tree) => setTrees((prev) => ({ ...prev, [s]: tree }))).catch(() => {});
    });
  }, [favCategories, trees, profile?.lidlStoreId]);

  const goToMercadonaCategory = (cat: N1Category) => {
    const { emoji, color } = getMeta(cat.name);
    navigation.navigate('Catalog', {
      screen: 'SubCategory',
      params: { categoryName: cat.name, emoji, color, subcategories: cat.categories },
    });
  };

  // Navega a las subcategorías de una categoría favorita de cualquier súper.
  const openFavCategory = (fav: FavoriteCategory) => {
    if (fav.store === 'mercadona') {
      const cat = liveCategories.find((c) => String(c.id) === fav.refId);
      if (cat) return goToMercadonaCategory(cat);
    } else {
      const node = trees[fav.store]?.find((n) => n.id === fav.refId);
      if (node) {
        if (fav.store === 'lidl' && node.children.length === 1 && node.children[0].id === node.id) {
          return navigation.navigate('Catalog', {
            screen: 'LidlProducts',
            params: { categoryId: node.id, categoryName: node.name },
          });
        }
        const { emoji, color } = getMeta(node.name);
        return navigation.navigate('Catalog', {
          screen: 'SubCategory',
          params: { categoryName: node.name, emoji, color, subcategories: node.children, retailer: fav.store },
        });
      }
    }
    // Árbol aún no cargado (o no encontrada) → abre el catálogo.
    navigation.navigate('Catalog');
  };

  return { liveCategories, goToMercadonaCategory, openFavCategory };
}
