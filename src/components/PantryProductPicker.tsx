import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PANTRY_SEARCH_PAGE_SIZE, PANTRY_STORES, isCarrefourPantryCategory, searchPantryProducts, type PantryCatalogProduct, type PantryStore } from '../api/pantry';
import { fetchCategories } from '../api/mercadona';
import { fetchBonareaCategoryTree, fetchCarrefourCategoryTree, fetchLidlCategoryTree } from '../api/catalog';
import { updateProfile } from '../api/profile';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { getMeta } from '../constants/categoryMeta';
import { CATALOG_STORES, storesWithLidlSecond } from '../constants/stores';
import { useTranslation } from '../context/LanguageContext';
import { useProfile } from '../context/ProfileContext';
import { useAuth } from '../context/AuthContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { PantryProduct, PantryPurchaseProduct, PantrySection, PantryShelfLabel } from '../lib/pantryLayout';
import { sortByName } from '../lib/sort';
import StoreProductList from './StoreProductList';
import StoreDropdown from './StoreDropdown';
import CatalogSearchField from './CatalogSearchField';
import CatalogTabSelector, { type CatalogTab } from './CatalogTabSelector';
import SlidingSegments, { type Segment } from './SlidingSegments';
import GlassSurface, { glassAvailable } from './GlassSurface';
import LidlStorePicker from './LidlStorePicker';
import { catalogBrowserStyles } from './catalogBrowserStyles';
import ViewModeToggle, { type ViewMode } from './ViewModeToggle';
import HistoryScreen from '../screens/HistoryScreen';
import PantryPlacementReview from './PantryPlacementReview';
import PantryImageBoundsProbe from './PantryImageBoundsProbe';
import { usePantryAddMeasurements } from '../hooks/usePantryAddMeasurements';
import type { PantryVisibleBounds } from '../lib/pantryVisibleBounds';

