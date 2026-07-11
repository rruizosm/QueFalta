import { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { getMeta } from '../constants/categoryMeta';
import { fetchCategories, type N1Category } from '../api/mercadona';
import {
  fetchBonpreuCategoryTree, fetchCarrefourCategoryTree, fetchBonareaCategoryTree,
  fetchConsumCategoryTree, fetchDiaCategoryTree, fetchSorliCategoryTree,
  fetchEroskiCategoryTree, fetchCapraboCategoryTree,
} from '../api/catalog';
import { useFavorites } from '../context/FavoritesContext';
import type { CatalogStore } from '../constants/stores';
import type { FavoriteCategory } from '../types';

// Árbol de subcategorías (N1→N2) normalizado para navegar desde un favorito.
type MirrorTree = { id: string; name: string; children: { id: string; name: string }[] }[];

const TREE_FETCHERS: Record<Exclude<CatalogStore, 'mercadona'>, () => Promise<MirrorTree>> = {
  esclat: fetchBonpreuCategoryTree,
  carrefour: fetchCarrefourCategoryTree,
  bonarea: fetchBonareaCategoryTree,
  consum: fetchConsumCategoryTree,
  dia: fetchDiaCategoryTree,
  sorli: fetchSorliCategoryTree,
  eroski: fetchEroskiCategoryTree,
  caprabo: fetchCapraboCategoryTree,
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
  const [liveCategories, setLiveCategories] = useState<N1Category[]>([]);
  const [trees, setTrees] = useState<Partial<Record<CatalogStore, MirrorTree>>>({});

  // Categorías reales de Mercadona (una vez).
  useEffect(() => {
    fetchCategories().then(setLiveCategories).catch(() => {});
  }, []);

  // Prefetch del árbol de los súpers (no-Mercadona) que tengan alguna categoría favorita.
  useEffect(() => {
    const pending = [...new Set(favCategories.map((c) => c.store))]
      .filter((s): s is Exclude<CatalogStore, 'mercadona'> => s !== 'mercadona' && !trees[s]);
    pending.forEach((s) => {
      TREE_FETCHERS[s]().then((tree) => setTrees((prev) => ({ ...prev, [s]: tree }))).catch(() => {});
    });
  }, [favCategories]);

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
