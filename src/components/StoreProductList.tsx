import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Dimensions, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useFavorites } from '../context/FavoritesContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import type { UIProduct } from '../lib/productAdapters';
import { CATALOG_STORES } from '../constants/stores';
import { sortByName, sortByRelevance } from '../lib/sort';
import QuantityStepper from './QuantityStepper';
import ProductImage from './ProductImage';
import ViewModeToggle, { type ViewMode } from './ViewModeToggle';
import ProductGridCard from './ProductGridCard';
import StoreProductModal, { type ProductRef } from './StoreProductModal';
import GlassSurface from './GlassSurface';

// Cuadrícula: 3 por fila (idéntica a las subcategorías).
const GRID_COLS = 3;
const GRID_GAP = 8;
const CARD_W = (Dimensions.get('window').width - 32 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

// Misma normalización que la búsqueda del catálogo (NFD + quitar diacríticos +
// minúsculas) para que el filtro local sea insensible a acentos y mayúsculas.
const stripAccents = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

interface Props {
  /** Productos ya normalizados (de cualquier súper, mezclables). */
  products: UIProduct[];
  loading?: boolean;
  error?: boolean;
  emptyText?: string;
  errorText?: string;
  /** Emoji de la categoría (placeholder de imagen + categoría al añadir al carrito). */
  emoji?: string;
  /** Muestra un buscador por texto en la barra superior que filtra la lista
   *  localmente por nombre (insensible a acentos). Para vistas de subcategoría. */
  searchable?: boolean;
  /** Texto de búsqueda EXTERNO (catálogo): el padre busca en el servidor y pasa
   *  aquí la consulta para que los resultados (ya filtrados) se ordenen por
   *  RELEVANCIA respecto a ella en vez de alfabéticamente. La búsqueda interna
   *  (`searchable`) usa su propio texto. Sin consulta, el orden es alfabético. */
  searchQuery?: string;
  /** Oculta el toolbar interno (buscador + toggle). Úsalo cuando el padre ya
   *  renderiza su propia fila de búsqueda/cambio de vista (p. ej. el catálogo,
   *  cuya barra de búsqueda consulta al servidor y debe vivir fuera). */
  hideToolbar?: boolean;
  /** View mode controlado desde el padre (junto con onViewModeChange). Si se
   *  omite, el componente gestiona su propio estado interno. */
  viewMode?: ViewMode;
  onViewModeChange?: (m: ViewMode) => void;
  /** Paginación LOCAL: si se define, la lista (ya cargada en memoria, p. ej.
   *  favoritos) se pinta de `pageSize` en `pageSize`, revelando más al llegar al
   *  final, sin tocar red. El filtro de búsqueda se aplica antes de la ventana. */
  pageSize?: number;
  /** Paginación SERVER: se llama al llegar al final para que el padre cargue la
   *  siguiente página (catálogo). `loadingMore` pinta el spinner de pie. */
  onEndReached?: () => void;
  loadingMore?: boolean;
  /** Mantiene el orden en que llegan los `products` (p. ej. cambios de precio
   *  ordenados por % en el servidor, o las novedades curadas de Mercadona) en
   *  vez de reordenar alfabéticamente/por relevancia. El buscador interno
   *  sigue filtrando, solo se omite la reordenación. */
  keepOrder?: boolean;
  /** Altura del chrome flotante de cristal de la pantalla (F3, solo glass):
   *  se suma al paddingTop del CONTENIDO scrolleable —la lista arranca bajo el
   *  chrome y al hacer scroll se refracta tras él— y desplaza los estados de
   *  carga/error en la misma medida. Úsalo junto con `hideToolbar`: el toolbar
   *  interno va en flujo y quedaría oculto debajo del cristal. 0 = como hoy. */
  topInset?: number;
  /** Redondea las tarjetas de lista y cuadrícula en superficies principales. */
  roundedCards?: boolean;
  /** Etiqueta común que se muestra en todas las tarjetas de esta vista. */
  badgeLabel?: string;
  /** Permite al padre reaccionar al inicio del desplazamiento de productos. */
  onScrollBeginDrag?: () => void;
  showStoreLogo?: boolean;
}

/** Lista de productos reutilizable (subcategorías y búsqueda): imagen, stepper +
 *  barra "Añadir", swipe→favorito (consciente del súper) y toggle lista/cuadrícula.
 *  El detalle se delega en StoreProductModal, que abre el modal correcto por súper. */
export default function StoreProductList({
  products, loading = false, error = false,
  emptyText, errorText,
  emoji, searchable = false, searchQuery,
  hideToolbar = false, viewMode: viewModeProp, onViewModeChange,
  pageSize, onEndReached, loadingMore = false, keepOrder = false,
  topInset = 0, roundedCards = false, badgeLabel, onScrollBeginDrag,
  showStoreLogo = false,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  // Con tab bar de cristal: eleva la barra "Añadir" (cartBar) por encima del
  // cristal y agranda el paddingBottom de lista/cuadrícula en la misma medida.
  const tabBarOffset = useTabBarBottomPadding(0);
  const bottomPad = 110 + tabBarOffset;
  const { t } = useTranslation();
  const emptyLabel = emptyText ?? t('product.emptyDefault');
  const errorLabel = errorText ?? t('product.errorDefault');
  const { activeCart, addToActiveCart } = useCart();
  const toast = useToast();
  const { products: favList, isProductFavorite, toggleProductFavorite } = useFavorites();
  // clearOnUnmount: al desmontarse la lista (p. ej. el catálogo cambia a su
  // spinner de carga y NO monta StoreProductList) se quita el ancla, para que el
  // spotlight/chevron no queden en la posición del producto de la lista anterior.

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  // View mode: controlado por el padre si pasa viewMode/onViewModeChange (catálogo),
  // o estado interno propio en el resto de pantallas.
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>('list');
  const viewMode = viewModeProp ?? internalViewMode;
  const setViewMode = onViewModeChange ?? setInternalViewMode;
  const [detail, setDetail] = useState<ProductRef | null>(null);
  const [query, setQuery] = useState('');

  // Filtro local por nombre: exige que todas las palabras (≥2 letras) aparezcan,
  // en cualquier orden, igual que la búsqueda del catálogo. Filtra solo lo que se
  // pinta: las cantidades y el contador del carrito siguen sobre `products` para
  // no perder selecciones cuando la búsqueda oculta filas.
  const shown = useMemo(() => {
    // Filtro local SOLO del buscador interno (subcategorías/favoritos); el catálogo
    // ya filtra en el servidor, así que ahí `query` está vacío y no recorta nada.
    const words = stripAccents(query).trim().split(/\s+/).filter((w) => w.length >= 2);
    const filtered = words.length === 0
      ? products
      : products.filter((p) => {
          const name = stripAccents(p.name);
          return words.every((w) => name.includes(w));
        });
    // keepOrder: el padre ya trae los productos en un orden con significado
    // (p. ej. cambios de precio por %) → se respeta tal cual.
    if (keepOrder) return filtered;
    // Con una consulta activa (la interna del buscador o la externa del catálogo)
    // se ordena por RELEVANCIA —exacto › empieza por › palabra entera › posición—;
    // sin texto (navegación/subcategoría) se mantiene el alfabético de siempre.
    const rankQuery = (searchQuery ?? query).trim();
    return rankQuery.length >= 2
      ? sortByRelevance(filtered, (p) => p.name, rankQuery)
      : sortByName(filtered, (p) => p.name);
  }, [products, query, searchQuery, keepOrder]);

  // Ventana local (paginación de favoritos): se pinta solo lo revelado y crece
  // de `pageSize` en `pageSize` al hacer scroll. Sin `pageSize`, se pinta todo
  // (el catálogo pagina en el padre vía onEndReached). Se reinicia al cambiar la
  // búsqueda o el conjunto de productos (p. ej. cambio de súper en favoritos).
  const [visibleCount, setVisibleCount] = useState(pageSize ?? Infinity);
  useEffect(() => {
    if (pageSize != null) setVisibleCount(pageSize);
  }, [pageSize, query, searchQuery, products]);
  const visible = pageSize != null ? shown.slice(0, visibleCount) : shown;

  const handleEndReached = () => {
    if (pageSize != null && visibleCount < shown.length) {
      setVisibleCount((c) => c + pageSize); // revela más de lo ya cargado
    } else {
      onEndReached?.();                       // pide más al padre (catálogo)
    }
  };

  const listFooter = loadingMore
    ? <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 16 }} />
    : null;

  const increment = (id: string) => setQuantities((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }));
  const decrement = (id: string) => setQuantities((p) => ({ ...p, [id]: Math.max(0, (p[id] ?? 0) - 1) }));
  // Suma solo sobre los productos visibles: en la búsqueda el componente persiste
  // entre consultas, así que ignoramos cantidades stale de resultados anteriores.
  const cartCount = products.reduce((n, p) => n + (quantities[p.id] ?? 0), 0);

  const handleAddToCart = async () => {
    if (!activeCart) {
      Alert.alert(t('product.noCartTitle'), t('product.noCartMsg'));
      return;
    }
    const items = products
      .filter((p) => (quantities[p.id] ?? 0) > 0)
      .map((p) => ({
        productName: p.name,
        quantity: quantities[p.id],
        unit: 'ud',
        categoryEmoji: emoji ?? null,
        categoryName: p.categoryName,
        // La tienda de la Lista se deduce del id de Mercadona o del dominio de la imagen.
        mercadonaProductId: p.store === 'mercadona' ? p.id : null,
        // Id del producto en su súper, para abrir su ficha desde la cesta.
        storeProductId: p.id,
        unitPrice: p.unitPrice,
        imageUrl: p.imageUrl,
      }));
    if (items.length === 0) return;
    setAdding(true);
    try {
      const count = items.reduce((a, b) => a + b.quantity, 0);
      await addToActiveCart(items);
      setQuantities({});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t(count === 1 ? 'product.addedOne' : 'product.addedMany', { n: count, group: activeCart.groupName }));
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show(t('product.addError'), 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleSwipeFav = async (p: UIProduct) => {
    try {
      const added = await toggleProductFavorite({
        store: p.store,
        refId: p.id,
        name: p.name,
        imageUrl: p.imageUrl,
        price: p.unitPrice != null ? String(p.unitPrice) : null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(added ? t('product.favAdded') : t('product.favRemoved'));
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show(t('product.favError'), 'error');
    }
  };

  const renderFavAction = () => (
    <View style={styles.swipeAction}>
      <Ionicons name="star" size={22} color={colors.white} />
    </View>
  );

  const renderGridItem = ({ item }: { item: UIProduct }) => (
    <ProductGridCard
      width={CARD_W}
      uri={item.imageUrl}
      name={item.name}
      price={item.priceLabel}
      priceChange={item.priceChange ? {
        prevLabel: item.priceChange.prevLabel,
        direction: item.priceChange.direction,
      } : null}
      emoji={emoji}
      rounded={roundedCards}
      badgeLabel={badgeLabel}
      offerTag={item.offerTag}
      storeLogo={showStoreLogo ? CATALOG_STORES.find((store) => store.key === item.store)?.icon : null}
      onPress={() => setDetail({ store: item.store, id: item.id })}
    />
  );

  const renderItem = ({ item, index }: { item: UIProduct; index: number }) => {
    const qty = quantities[item.id] ?? 0;
    const active = qty > 0;
    const fav = isProductFavorite(item.store, item.id);
    const stepper = (
      <QuantityStepper
        vertical
        value={qty}
        onIncrement={() => increment(item.id)}
        onDecrement={() => decrement(item.id)}
      />
    );
    return (
      <Swipeable
        friction={1}
        leftThreshold={48}
        overshootFriction={8}
        renderLeftActions={renderFavAction}
        onSwipeableOpen={(direction, swipeable) => {
          if (direction === 'left') {
            handleSwipeFav(item);
            swipeable.close();
          }
        }}
      >
        <GlassSurface
          style={[styles.row, roundedCards && styles.rowRounded, active && styles.rowActive]}
          tintColor={active ? colors.accentLight : undefined}
          fallbackColor={active ? colors.accentLight : colors.white}
        >
          {fav && <View style={styles.favBar} />}
          {showStoreLogo && (
            <View style={styles.storeLogoBadge} pointerEvents="none">
              <Image
                source={CATALOG_STORES.find((store) => store.key === item.store)?.icon ?? undefined}
                style={styles.storeLogo}
                resizeMode="contain"
              />
            </View>
          )}
          <TouchableOpacity activeOpacity={0.7} onPress={() => setDetail({ store: item.store, id: item.id })}>
            {item.imageUrl ? (
              <ProductImage uri={item.imageUrl} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                {emoji ? <Text style={{ fontSize: 22 }}>{emoji}</Text> : <Ionicons name="image-outline" size={22} color={colors.inkFaint} />}
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.info}>
            {badgeLabel ? (
              <View style={styles.newTag}>
                <Text style={styles.newTagText}>{badgeLabel}</Text>
              </View>
            ) : null}
            {/* Tipo de oferta resaltado en rojo, ARRIBA del nombre (Ofertas). */}
            {item.offerTag ? (
              <View style={styles.offerTag}>
                <Ionicons name="pricetag" size={10} color={colors.white} />
                <Text style={styles.offerTagText} numberOfLines={1}>{item.offerTag}</Text>
              </View>
            ) : null}
            <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
            {/* Precio destacado y, debajo, una línea gris "tamaño · €/unidad". La
                2ª línea dispone de todo el ancho, así que nada se trunca (a
                diferencia de tres columnas peleando por el hueco bajo el nombre).
                Con priceChange (Cambios de precios) la línea de precio pasa a
                "anterior tachado · actual en verde/rojo · (%)". */}
            {item.priceChange ? (
              <View style={styles.changeRow}>
                <Text style={styles.changePrev}>{item.priceChange.prevLabel}</Text>
                <Text style={[styles.changePrice, { color: item.priceChange.direction === 'down' ? colors.ok : colors.red }]}>
                  {item.priceLabel}
                </Text>
                <Text style={[styles.changePct, { color: item.priceChange.direction === 'down' ? colors.ok : colors.red }]}>
                  ({item.priceChange.pctLabel})
                </Text>
              </View>
            ) : item.priceLabel ? <Text style={styles.price}>{item.priceLabel}</Text> : null}
            {(item.metaLabel || item.pricePerUnitLabel) ? (
              <Text style={styles.sub} numberOfLines={1}>
                {[item.metaLabel, item.pricePerUnitLabel].filter(Boolean).join('  ·  ')}
              </Text>
            ) : null}
          </View>
          {stepper}
        </GlassSurface>
      </Swipeable>
    );
  };

  const emptyNode = (
    <View style={styles.center}>
      <Text style={styles.emptyText}>
        {query.trim().length > 0 ? t('product.noSearchResults', { query: query.trim() }) : emptyLabel}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {!hideToolbar && (
        <View style={styles.toolbar}>
          {searchable && (
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={17} color={colors.inkSoft} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('product.searchPlaceholder')}
                placeholderTextColor={colors.inkFaint}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                autoCorrect={false}
                clearButtonMode="never"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={17} color={colors.inkFaint} />
                </TouchableOpacity>
              )}
            </View>
          )}
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + topInset }} />
      ) : error ? (
        <View style={[styles.center, topInset > 0 && { marginTop: topInset }]}><Text style={styles.emptyText}>{errorLabel}</Text></View>
      ) : viewMode === 'grid' ? (
        <FlatList
          key="grid"
          data={visible}
          keyExtractor={(item) => `${item.store}:${item.id}`}
          numColumns={GRID_COLS}
          renderItem={renderGridItem}
          extraData={favList}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[styles.gridContent, { paddingBottom: bottomPad, paddingTop: 4 + topInset }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // El cambio de numColumns obliga a FlatList a reconstruir la lista.
          // Mantener una ventana pequeña y repartir el trabajo evita bloquear
          // el hilo JS mientras la píldora del selector termina su animación.
          removeClippedSubviews
          initialNumToRender={GRID_COLS * 3}
          maxToRenderPerBatch={GRID_COLS * 2}
          updateCellsBatchingPeriod={40}
          windowSize={5}
          onScrollBeginDrag={onScrollBeginDrag}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={listFooter}
          ListEmptyComponent={emptyNode}
        />
      ) : (
        <FlatList
          key="list"
          data={visible}
          keyExtractor={(item) => `${item.store}:${item.id}`}
          renderItem={renderItem}
          extraData={favList}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + topInset }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          removeClippedSubviews
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={40}
          windowSize={5}
          onScrollBeginDrag={onScrollBeginDrag}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={listFooter}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={emptyNode}
        />
      )}

      {cartCount > 0 && (
        <View style={[styles.cartBar, { bottom: tabBarOffset }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cartLabel}>
              {t(cartCount === 1 ? 'product.selectedOne' : 'product.selectedMany', { n: cartCount })}
            </Text>
            <Text style={styles.cartTarget} numberOfLines={1}>
              {activeCart ? t('product.toGroup', { group: activeCart.groupName }) : t('product.noCartTitle')}
            </Text>
          </View>
          <TouchableOpacity style={styles.cartBtn} onPress={handleAddToCart} disabled={adding}>
              {adding ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.cartBtnText}>{t('product.add')}</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.white} />
                </View>
              )}
          </TouchableOpacity>
        </View>
      )}

      <StoreProductModal
        target={detail}
        onClose={() => setDetail(null)}
        fullScreen
        badgeLabel={badgeLabel}
      />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1 },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 10, paddingHorizontal: 16, paddingBottom: 8,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: colors.white,
    paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: {
    flex: 1, fontSize: 13.5, color: colors.ink, padding: 0,
    fontFamily: fonts.medium,
  },

  list: { paddingHorizontal: 16, paddingBottom: 110, paddingTop: 4 },
  gridRow: { gap: GRID_GAP },
  // Entre filas hay más aire que entre columnas (GRID_GAP + 10).
  gridContent: { paddingHorizontal: 16, paddingBottom: 110, paddingTop: 4, gap: GRID_GAP + 10 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, padding: 11,
    borderWidth: 1, borderColor: colors.border, gap: 12,
  },
  rowActive: { backgroundColor: colors.accentLight, borderColor: colors.accentMid },
  rowRounded: { borderRadius: 18, overflow: 'hidden' },
  favBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: colors.accent },
  storeLogoBadge: {
    position: 'absolute', top: 0, left: 0, zIndex: 2,
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  storeLogo: { width: '100%', height: '100%' },
  swipeAction: {
    flex: 1, backgroundColor: colors.accent,
    alignItems: 'flex-start', justifyContent: 'center', paddingLeft: 26,
  },
  thumb: { width: 60, height: 60, flex: 0 },
  thumbPlaceholder: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0 },
  // Etiqueta de oferta: píldora roja llamativa, sobre el nombre.
  offerTag: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.red, borderRadius: 5,
    paddingHorizontal: 7, paddingVertical: 3, marginBottom: 4,
  },
  offerTagText: {
    fontSize: 11, fontFamily: fonts.bold, color: colors.white,
    letterSpacing: 0.2, textTransform: 'uppercase',
  },
  newTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#F4C84A',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginBottom: 4,
  },
  newTagText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: 0.2,
  },
  name: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.ink, lineHeight: 18 },
  // Precio del envase, destacado.
  price: { fontSize: 15, fontFamily: fonts.bold, color: colors.accent, marginTop: 4 },
  // Cambio de precio: "anterior tachado · actual coloreado · (%)", alineado por base.
  changeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  changePrev: {
    fontSize: 12, fontFamily: fonts.semibold, color: colors.inkSoft,
    textDecorationLine: 'line-through',
  },
  changePrice: { fontSize: 16, fontFamily: fonts.bold },
  changePct: { fontSize: 11.5, fontFamily: fonts.bold },
  // Línea secundaria gris: "tamaño · €/unidad" (con todo el ancho disponible).
  sub: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },

  cartBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.ink,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 28,
  },
  cartLabel: { fontFamily: fonts.semibold, color: colors.white, fontSize: 13 },
  cartTarget: { fontFamily: fonts.medium, color: colors.accent, fontSize: 11.5, marginTop: 2 },
  cartBtn: { backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 10 },
  cartBtnText: { color: colors.white, fontFamily: fonts.bold, fontSize: 13 },
});