interface Category { id: string; name: string; children?: Category[] }
const stores = storesWithLidlSecond(CATALOG_STORES);
const selectableStores = PANTRY_STORES.filter((store) => store !== 'carrefour');
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function PantryProductPicker({ onConfirm, onAddPurchase, onClose, shelfLabels = {}, section = 'pantry' }: {
  onConfirm: (products: readonly PantryProduct[], shelfChoices?: ReadonlyMap<string, number>, bounds?: ReadonlyMap<string, PantryVisibleBounds>) => boolean;
  shelfLabels?: Readonly<Record<string, PantryShelfLabel>>;
  onAddPurchase: (products: readonly PantryPurchaseProduct[], bounds?: ReadonlyMap<string, PantryVisibleBounds>) => boolean;
  onClose: () => void;
  section?: PantrySection;
}) {
  const styles = useThemedStyles(catalogBrowserStyles);
  const ownStyles = useThemedStyles(themedStyles);
  const { width, fontScale } = useWindowDimensions();
  const { t, lang } = useTranslation();
  const { profile, applyProfile } = useProfile();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [selected, setSelected] = useState<Map<string, PantryProduct>>(() => new Map());
  const measurements = usePantryAddMeasurements([...selected.values()]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [shelfChoices, setShelfChoices] = useState<Map<string, number>>(() => new Map());
  const [noSpace, setNoSpace] = useState(false);
  const selectedKeys = useMemo(() => new Set(selected.keys()), [selected]);
  const [store, setStore] = useState<PantryStore>('mercadona');
  const [tab, setTab] = useState<CatalogTab>('productos');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [query, setQuery] = useState('');
  const [catQuery, setCatQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [chromeHeight, setChromeHeight] = useState(0);
  const [products, setProducts] = useState<PantryCatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catsLoading, setCatsLoading] = useState(false);
  const [catsError, setCatsError] = useState(false);
  const [parentCategory, setParentCategory] = useState<Category | null>(null);
  const [category, setCategory] = useState<{ id: string; name: string } | null>(null);
  const [lidlPickerOpen, setLidlPickerOpen] = useState(false);
  const [purchasesOpen, setPurchasesOpen] = useState(false);
  const version = useRef(0);
  const nextOffset = useRef(0);
  const moreRequest = useRef<AbortController | null>(null);
  const lidlStoreId = profile?.lidlStoreId ?? null;
  const region = profile?.region ?? null;
  const topInset = glassAvailable ? chromeHeight : 0;
  const options = useMemo(() => ({ store, region, lidlStoreId,
    categoryIds: category ? [category.id] : undefined }), [store, region, lidlStoreId, category]);

  useEffect(() => {
    const scope = ++version.current;
    const controller = new AbortController();
    moreRequest.current?.abort();
    moreRequest.current = null;
    setProducts([]); setLoading(true); setLoadingMore(false); setHasMore(false); setError(false);
    nextOffset.current = 0;
    const timer = setTimeout(() => {
      void searchPantryProducts(query, lang, 0, controller.signal, options).then((page) => {
        if (version.current !== scope || controller.signal.aborted) return;
        setProducts(page.products); setHasMore(page.hasMore);
        nextOffset.current = PANTRY_SEARCH_PAGE_SIZE;
      }).catch(() => {
        if (version.current === scope && !controller.signal.aborted) setError(true);
      }).finally(() => {
        if (version.current === scope && !controller.signal.aborted) setLoading(false);
      });
    }, query ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); moreRequest.current?.abort(); };
  }, [query, lang, options, attempt]);

  useEffect(() => {
    if (tab !== 'categorias') return;
    const controller = new AbortController();
    setCatsLoading(true); setCatsError(false); setCategories([]);
    const request = store === 'bonarea' ? fetchBonareaCategoryTree(controller.signal)
      : store === 'carrefour' ? fetchCarrefourCategoryTree(controller.signal).then((roots) => roots
        .filter((root) => isCarrefourPantryCategory(root.id, root.name))
        .map((root) => ({ ...root, children: root.children.filter((child) => isCarrefourPantryCategory(child.id, child.name)) }))
        .filter((root) => root.children.length > 0))
      : store === 'lidl' ? fetchLidlCategoryTree(lidlStoreId, controller.signal)
      : fetchCategories(controller.signal).then((roots) => roots.map((root) => ({
        id: String(root.id), name: root.name,
        children: root.categories.map((child) => ({ id: String(child.id), name: child.name })),
      })));
    void request.then((roots) => { if (!controller.signal.aborted) setCategories(roots); })
      .catch(() => { if (!controller.signal.aborted) setCatsError(true); })
      .finally(() => { if (!controller.signal.aborted) setCatsLoading(false); });
    return () => controller.abort();
  }, [store, tab, lang, lidlStoreId, attempt]);

  const loadMore = async () => {
    if (loading || loadingMore || !hasMore || moreRequest.current) return;
    const scope = version.current;
    const controller = new AbortController();
    moreRequest.current = controller;
    setLoadingMore(true); setError(false);
    try {
      const page = await searchPantryProducts(query, lang, nextOffset.current, controller.signal, options);
      if (version.current !== scope || controller.signal.aborted) return;
      setProducts((previous) => [...previous, ...page.products.filter((product) => !previous.some((p) => p.id === product.id))]);
      setHasMore(page.hasMore); nextOffset.current += PANTRY_SEARCH_PAGE_SIZE;
    } catch {
      if (version.current === scope && !controller.signal.aborted) setError(true);
    } finally {
      if (moreRequest.current === controller) moreRequest.current = null;
      if (version.current === scope && !controller.signal.aborted) setLoadingMore(false);
    }
  };
  const changeStore = (next: PantryStore) => {
    if (!selectableStores.some((store) => store === next)) return;
    setStore(next); setCategory(null); setParentCategory(null); setCatQuery('');
    if (next === 'lidl' && !lidlStoreId) setLidlPickerOpen(true);
  };
  const saveLidlStore = async (id: string) => {
    if (!session?.user.id) throw new Error('No session');
    await updateProfile(session.user.id, { lidlStoreId: id });
    applyProfile({ lidlStoreId: id }); setLidlPickerOpen(false);
  };
  const segmentControl = <K extends string,>(segments: Segment<K>[], value: K, onChange: (key: K) => void) =>
    glassAvailable || Platform.OS === 'android'
      ? <SlidingSegments compact dense emphasized transparentTrack={Platform.OS === 'android'} segments={segments} value={value} onChange={onChange} />
      : <View style={[styles.viewToggle, styles.prodToggleDense]}>{segments.map((segment) => <Pressable key={segment.key}
        onPress={() => onChange(segment.key)} style={[styles.viewBtn, styles.prodViewBtn, value === segment.key && styles.viewBtnOn]}
        accessibilityRole="button" accessibilityLabel={segment.accessibilityLabel} accessibilityState={{ selected: value === segment.key }}>
        {segment.icon ? <Ionicons name={segment.icon} size={18} color={value === segment.key ? colors.white : colors.inkSoft} />
          : <Text style={[styles.prodUnitSortText, { color: value === segment.key ? colors.white : colors.inkSoft }]}>{segment.label}</Text>}
      </Pressable>)}</View>;

  const chrome = <>
    <View style={[styles.headerArea, { paddingTop: 14 }]}>
      <View style={styles.titleWrap}>
        <View style={styles.titleIcon}><Ionicons name="library" size={15} color={colors.accent} /></View>
        <Text style={styles.title} accessibilityRole="header">{t(section === 'fridge' ? 'pantry.addFridgeProduct' : 'pantry.addProduct')}</Text>
      </View>
      <StoreDropdown stores={stores} value={store} onChange={changeStore} labeled availableStores={selectableStores} />
      <Pressable style={styles.pickerClose} accessibilityRole="button" accessibilityLabel={t('common.close')}
        testID="pantry-search-close" onPress={onClose}><Ionicons name="close" size={22} color={colors.ink} /></Pressable>
    </View>
    <View style={styles.controlsRow}>
      <CatalogTabSelector value={tab} onChange={(next) => {
        Keyboard.dismiss(); setSearchExpanded(false); setTab(next);
      }} showIcons={width >= 375 && fontScale <= 1.2} />
      <Pressable
        onPress={() => { Keyboard.dismiss(); setSearchExpanded(false); setPurchasesOpen(true); }}
        style={({ pressed }) => [ownStyles.purchasesBtn, pressed && ownStyles.purchasesBtnPressed]}
        accessibilityRole="button" accessibilityLabel={t('pantry.myPurchases')} testID="pantry-my-purchases">
        <Text style={ownStyles.purchasesBtnText}>{t('pantry.myPurchases')}</Text>
      </Pressable>
    </View>
    {category && tab === 'productos' && <Pressable style={ownStyles.categoryScope} onPress={() => setCategory(null)}
      accessibilityRole="button" accessibilityLabel={`${category.name}. ${t('common.clear')}`}>
      <Text style={ownStyles.categoryScopeText}>{category.name}</Text><Ionicons name="close-circle" size={18} color={colors.accent} />
    </Pressable>}
    {tab === 'categorias'
      ? <CatalogSearchField placeholder={t('catalog.searchCategories')} value={catQuery} onChange={setCatQuery} testID="pantry-category-search" />
      : <View style={styles.prodSearchBlock}>
        <View style={styles.prodSearchRow}>
          <CatalogSearchField product placeholder={t('catalog.searchProducts')} value={query} onChange={setQuery}
            expanded={searchExpanded} onFocus={() => setSearchExpanded(true)} onBlur={() => setSearchExpanded(false)} testID="pantry-search-input" />
          {!searchExpanded && <>
            {store === 'lidl' && lidlStoreId && segmentControl([
              { key: 'store', icon: 'storefront-outline', accessibilityLabel: t('region.lidlStoreTitle') },
            ], '', () => setLidlPickerOpen(true))}
            <View style={styles.prodViewGroup}><ViewModeToggle value={viewMode} onChange={setViewMode} /></View>
          </>}
        </View>
        {!searchExpanded && !!query && <Text style={styles.prodSearchQuery} numberOfLines={1}>{query}</Text>}
      </View>}
  </>;
  const shownCategories = sortByName((parentCategory?.children ?? categories).filter((item) => {
    const needle = normalize(catQuery.trim());
    return normalize(item.name).includes(needle)
      || item.children?.some((child) => normalize(child.name).includes(needle));
  }), (item) => item.name);
  const retry = <Pressable onPress={() => products.length && tab === 'productos' ? void loadMore() : setAttempt((n) => n + 1)}
    accessibilityRole="button" style={ownStyles.retry}><Text style={styles.retryText}>{t('common.retry')}</Text></Pressable>;
  const lidlNeedsStore = store === 'lidl' && !lidlStoreId;
  const goBack = () => purchasesOpen ? setPurchasesOpen(false) : reviewOpen ? setReviewOpen(false) : onClose();
  return <Modal visible transparent animationType={reducedMotion ? 'none' : 'slide'}
    presentationStyle="overFullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={goBack}>
    <KeyboardAvoidingView style={ownStyles.modalRoot} behavior="padding">
      <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={() => { Keyboard.dismiss(); onClose(); }} />
      <SafeAreaView style={ownStyles.sheet} edges={['left', 'right']}
        testID="pantry-picker-sheet" accessibilityViewIsModal onAccessibilityEscape={goBack}>
        {!purchasesOpen && <PantryImageBoundsProbe key={measurements.attempt} urls={measurements.urls} onBounds={measurements.onBounds} />}
        {purchasesOpen ? <HistoryScreen onBack={() => setPurchasesOpen(false)} onAddPantryPurchase={onAddPurchase} pantrySection={section} /> : <View style={ownStyles.body}>
          {reviewOpen ? <PantryPlacementReview products={[...selected.values()]} shelfLabels={shelfLabels}
            shelfChoices={shelfChoices} onBack={() => setReviewOpen(false)} onClose={onClose}
            onChooseShelf={(key, shelf) => {
              setNoSpace(false);
              setShelfChoices(previous => {
                const next = new Map(previous);
                if (shelf === null) next.delete(key); else next.set(key, shelf);
                return next;
              });
            }} /> : <>
          {glassAvailable ? <View style={[styles.chrome, { zIndex: 1 }]} onLayout={(event) => setChromeHeight(event.nativeEvent.layout.height)}>
            <GlassSurface style={styles.chromeGlass} fallbackColor={colors.paper}>{chrome}</GlassSurface>
          </View> : chrome}
          {lidlNeedsStore ? <View style={[styles.centerBox, { paddingTop: topInset }]}>
            <Text style={styles.errorText}>{t('catalog.lidlStoreRequired')}</Text>
            <Pressable style={ownStyles.retry} onPress={() => setLidlPickerOpen(true)} accessibilityRole="button">
              <Text style={styles.retryText}>{t('region.lidlStoreTitle')}</Text>
            </Pressable>
          </View> : tab === 'categorias' ? catsLoading ? <View style={[styles.centerBox, { paddingTop: topInset }]}><ActivityIndicator color={colors.accent} /></View>
            : catsError ? <View style={[styles.centerBox, { paddingTop: topInset }]}><Text style={styles.errorText}>{t('pantry.searchError')}</Text>{retry}</View>
            : <FlatList data={shownCategories} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
              contentContainerStyle={[styles.list, { paddingTop: topInset + 4, paddingBottom: insets.bottom + 24 }]}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />} testID="pantry-category-results"
              ListHeaderComponent={parentCategory ? <Pressable style={ownStyles.back} accessibilityRole="button" onPress={() => { setParentCategory(null); setCatQuery(''); }}>
                <Ionicons name="chevron-back" size={20} color={colors.accent} /><Text style={styles.retryText}>{parentCategory.name}</Text>
              </Pressable> : undefined}
              ListEmptyComponent={<Text style={styles.errorText}>{t('pantry.noCategories')}</Text>}
              renderItem={({ item }) => {
                const { emoji, color } = getMeta(item.name);
                const children = item.children;
                return <GlassSurface style={styles.row} fallbackColor={colors.white}>
                  <Pressable style={styles.rowBody} accessibilityRole="button" onPress={() => {
                    setCatQuery('');
                    if (children?.length) setParentCategory(item);
                    else { setCategory(item); setQuery(''); setTab('productos'); Keyboard.dismiss(); }
                  }} testID={`pantry-category-${item.id}`}>
                    <View style={[styles.thumbnail, { backgroundColor: color + '1e' }]}><Text style={styles.thumbnailEmoji}>{emoji}</Text></View>
                    <View style={styles.rowContent}><Text style={styles.rowName}>{item.name}</Text>
                      {children && <Text style={styles.rowSub}>{t('catalog.subcategories', { n: children.length })}</Text>}
                    </View><Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
                  </Pressable>
                </GlassSurface>;
              }} />
            : error && !products.length ? <View style={[styles.centerBox, { paddingTop: topInset }]}><Text style={styles.errorText}>{t('pantry.searchError')}</Text>{retry}</View>
              : <>
                <StoreProductList products={products} loading={loading} hideToolbar roundedCards keepOrder compactSelection
                  viewMode={viewMode} onViewModeChange={setViewMode} topInset={topInset}
                  onEndReached={error ? undefined : () => void loadMore()} loadingMore={loadingMore}
                  emptyText={t(query || category ? 'pantry.noResults' : 'pantry.noIllustrations')}
                  onScrollBeginDrag={() => { Keyboard.dismiss(); setSearchExpanded(false); }}
                  selection={{ selectedKeys, allowDeselect: true, bottomInset: insets.bottom, actionAppearance: 'glass',
                    accessibilityLabel: (product) => t(selectedKeys.has(`${product.store}:${product.id}`)
                      ? 'pantry.deselectNamedProduct' : 'pantry.selectNamedProduct', { name: product.name }),
                    onSelect: (product) => {
                      const entry = products.find((item) => item.id === product.id && item.store === product.store);
                      if (!entry) return;
                      setNoSpace(false);
                      const entryKey = `${entry.store}:${entry.id}`;
                      if (selectedKeys.has(entryKey)) setShelfChoices(previous => {
                        const next = new Map(previous); next.delete(entryKey); return next;
                      });
                      setSelected((previous) => {
                        const next = new Map(previous);
                        const key = `${entry.store}:${entry.id}`;
                        if (next.has(key)) next.delete(key);
                        else next.set(key, { id: entry.id, name: entry.name, store: entry.store,
                          illustrationUrl: entry.illustrationUrl,
                          ...(entry.metaLabel ? { metaLabel: entry.metaLabel } : {}) });
                        return next;
                      });
                    },
                  }} />
                {error && <View style={ownStyles.moreError}><Text style={styles.errorText}>{t('pantry.searchError')}</Text>{retry}</View>}
              </>}
          </>}
          {measurements.failed && <View><Text style={styles.errorText} accessibilityRole="alert">{t('pantry.measureError')}</Text>
            <Pressable onPress={measurements.retry} accessibilityRole="button" style={ownStyles.retry}>
              <Text style={styles.errorText}>{t('common.retry')}</Text>
            </Pressable></View>}
          {noSpace && <Text style={[styles.errorText, ownStyles.spaceError]} accessibilityRole="alert">{t('pantry.noSpace')}</Text>}
          {selected.size > 0 && <GlassSurface style={[ownStyles.confirmBar, { paddingBottom: Math.max(insets.bottom, 12) }]}
            fallbackColor={colors.paper}>
            {!reviewOpen && <Pressable testID="pantry-locate-products" accessibilityRole="button"
              style={[ownStyles.confirmButton, ownStyles.locateButton]} onPress={() => {
                Keyboard.dismiss(); setSearchExpanded(false); setReviewOpen(true);
              }}>
              <Text style={ownStyles.locateText}>{t('pantry.locateProducts')}</Text>
            </Pressable>}
            <Pressable testID="pantry-confirm-products" accessibilityRole="button"
              disabled={!measurements.ready} accessibilityState={{ disabled: !measurements.ready, busy: !measurements.ready && !measurements.failed }}
              style={ownStyles.confirmButton} onPress={() => {
                if (!measurements.ready) return;
                Keyboard.dismiss();
                setNoSpace(!onConfirm([...selected.values()], shelfChoices, measurements.bounds));
              }}>
              {!measurements.ready && !measurements.failed && <ActivityIndicator color={colors.white} />}
              <Text style={ownStyles.confirmText}>{t(!measurements.ready && !measurements.failed ? 'pantry.measuringProducts' : section === 'fridge' ? 'pantry.confirmFridgeProducts' : 'pantry.confirmProducts')}</Text>
            </Pressable>
          </GlassSurface>}
        </View>}
        {store === 'lidl' && lidlPickerOpen && <LidlStorePicker postalCode={profile?.postalCode ?? null} selectedStoreId={lidlStoreId}
          required={!lidlStoreId} onSelect={saveLidlStore} onClose={() => setLidlPickerOpen(false)} />}
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}

const themedStyles = () => StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  sheet: {
    width: '100%', height: '90%', maxHeight: '90%', flexShrink: 1,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: 'hidden', backgroundColor: colors.paper,
  },
  body: { flex: 1, minHeight: 0 },
  confirmBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  spaceError: { paddingHorizontal: 16, paddingTop: 8 },
  locateButton: { backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accent },
  locateText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent, textAlign: 'center' },
  confirmButton: { minHeight: 44, flex: 1, borderRadius: 22, backgroundColor: colors.accent,
    paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  confirmText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white, textAlign: 'center' },
  purchasesBtn: {
    minHeight: 44, maxWidth: '34%', paddingHorizontal: 12, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  purchasesBtnPressed: { backgroundColor: colors.accentLight },
  purchasesBtnText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.accent, textAlign: 'center' },
  categoryScope: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, minHeight: 44 },
  categoryScopeText: { flex: 1, color: colors.accent, fontFamily: fonts.semibold, fontSize: 14 },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  retry: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  moreError: { padding: 8, backgroundColor: colors.paper },
});
