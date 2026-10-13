import { memo, useCallback, useContext, useMemo, useState, type RefObject } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, FlatList, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { PagerGestureContext } from '../components/bottom-tabs-pager/PagerGestureContext';
import PantryProductPicker from '../components/PantryProductPicker';
import PantryShelf from '../components/PantryShelf';
import { fetchProductMirror } from '../api/catalog';
import { fetchProduct } from '../api/mercadona';
import { useCart } from '../context/CartContext';
import PantryProductFocus from '../components/PantryProductFocus';
import StoreProductModal from '../components/StoreProductModal';
import PantryWoodBackground from '../components/PantryWoodBackground';
import PantryFridge from '../components/PantryFridge';
import SlidingSegments from '../components/SlidingSegments';
import ProductImage from '../components/ProductImage';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { usePantryLayout } from '../hooks/usePantryLayout';
import { arrangePantryItems, clampPantryPlacement, findPantryPlacement, pantryShelfIndex,
  type PantryItem, type PantryPlacement, type PantryProduct, type PantrySection } from '../lib/pantryLayout';

export default function PantryScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  // Synchronous account isolation, before any asynchronous storage reads run.
  return <PantryScreenContent key={userId ?? 'signed-out'} userId={userId} />;
}

export function PantryScreenContent({ userId }: { userId: string | null }) {
  const styles = useThemedStyles(themedStyles);
  const { scheme } = useTheme();
  const { t } = useTranslation();
  const { activeCart, addToActiveCart } = useCart();
  const insets = useSafeAreaInsets();
  const bottomPadding = useTabBarBottomPadding(16);
  // Stable, independent stores: switching tabs never rehydrates one section into the other.
  const pantry = usePantryLayout(userId, 'pantry');
  const fridge = usePantryLayout(userId, 'fridge');
  const [section, setSection] = useState<PantrySection>('pantry');
  const { items, shelfCount, ready, loadError, saveError, update, retryLoad, retrySave } = section === 'pantry' ? pantry : fridge;
  const [fridgeVisited, setFridgeVisited] = useState(false);
  const [view, setView] = useState<'cupboard' | 'list'>('cupboard');
  const [listVisited, setListVisited] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [addAt, setAddAt] = useState<{ section: PantrySection; placement: PantryPlacement } | null>(null);
  const [selection, setSelection] = useState<{ section: PantrySection; id: string; sourceRef?: RefObject<View | null> } | null>(null);
  const [sourceHidden, setSourceHidden] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const select = useCallback((id: string, sourceRef?: RefObject<View | null>) => {
    setSourceHidden(false);
    setSelection({ section: 'pantry', id, sourceRef });
  }, []);
  const selectFridge = useCallback((id: string, sourceRef?: RefObject<View | null>) => {
    setSourceHidden(false);
    setSelection({ section: 'fridge', id, sourceRef });
  }, []);
  const closeFocus = useCallback(() => { setDetailOpen(false); setSelection(null); setSourceHidden(false); }, []);
  const hideSource = useCallback(() => setSourceHidden(true), []);
  const [noSpace, setNoSpace] = useState<PantrySection | null>(null);
  const pantryScene = useMemo(() => arrangePantryItems(pantry.items, pantry.shelfCount), [pantry.items, pantry.shelfCount]);
  const fridgeScene = useMemo(() => arrangePantryItems(fridge.items, fridge.shelfCount), [fridge.items, fridge.shelfCount]);
  const { placed, unplaced } = section === 'pantry' ? pantryScene : fridgeScene;
  const place = usePlaceProduct(pantry, 'pantry', setNoSpace);
  const placeFridge = usePlaceProduct(fridge, 'fridge', setNoSpace);
  const pager = useContext(PagerGestureContext);
  const scrollGesture = useMemo(() => {
    const native = Gesture.Native();
    return pager ? native.requireExternalGestureToFail(pager) : native;
  }, [pager]);
  const listScrollGesture = useMemo(() => {
    const native = Gesture.Native();
    return pager ? native.requireExternalGestureToFail(pager) : native;
  }, [pager]);
  const listItems = useMemo(() => [...pantryScene.placed, ...pantryScene.unplaced], [pantryScene]);
  const pantryPlacedIds = useMemo(() => new Set(pantryScene.placed.map((item) => item.instanceId)), [pantryScene.placed]);
  const placedIds = useMemo(() => new Set(placed.map((item) => item.instanceId)), [placed]);
  const changeView = useCallback((next: 'cupboard' | 'list') => {
    closeFocus();
    if (next === 'list') setListVisited(true);
    setView(next);
  }, [closeFocus]);
  const renderListItem = useCallback(({ item }: { item: PantryItem }) => <PantryListRow
    item={item} onSelect={select}
    location={pantryPlacedIds.has(item.instanceId)
      ? t('pantry.shelfLocation', { number: pantryShelfIndex(item, pantry.shelfCount) + 1 })
      : t('pantry.pendingLocation')} />, [pantryPlacedIds, pantry.shelfCount, select, t]);
  const selected = selection?.section === section ? items.find((item) => item.instanceId === selection.id) : undefined;
  const finishSelected = () => {
    if (!selected) return;
    update((previous) => previous.filter((item) => item.instanceId !== selected.instanceId));
    closeFocus();
    setNoSpace(null);
  };
  const addSelectedToCart = async () => {
    if (!selected) return;
    if (!activeCart) throw new Error(t('product.noCartMsg'));
    try {
      const mirror = await fetchProductMirror(selected.product.id);
      const product = await fetchProduct(selected.product.id, mirror.wh ?? undefined);
      const price = Number.parseFloat(product.price_instructions?.unit_price ?? '');
      await addToActiveCart([{
        storeKey: 'mercadona', productName: product.display_name, quantity: 1, unit: 'ud',
        categoryName: product.categories?.[0]?.name ?? mirror.categoryName ?? null,
        unitPrice: Number.isFinite(price) ? price : null,
        imageUrl: product.thumbnail ?? selected.product.illustrationUrl,
        mercadonaProductId: product.id, storeProductId: product.id,
      }]);
    } catch {
      throw new Error(t('product.addErrorSingle'));
    }
  };
  const openSearch = useCallback((placement: PantryPlacement) => {
    setAddAt({ section: 'pantry', placement });
    setNoSpace(null);
    setSearchOpen(true);
  }, []);
  const openFridgeSearch = useCallback((placement: PantryPlacement) => {
    setAddAt({ section: 'fridge', placement });
    setNoSpace(null);
    setSearchOpen(true);
  }, []);
  const add = (product: PantryProduct) => {
    if (!addAt || addAt.section !== section) return;
    const instanceId = `${product.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    update((previous) => {
      const { placed: shelf, unplaced: pending } = arrangePantryItems(previous, shelfCount);
      const placement = findPantryPlacement(addAt.placement, shelf, shelfCount);
      setNoSpace(placement ? null : section);
      if (!placement) return previous;
      return [...shelf, { instanceId, product, ...placement }, ...pending];
    });
    setSearchOpen(false);
    setAddAt(null);
    Keyboard.dismiss();
  };
  const viewSelector = <SlidingSegments style={styles.viewSelector} compact emphasized transparentTrack={Platform.OS === 'android'}
      segments={[
        { key: 'cupboard', accessibilityLabel: t('pantry.cupboardView'), icon: 'file-tray-stacked-outline' },
        { key: 'list', accessibilityLabel: t('pantry.listView'), icon: 'list-outline' },
      ]} value={view} onChange={changeView} />;
  const status = <>
    {!ready && !loadError && <ActivityIndicator color={colors.accent} accessibilityLabel={t('common.loading')} />}
    {loadError && <Pressable onPress={retryLoad} style={styles.error} accessibilityRole="button">
      <Text style={styles.errorText}>{t(section === 'fridge' ? 'pantry.fridgeLoadError' : 'pantry.loadError')} · {t('common.retry')}</Text>
    </Pressable>}
    {saveError && <Pressable onPress={retrySave} style={styles.error} accessibilityRole="button">
      <Text style={styles.errorText}>{t('pantry.saveError')} · {t('common.retry')}</Text>
    </Pressable>}
    {noSpace === section && <Text testID="pantry-no-space" accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={[styles.error, styles.errorText]}>{t('pantry.noSpace')}</Text>}
  </>;
  const pendingProducts = unplaced.length > 0 && <View style={styles.error} testID={`${section}-unplaced`}>
    <Text style={styles.info}>{t('pantry.unplacedHint')}</Text>
    {unplaced.map((item) => <Pressable key={item.instanceId} accessibilityRole="button"
      accessibilityLabel={t('pantry.editUnplaced', { name: item.product.name })}
      onPress={() => { (section === 'pantry' ? select : selectFridge)(item.instanceId); setNoSpace(null); }} style={styles.pendingProduct}>
      <Text style={styles.pendingProductName}>{item.product.name}</Text>
      <Ionicons name="cube-outline" size={22} color={colors.accent} />
    </Pressable>)}
  </View>;
  const cupboardVisible = section === 'pantry' && view === 'cupboard';
  const listVisible = section === 'pantry' && view === 'list';
  const headerColors = section === 'fridge'
    ? { backgroundColor: scheme === 'dark' ? '#203F56' : '#DDEEF8',
      borderBottomColor: scheme === 'dark' ? '#456B84' : '#B8D7E9' }
    : { backgroundColor: scheme === 'dark' ? '#49392D' : '#E8D7C3',
      borderBottomColor: scheme === 'dark' ? '#66503E' : '#CEB698' };
  return (
    <View testID="pantry-screen" style={styles.container}>
      <View testID="pantry-header" style={[styles.header, { paddingTop: insets.top + 4,
        ...headerColors }]}>
        <View style={styles.headerControls}>
          <SlidingSegments
            style={styles.sectionSelector}
            emphasized
            opaqueSelection={section === 'fridge' && scheme === 'dark'}
            transparentTrack={Platform.OS === 'android'}
            segments={[
              { key: 'pantry', label: t('pantry.title'), icon: 'file-tray-stacked-outline' },
              { key: 'fridge', label: t('pantry.fridge'), icon: 'snow-outline' },
            ]}
            value={section}
            onChange={(next) => {
              closeFocus();
              setSearchOpen(false);
              setAddAt(null);
              setNoSpace(null);
              if (next === 'fridge') setFridgeVisited(true);
              setSection(next);
            }}
          />
          {section === 'pantry' && viewSelector}
        </View>
      </View>
      <View style={styles.body}>
        {/* Preserve the native images, SVG boards, gestures and scroll offset across view changes. */}
        <View testID="pantry-cupboard" style={[styles.viewLayer, !cupboardVisible && styles.hiddenView]}
          pointerEvents={cupboardVisible ? 'auto' : 'none'} accessibilityElementsHidden={!cupboardVisible}
          importantForAccessibility={cupboardVisible ? 'auto' : 'no-hide-descendants'}>
          <PantryWoodBackground />
          <GestureDetector gesture={scrollGesture}><ScrollView style={styles.body}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, { paddingBottom: bottomPadding + 16 }]}>
            <PantryShelf items={pantryScene.placed} shelfCount={pantry.shelfCount}
              selectedId={selection?.section === 'pantry' ? selection.id : null}
              hiddenId={sourceHidden && selection?.section === 'pantry' ? selection.id : null} onSelect={select} onPlace={place}
              onAddAt={openSearch} canAdd={pantry.ready} scrollGesture={scrollGesture} />
            <Pressable disabled={!pantry.ready} testID="pantry-add-shelf"
              accessibilityRole="button" accessibilityLabel={t('pantry.addShelf')}
              accessibilityState={{ disabled: !pantry.ready }}
              onPress={() => { pantry.addShelf(); setNoSpace(null); }}
              style={({ pressed }) => [styles.addShelfButton, (!pantry.ready || pressed) && styles.pressed]}>
              <Ionicons name="add" size={22} color="#FFF4E3" />
              <Text style={styles.addShelfLabel}>{t('pantry.addShelf')}</Text>
            </Pressable>
            {section === 'pantry' && <>{status}{pendingProducts}</>}
          </ScrollView></GestureDetector>
        </View>
        {listVisited && <View testID="pantry-list-view" style={[styles.viewLayer, !listVisible && styles.hiddenView]}
          pointerEvents={listVisible ? 'auto' : 'none'} accessibilityElementsHidden={!listVisible}
          importantForAccessibility={listVisible ? 'auto' : 'no-hide-descendants'}>
          <GestureDetector gesture={listScrollGesture}><FlatList testID="pantry-list" style={styles.body}
            data={listItems} keyExtractor={pantryItemKey} renderItem={renderListItem}
            initialNumToRender={10} maxToRenderPerBatch={8} windowSize={5}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, styles.productList, { paddingBottom: bottomPadding + 16 }]}
            ListFooterComponent={section === 'pantry' ? status : null}
            ListEmptyComponent={pantry.ready ? <Text style={styles.emptyList}>{t('pantry.emptyList')}</Text> : null} />
          </GestureDetector>
        </View>}
        {fridgeVisited && <View testID="pantry-fridge" style={[styles.viewLayer, section !== 'fridge' && styles.hiddenView]}
          pointerEvents={section === 'fridge' ? 'auto' : 'none'} accessibilityElementsHidden={section !== 'fridge'}
          importantForAccessibility={section === 'fridge' ? 'auto' : 'no-hide-descendants'}>
          <PantryFridge bottomPadding={bottomPadding} items={fridgeScene.placed} shelfCount={fridge.shelfCount}
            selectedId={selection?.section === 'fridge' ? selection.id : null}
            hiddenId={sourceHidden && selection?.section === 'fridge' ? selection.id : null}
            onSelect={selectFridge} onPlace={placeFridge} onAddAt={openFridgeSearch} canAdd={fridge.ready}
            onAddShelf={() => { fridge.addShelf(); setNoSpace(null); }}
            footer={section === 'fridge' ? <>{status}{pendingProducts}</> : null} />
        </View>}
      </View>
      {selected && !searchOpen && <PantryProductFocus key={selected.instanceId}
        product={selected.product} sourceRef={selection?.sourceRef}
        section={section}
        location={placedIds.has(selected.instanceId)
          ? t('pantry.shelfLocation', { number: pantryShelfIndex(selected, shelfCount) + 1 })
          : t('pantry.pendingLocation')}
        onFinish={finishSelected} onAddToCart={addSelectedToCart} onShowDetails={() => setDetailOpen(true)}
        onReady={hideSource} onClose={closeFocus} />}
      <StoreProductModal target={detailOpen && selected
        ? { store: 'mercadona', id: selected.product.id }
        : null} onClose={() => setDetailOpen(false)} />
      {searchOpen && <PantryProductPicker section={section} onSelect={add} onClose={() => {
        setSearchOpen(false);
        setAddAt(null);
      }} />}
    </View>
  );
}

/** Bind late gesture commits to their original inventory, even after a section change. */
function usePlaceProduct({ update, shelfCount }: ReturnType<typeof usePantryLayout>, section: PantrySection,
  setNoSpace: (section: PantrySection | null) => void) {
  return useCallback((instanceId: string, placement: PantryPlacement) => {
    update((previous) => {
      const { placed: shelf, unplaced: pending } = arrangePantryItems(previous, shelfCount);
      if (!previous.some((item) => item.instanceId === instanceId)) return previous;
      const next = findPantryPlacement(placement, shelf.filter((item) => item.instanceId !== instanceId), shelfCount);
      setNoSpace(next ? null : section);
      if (!next) {
        // Keep recovered overflow intact until another product frees room.
        if (pending.some((item) => item.instanceId === instanceId)) return [...shelf, ...pending].map((item) =>
          item.instanceId === instanceId ? { ...item, ...clampPantryPlacement(placement, shelfCount) } : item);
        return previous;
      }
      return [...shelf, ...pending].map((item) => item.instanceId === instanceId ? { ...item, ...next } : item);
    });
  }, [update, shelfCount, section, setNoSpace]);
}

const pantryItemKey = (item: PantryItem) => item.instanceId;

const PantryListRow = memo(function PantryListRow({ item, location, onSelect }: {
  item: PantryItem;
  location: string;
  onSelect: (id: string) => void;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  return <Pressable testID={`pantry-list-item-${item.instanceId}`}
    accessibilityRole="button" accessibilityLabel={`${item.product.name}. ${t('pantry.oneUnit')}. ${location}`}
    onPress={() => onSelect(item.instanceId)}
    style={({ pressed }) => [styles.productRow, pressed && styles.pressed]}>
    <ProductImage uri={item.product.illustrationUrl} style={styles.productImage} />
    <View style={styles.productText}>
      <Text style={styles.productName}>{item.product.name}</Text>
      <Text style={styles.productMeta}>{t('pantry.oneUnit')} · {location}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
  </Pressable>;
});

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: {
    alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6,
    borderBottomWidth: 1,
  },
  headerControls: { width: '100%', maxWidth: 460, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sectionSelector: { flex: 1, minWidth: 0, maxWidth: 360 },
  viewSelector: { width: 92, flexShrink: 0 },
  body: { flex: 1 },
  // Keep both scroll viewports measured, including their offsets and image sizes.
  viewLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hiddenView: { opacity: 0 },
  pressed: { opacity: 0.65 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  productList: { gap: 10 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  productImage: { width: 56, height: 64, borderRadius: 10 },
  productText: { flex: 1, gap: 5 },
  productName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  productMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkSoft },
  emptyList: { padding: 24, textAlign: 'center', fontFamily: fonts.regular, fontSize: 14,
    lineHeight: 21, color: colors.inkSoft },
  pendingProductName: { flex: 1, color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 14 },
  addShelfButton: { minHeight: 48, alignSelf: 'center', maxWidth: '100%', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 24, backgroundColor: 'rgba(61, 36, 19, 0.9)',
    borderWidth: 1, borderColor: 'rgba(255, 240, 212, 0.4)' },
  addShelfLabel: { flexShrink: 1, color: '#FFF4E3', fontFamily: fonts.semibold, fontSize: 14 },
  info: { minHeight: 34, color: colors.inkSoft, fontSize: 13, lineHeight: 17,
    fontFamily: fonts.regular, padding: 8, backgroundColor: colors.white, borderRadius: 12 },
  error: { borderRadius: 12, padding: 12, backgroundColor: colors.surfaceAlt, minHeight: 44, justifyContent: 'center' },
  errorText: { fontFamily: fonts.medium, color: colors.red, fontSize: 13, textAlign: 'center' },
  pendingProduct: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, padding: 8 },
});
