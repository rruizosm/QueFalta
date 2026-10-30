import type { ViewInstance } from 'react-native';
import type { PantryVisibleBounds } from '../lib/pantryVisibleBounds';
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { BlurTargetView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Alert, FlatList, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { PagerGestureContext } from '../components/bottom-tabs-pager/PagerGestureContext';
import PaywallModal from '../components/PaywallModal';
import { FREE_PANTRY_SHELF_LIMIT, limitsApply } from '../constants/limits';
import PantryPendingPopover from '../components/PantryPendingPopover';
import PantryProductPicker from '../components/PantryProductPicker';
import PantryShelf from '../components/PantryShelf';
import PantryImageBoundsProbe from '../components/PantryImageBoundsProbe';
import PantryNoteButton from '../components/PantryNoteButton';
import PantryExpiryAlarm from '../components/PantryExpiryAlarm';
import { fetchBonareaProduct, fetchCarrefourProduct, fetchLidlProduct, fetchProductMirror } from '../api/catalog';
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
import { useProfile } from '../context/ProfileContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { usePantryInventory } from '../hooks/usePantryInventory';
import { usePantryToday } from '../hooks/usePantryToday';
import { prefetchPantryImages } from '../lib/prefetchProductImages';
import { syncPantryExpiryNotifications } from '../lib/pantryExpiryNotifications';
import { arrangePantryItems, clampPantryPlacement, defaultPantryPlacement, findPantryPlacement,
  findPantryPlacementInGroup, pantryShelfGroupIndex, pantryShelfIndex, pantryExpiryStatus,
  findPantryPlacementOnAnyShelf, insertPantryPlacement, pantryProductImageGeometry, normalizePantryVisibleBounds, isPantryExpiryDate, pantryQuantity, PANTRY_MAX_NOTES_LENGTH, PANTRY_MAX_LOCATION_LENGTH,
  type PantryItem, type PantryPlacement, type PantryProduct, type PantryPurchaseProduct, type PantrySection, type PantryShelfLabel } from '../lib/pantryLayout';

const PANTRY_ACTION_TOUCH_SIZE = 44;
const PANTRY_ACTION_VISUAL_SIZE = 34.32;
const PANTRY_ACTION_NAV_GAP = 10;
const withAlpha = (hex: string, alpha: number) => {
  const value = hex.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

export default function PantryScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { activeCart, hydrated } = useCart();
  const groupId = hydrated ? activeCart?.groupId ?? null : null;
  // Remount before rendering another group's data or accepting a stale picker callback.
  if (!hydrated) return null;
  return <PantryScreenContent key={`${userId ?? 'signed-out'}:${groupId ?? 'personal'}`} userId={userId} groupId={groupId} />;
}

export function PantryScreenContent({ userId, groupId = null }: { userId: string | null; groupId?: string | null }) {
  const today = usePantryToday();
  const styles = useThemedStyles(themedStyles);
  const { scheme } = useTheme();
  const { t } = useTranslation();
  const backgroundRef = useRef<ViewInstance>(null);
  const { activeCart, addToActiveCart } = useCart();
  const { profile, isPremium } = useProfile();
  const maxShelfCount = limitsApply(isPremium) ? FREE_PANTRY_SHELF_LIMIT : Infinity;
  const [paywallVisible, setPaywallVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const bottomPadding = useTabBarBottomPadding(16);
  const tabBarOffset = useTabBarBottomPadding(0);
  // Stable, independent stores: switching tabs never rehydrates one section into the other.
  const pantry = usePantryInventory(userId, 'pantry', groupId, maxShelfCount);
  const fridge = usePantryInventory(userId, 'fridge', groupId, maxShelfCount);
  const pantryItems = pantry.items;
  const fridgeItems = fridge.items;
  useEffect(() => {
    if (!userId || !pantry.ready || !fridge.ready) return;
    void syncPantryExpiryNotifications(userId, { groupId, pantry: { items: pantryItems }, fridge: { items: fridgeItems } });
  }, [userId, groupId, pantry.ready, pantryItems, fridge.ready, fridgeItems]);
  const [section, setSection] = useState<PantrySection>('pantry');
  const { items, shelfCount, shelfLabels, ready, loadError, saveError, conflict, update, retryLoad, retrySave } = section === 'pantry' ? pantry : fridge;
  const [fridgeVisited, setFridgeVisited] = useState(false);
  useEffect(() => {
    if (!pantry.ready || !fridge.ready || fridgeVisited) return;
    const task = requestIdleCallback(() => setFridgeVisited(true));
    return () => cancelIdleCallback(task);
  }, [pantry.ready, fridge.ready, fridgeVisited]);
  const pantryPhotoKey = JSON.stringify([...new Set(pantry.items.map(item => item.product.illustrationUrl))]);
  const fridgePhotoKey = JSON.stringify([...new Set(fridge.items.map(item => item.product.illustrationUrl))]);
  useEffect(() => {
    if (!pantry.ready) return;
    return prefetchPantryImages(JSON.parse(pantryPhotoKey));
  }, [pantry.ready, pantryPhotoKey]);
  useEffect(() => {
    if (!fridge.ready) return;
    return prefetchPantryImages(JSON.parse(fridgePhotoKey));
  }, [fridge.ready, fridgePhotoKey]);
  const pantryImageUrls = useMemo<string[]>(() => JSON.parse(pantryPhotoKey), [pantryPhotoKey]);
  const fridgeImageUrls = useMemo<string[]>(() => JSON.parse(fridgePhotoKey), [fridgePhotoKey]);
  const [views, setViews] = useState<Record<PantrySection, 'cupboard' | 'list'>>({ pantry: 'cupboard', fridge: 'cupboard' });
  const view = views[section];
  const [listVisited, setListVisited] = useState<Record<PantrySection, boolean>>({ pantry: false, fridge: false });
  const [deletingProducts, setDeletingProducts] = useState(false);
  const deleteMode = useMemo(() => ({ section, enabled: deletingProducts, ready }), [section, deletingProducts, ready]);
  const deleteModeRef = useRef<typeof deleteMode | null>(deleteMode);
  deleteModeRef.current = deleteMode;
  useEffect(() => {
    deleteModeRef.current = deleteMode;
    return () => { deleteModeRef.current = null; };
  }, [deleteMode]);
  const [editingLabels, setEditingLabels] = useState(false);
  const editingLabelsRef = useRef<PantrySection | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingContentHeight, setPendingContentHeight] = useState(120);
  const [addAt, setAddAt] = useState<{ section: PantrySection; placement: PantryPlacement | null } | null>(null);
  const [selection, setSelection] = useState<{ section: PantrySection; id: string; sourceRef?: RefObject<ViewInstance | null> } | null>(null);
  const [sourceHidden, setSourceHidden] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const select = useCallback((id: string, sourceRef?: RefObject<ViewInstance | null>) => {
    if (editingLabelsRef.current) return;
    setSourceHidden(false);
    setSelection({ section: 'pantry', id, sourceRef });
  }, []);
  const selectFridge = useCallback((id: string, sourceRef?: RefObject<ViewInstance | null>) => {
    if (editingLabelsRef.current) return;
    setSourceHidden(false);
    setSelection({ section: 'fridge', id, sourceRef });
  }, []);
  const closeFocus = useCallback(() => { setDetailOpen(false); setSelection(null); setSourceHidden(false); }, []);
  const hideSource = useCallback(() => setSourceHidden(true), []);
  const [noSpace, setNoSpace] = useState<PantrySection | null>(null);
  const pantryScene = useMemo(() => arrangePantryItems(pantry.items, pantry.shelfCount), [pantry.items, pantry.shelfCount]);
  const fridgeScene = useMemo(() => arrangePantryItems(fridge.items, fridge.shelfCount), [fridge.items, fridge.shelfCount]);
  const { unplaced } = section === 'pantry' ? pantryScene : fridgeScene;
  useEffect(() => { if (!unplaced.length) setPendingOpen(false); }, [unplaced.length]);
  const place = usePlaceProduct(pantry, 'pantry', setNoSpace, editingLabelsRef);
  const placeFridge = usePlaceProduct(fridge, 'fridge', setNoSpace, editingLabelsRef);
  const pager = useContext(PagerGestureContext);
  const scrollGesture = useMemo(() => {
    const native = Gesture.Native();
    return pager ? native.requireExternalGestureToFail(pager) : native;
  }, [pager]);
  const listScrollGesture = useMemo(() => {
    const native = Gesture.Native();
    return pager ? native.requireExternalGestureToFail(pager) : native;
  }, [pager]);
  const fridgeListScrollGesture = useMemo(() => {
    const native = Gesture.Native();
    return pager ? native.requireExternalGestureToFail(pager) : native;
  }, [pager]);
  const fridgeListItems = useMemo(() => [...fridgeScene.placed, ...fridgeScene.unplaced], [fridgeScene]);
  const kitchenLocationOptions = useMemo(() => {
    const locations = section === 'pantry' ? pantry.kitchenLocations : fridge.kitchenLocations;
    return locations ?? Array.from({ length: 3 }, (_, index) =>
      t('pantry.defaultKitchenLocation', { number: index + 1 }));
  }, [section, pantry.kitchenLocations, fridge.kitchenLocations, t]);
  const updateKitchenLocationOptions = section === 'pantry' ? pantry.setKitchenLocations : fridge.setKitchenLocations;
  const setKitchenLocationOptions = useCallback((options: string[], removedIndex?: number) =>
    updateKitchenLocationOptions(options, kitchenLocationOptions, removedIndex), [updateKitchenLocationOptions, kitchenLocationOptions]);
  const changeView = useCallback((next: 'cupboard' | 'list') => {
    closeFocus();
    setPendingOpen(false);
    if (next === 'list') setListVisited((previous) => ({ ...previous, [section]: true }));
    setViews((previous) => ({ ...previous, [section]: next }));
  }, [closeFocus, section]);
  const { update: updatePantry } = pantry;
  const { update: updateFridge } = fridge;
  const removePantryProduct = useCallback((id: string) => {
    updatePantry((previous) => previous.filter((item) => item.instanceId !== id));
    setNoSpace(null);
  }, [updatePantry]);
  const removeFridgeProduct = useCallback((id: string) => {
    updateFridge((previous) => previous.filter((item) => item.instanceId !== id));
    setNoSpace(null);
  }, [updateFridge]);
  const renderListItem = useCallback(({ item }: { item: PantryItem }) => <PantryListRow
    item={item} today={today} onSelect={select} disabled={editingLabels} notesEnabled={section === 'pantry' && view === 'list' && !selection && !searchOpen}
    onRemove={deletingProducts ? removePantryProduct : undefined} />, [today, select, editingLabels, section, view, selection, searchOpen, deletingProducts, removePantryProduct]);
  const renderFridgeListItem = useCallback(({ item }: { item: PantryItem }) => <PantryListRow
    item={item} today={today} onSelect={selectFridge} disabled={editingLabels} section="fridge"
    notesEnabled={section === 'fridge' && view === 'list' && !selection && !searchOpen}
    onRemove={deletingProducts ? removeFridgeProduct : undefined} />, [today, selectFridge, editingLabels, section, view, selection, searchOpen, deletingProducts, removeFridgeProduct]);
  const selected = selection?.section === section ? items.find((item) => item.instanceId === selection.id) : undefined;
  const selectedShelfGroup = selected && !selected.pendingPlacement
    ? pantryShelfGroupIndex(pantryShelfIndex(selected, shelfCount), shelfCount, shelfLabels) : null;
  const changeSelectedShelf = (groupIndex: number): boolean => {
    if (!selected || !ready || editingLabelsRef.current) return false;
    let moved = false;
    update((previous) => {
      const item = previous.find(entry => entry.instanceId === selected.instanceId);
      if (!item || pantryShelfGroupIndex(groupIndex, shelfCount, shelfLabels) !== groupIndex) return previous;
      if (!item.pendingPlacement && pantryShelfGroupIndex(pantryShelfIndex(item, shelfCount), shelfCount, shelfLabels) === groupIndex) {
        moved = true;
        return previous;
      }
      const occupied = arrangePantryItems(previous, shelfCount).placed.filter(entry => entry.instanceId !== item.instanceId);
      const placement = findPantryPlacementInGroup(item, occupied, groupIndex, shelfCount, shelfLabels);
      if (!placement) return previous;
      moved = true;
      return previous.map(entry => {
        if (entry.instanceId !== item.instanceId) return entry;
        const next = { ...entry, ...placement };
        delete next.pendingPlacement;
        return next;
      });
    });
    if (moved) setNoSpace(null);
    return moved;
  };
  const otherSection = section === 'pantry' ? 'fridge' : 'pantry';
  const otherInventory = otherSection === 'fridge' ? fridge : pantry;
  const changeSelectedOtherShelf = (groupIndex: number): boolean => {
    if (!selected || !ready || !otherInventory.ready || editingLabelsRef.current) return false;
    if (pantryShelfGroupIndex(groupIndex, otherInventory.shelfCount, otherInventory.shelfLabels) !== groupIndex) return false;
    let moved = false;
    // Reserve the destination first. A full or unavailable shelf leaves the source intact.
    otherInventory.update(previous => {
      if (previous.some(entry => entry.instanceId === selected.instanceId)) return previous;
      const occupied = arrangePantryItems(previous, otherInventory.shelfCount).placed;
      const placement = findPantryPlacementInGroup(selected, occupied, groupIndex, otherInventory.shelfCount, otherInventory.shelfLabels);
      if (!placement) return previous;
      const next = { ...selected, ...placement };
      delete next.pendingPlacement;
      moved = true;
      return [...previous, next];
    });
    if (!moved) return false;
    update(previous => previous.filter(entry => entry.instanceId !== selected.instanceId));
    setNoSpace(null);
    setSourceHidden(false);
    setDetailOpen(false);
    setSection(otherSection);
    setSelection({ section: otherSection, id: selected.instanceId });
    return true;
  };
  const editSelected = (patch: { quantity?: number; notes?: string; kitchenLocation?: string; expiryDate?: string | null }) => {
    if (!selected) return;
    update((previous) => previous.map((item) => {
      if (item.instanceId !== selected.instanceId) return item;
      const next: PantryItem = {
        ...item,
        ...(patch.quantity !== undefined ? { quantity: pantryQuantity(patch.quantity) } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes.slice(0, PANTRY_MAX_NOTES_LENGTH) } : {}),
        ...(patch.kitchenLocation !== undefined ? { kitchenLocation: patch.kitchenLocation.slice(0, PANTRY_MAX_LOCATION_LENGTH) } : {}),
      };
      if (patch.expiryDate !== undefined) {
        if (patch.expiryDate === null) delete next.expiryDate;
        else next.expiryDate = patch.expiryDate;
      }
      return next;
    }));
  };
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
      if (selected.product.store === 'lidl') {
        const product = await fetchLidlProduct(selected.product.id, profile?.lidlStoreId ?? null);
        if (!product) throw new Error('Product unavailable');
        await addToActiveCart([{
          storeKey: 'lidl', productName: product.displayName, quantity: 1, unit: 'ud',
          categoryName: product.categoryName, unitPrice: product.unitPrice,
          imageUrl: product.thumbnail ?? selected.product.illustrationUrl,
          storeProductId: product.id,
        }]);
        return;
      }
      if (selected.product.store === 'bonarea' || selected.product.store === 'carrefour') {
        const store = selected.product.store;
        const product = store === 'carrefour'
          ? await fetchCarrefourProduct(selected.product.id, profile?.region ?? null)
          : await fetchBonareaProduct(selected.product.id);
        if (!product) throw new Error('Product unavailable');
        await addToActiveCart([{
          storeKey: store, productName: product.displayName, quantity: 1, unit: 'ud',
          categoryName: product.categoryName, unitPrice: product.unitPrice,
          imageUrl: product.thumbnail ?? selected.product.illustrationUrl,
          storeProductId: product.id,
        }]);
        return;
      }
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
  const openProductSearch = useCallback(() => {
    if (editingLabelsRef.current) return;
    setDeletingProducts(false);
    setPendingOpen(false);
    setAddAt({ section, placement: null });
    setNoSpace(null);
    setSearchOpen(true);
  }, [section]);
  const add = (products: readonly PantryProduct[], shelfChoices: ReadonlyMap<string, number> = new Map(), bounds: ReadonlyMap<string, PantryVisibleBounds> = new Map()): boolean => {
    if (!products.length || !addAt || addAt.section !== section || editingLabelsRef.current || !ready) return false;
    let added = false;
    update((previous) => {
      const { placed: shelf, unplaced: pending } = arrangePantryItems(previous, shelfCount);
      const next = [...shelf];
      const entries = products.map((product, index) => ({ product, index,
        shelf: shelfChoices.get(`${product.store ?? 'mercadona'}:${product.id}`) }));
      // Reserve chosen shelves before placing products with no shelf preference.
      const allocated = new Map<number, PantryItem>();
      for (const { product, index, shelf: chosenShelf } of [...entries].sort((a, b) =>
        Number(b.shelf !== undefined) - Number(a.shelf !== undefined))) {
        if (chosenShelf !== undefined && (!Number.isInteger(chosenShelf) || chosenShelf < 0
          || chosenShelf >= shelfCount || !shelfLabels?.[String(chosenShelf)])) return previous;
        const visibleBounds = normalizePantryVisibleBounds(bounds.get(product.illustrationUrl))
          ?? pantryProductImageGeometry(product, previous).visibleBounds;
        if (!visibleBounds) return previous;
        const geometry = { visibleBounds, boundsImageUrl: product.illustrationUrl };
        const desired = { ...defaultPantryPlacement(0, shelfCount, geometry.visibleBounds), ...geometry, x: 0 };
        const placement = chosenShelf !== undefined
          ? findPantryPlacementInGroup(desired, next, chosenShelf, shelfCount, shelfLabels)
          : index === 0 && addAt.placement
            ? findPantryPlacement({ ...addAt.placement, ...geometry }, next, shelfCount)
            : findPantryPlacementOnAnyShelf(desired, next, shelfCount);
        if (!placement) { setNoSpace(section); return previous; }
        const entry = { instanceId: `${product.id}-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 9)}`,
          product, ...geometry, ...placement };
        next.push(entry);
        allocated.set(index, entry);
      }
      added = true;
      setNoSpace(null);
      return [...shelf, ...entries.map(({ index }) => allocated.get(index)!), ...pending];
    });
    if (added) {
      setSearchOpen(false);
      setAddAt(null);
      Keyboard.dismiss();
    }
    return added;
  };
  const addPurchase = (products: readonly PantryPurchaseProduct[], bounds: ReadonlyMap<string, PantryVisibleBounds> = new Map()): boolean => {
    if (!products.length || !addAt || addAt.section !== section
      || editingLabelsRef.current || !ready) return false;
    let added = false;
    update((previous) => {
      const { placed, unplaced } = arrangePantryItems(previous, shelfCount);
      const next = [...placed];
      const overflow: PantryItem[] = [];
      for (const [index, { product, quantity }] of products.entries()) {
        const visibleBounds = normalizePantryVisibleBounds(bounds.get(product.illustrationUrl))
          ?? pantryProductImageGeometry(product, previous).visibleBounds;
        if (!visibleBounds) return previous;
        const geometry = { visibleBounds, boundsImageUrl: product.illustrationUrl };
        const desired = { ...defaultPantryPlacement(0, shelfCount, geometry.visibleBounds), ...geometry, x: 0 };
        const placement = findPantryPlacementOnAnyShelf(desired, next, shelfCount);
        (placement ? next : overflow).push({ instanceId: `${product.id}-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 9)}`,
          product, quantity: pantryQuantity(quantity), ...geometry,
          ...(placement ?? { ...desired, pendingPlacement: true }) });
      }
      added = true;
      setNoSpace(null);
      return [...next, ...unplaced, ...overflow];
    });
    if (added) {
      setSearchOpen(false);
      setAddAt(null);
      Keyboard.dismiss();
    }
    return added;
  };
  const requestDeleteAll = () => {
    if (!ready || !deletingProducts || !items.length) return;
    Alert.alert(t('pantry.deleteAllTitle'), t(section === 'fridge' ? 'pantry.deleteAllFridgeMessage' : 'pantry.deleteAllMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('pantry.deleteAll'), style: 'destructive', onPress: () => {
        if (deleteModeRef.current !== deleteMode) return;
        update(previous => previous.length ? [] : previous);
        setDeletingProducts(false);
        setPendingOpen(false);
        setNoSpace(null);
      } },
    ]);
  };
  const toggleLabelEditing = () => {
    if (!ready) return;
    setDeletingProducts(false);
    setPendingOpen(false);
    const next = !editingLabelsRef.current;
    editingLabelsRef.current = next ? section : null;
    setEditingLabels(next);
    closeFocus();
    setSearchOpen(false);
    setAddAt(null);
    setNoSpace(null);
    Keyboard.dismiss();
    if (next) setViews((previous) => ({ ...previous, [section]: 'cupboard' }));
  };
  const { setShelfLabel: setPantryShelfLabel, insertShelfBelow: insertPantryShelfBelow, removeShelf: deletePantryShelf } = pantry;
  const { setShelfLabel: setFridgeShelfLabel, insertShelfBelow: insertFridgeShelfBelow, removeShelf: deleteFridgeShelf } = fridge;
  const changeShelfLabel = useCallback((index: number, label: PantryShelfLabel | null) => {
    if (editingLabelsRef.current === 'pantry') setPantryShelfLabel(index, label);
  }, [setPantryShelfLabel]);
  const changeFridgeShelfLabel = useCallback((index: number, label: PantryShelfLabel | null) => {
    if (editingLabelsRef.current === 'fridge') setFridgeShelfLabel(index, label);
  }, [setFridgeShelfLabel]);
  const insertPantryShelf = useCallback((index: number) => {
    if (editingLabelsRef.current !== 'pantry') return;
    if (pantry.shelfCount >= maxShelfCount) { setPaywallVisible(true); return; }
    insertPantryShelfBelow(index);
    setNoSpace(null);
  }, [insertPantryShelfBelow, pantry.shelfCount, maxShelfCount]);
  const insertFridgeShelf = useCallback((index: number) => {
    if (editingLabelsRef.current !== 'fridge') return;
    if (fridge.shelfCount >= maxShelfCount) { setPaywallVisible(true); return; }
    insertFridgeShelfBelow(index);
    setNoSpace(null);
  }, [insertFridgeShelfBelow, fridge.shelfCount, maxShelfCount]);
  const requestShelfRemoval = useCallback((inventorySection: PantrySection, index: number) => {
    if (editingLabelsRef.current !== inventorySection) return;
    const inventory = inventorySection === 'pantry' ? pantry : fridge;
    const remove = () => {
      if (editingLabelsRef.current !== inventorySection) return;
      (inventorySection === 'pantry' ? deletePantryShelf : deleteFridgeShelf)(index);
      setNoSpace(null);
    };
    const hasProducts = inventory.items.some(item => pantryShelfIndex(item, inventory.shelfCount) === index);
    if (!hasProducts) {
      remove();
      return;
    }
    Alert.alert(t('pantry.removeShelfTitle'), t('pantry.removeShelfMessage', { number: index + 1 }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: remove },
    ]);
  }, [pantry, fridge, deletePantryShelf, deleteFridgeShelf, t]);
  const removePantryShelf = useCallback((index: number) => requestShelfRemoval('pantry', index), [requestShelfRemoval]);
  const removeFridgeShelf = useCallback((index: number) => requestShelfRemoval('fridge', index), [requestShelfRemoval]);
  const viewSelector = <SlidingSegments style={styles.viewSelector} compact iconsOnly currentOnly
      segments={[
        { key: 'cupboard', accessibilityLabel: t(section === 'fridge' ? 'pantry.fridgeView' : 'pantry.cupboardView'),
          icon: section === 'fridge' ? 'snow-outline' : 'file-tray-stacked-outline' },
        { key: 'list', accessibilityLabel: t('pantry.listView'), icon: 'list-outline' },
      ]} value={view} onChange={changeView} />;
  const status = <>
    {!ready && !loadError && !conflict && <ActivityIndicator color={colors.accent} accessibilityLabel={t('common.loading')} />}
    {loadError && !conflict && <Pressable onPress={retryLoad} style={styles.error} accessibilityRole="button">
      <Text style={styles.errorText}>{t(section === 'fridge' ? 'pantry.fridgeLoadError' : 'pantry.loadError')} · {t('common.retry')}</Text>
    </Pressable>}
    {conflict && <Pressable onPress={retryLoad} style={styles.error} accessibilityRole="button">
      <Text style={styles.errorText}>{t('pantry.sharedConflict')}</Text>
    </Pressable>}
    {saveError && !conflict && <Pressable onPress={retrySave} style={styles.error} accessibilityRole="button">
      <Text style={styles.errorText}>{t('pantry.saveError')} · {t('common.retry')}</Text>
    </Pressable>}
    {noSpace === section && <Text testID="pantry-no-space" accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={[styles.error, styles.errorText]}>{t('pantry.noSpace')}</Text>}
  </>;
  const pendingProducts = <PantryPendingPopover open={pendingOpen && unplaced.length > 0 && !selected && !searchOpen}
    testID={`${section}-unplaced`} style={[styles.pendingPanel, {
      bottom: tabBarOffset + PANTRY_ACTION_NAV_GAP + PANTRY_ACTION_TOUCH_SIZE + 8,
      left: Math.max(16, insets.left + 8), right: Math.max(16, insets.right + 8),
    }]}>
    <View style={styles.pendingHeader}>
      <View style={styles.pendingHeaderIcon}><Ionicons name="file-tray-outline" size={19} color={colors.accent} /></View>
      <View style={styles.pendingHeading}>
        <Text accessibilityRole="header" style={styles.pendingTitle}>{t('pantry.pendingTitle')}</Text>
        <Text style={styles.pendingSubtitle}>{t('pantry.pendingCompactHint')}</Text>
      </View>
      <Pressable testID={`${section}-close-pending`} onPress={() => setPendingOpen(false)}
        accessibilityRole="button" accessibilityLabel={t('common.close')}
        style={({ pressed }) => [styles.pendingClose, pressed && styles.pressed]}>
        <Ionicons name="close" size={20} color={colors.inkSoft} />
      </Pressable>
    </View>
    <ScrollView testID={`${section}-pending-scroll`} style={[styles.pendingScroll, { height: pendingContentHeight }]}
      keyboardShouldPersistTaps="handled" nestedScrollEnabled
      onContentSizeChange={(_width, height) => {
        if (height > 0) setPendingContentHeight(Math.min(240, Math.ceil(height)));
      }}
      showsVerticalScrollIndicator contentContainerStyle={styles.pendingGrid}>
      {unplaced.map((item) => <View key={item.instanceId} testID={`${section}-pending-${item.instanceId}`}
        pointerEvents="none" accessible accessibilityRole="image" accessibilityLabel={item.product.name}
        style={styles.pendingProduct}>
        <ProductImage uri={item.product.illustrationUrl} style={styles.pendingImage} />
      </View>)}
    </ScrollView>
  </PantryPendingPopover>;
  const cupboardVisible = section === 'pantry' && view === 'cupboard';
  const fridgeVisible = section === 'fridge' && view === 'cupboard';
  const fridgeBackground = { backgroundColor: scheme === 'dark' ? '#152E42' : '#D6EAF5' };
  const renderInventoryList = (inventorySection: PantrySection) => {
    if (!listVisited[inventorySection]) return null;
    const isFridge = inventorySection === 'fridge';
    const visible = section === inventorySection && view === 'list';
    const inventoryReady = isFridge ? fridge.ready : pantry.ready;
    return <View key={inventorySection} testID={`${inventorySection}-list-view`}
      style={[styles.viewLayer, !visible && styles.hiddenView, isFridge && fridgeBackground]}
      pointerEvents={visible ? 'auto' : 'none'} accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>
      {!isFridge && <PantryWoodBackground />}
      <GestureDetector gesture={isFridge ? fridgeListScrollGesture : listScrollGesture}><FlatList testID={`${inventorySection}-list`} style={styles.body}
        data={isFridge ? fridgeListItems : pantryScene.placed} keyExtractor={pantryItemKey}
        renderItem={isFridge ? renderFridgeListItem : renderListItem}
        initialNumToRender={10} maxToRenderPerBatch={8} windowSize={5}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, styles.productList, { paddingBottom: bottomPadding + 88 }]}
        ListFooterComponent={visible ? status : undefined}
        ListEmptyComponent={inventoryReady ? <Text style={styles.emptyList}>
          {t(isFridge ? 'pantry.emptyFridgeList' : 'pantry.emptyList')}
        </Text> : undefined} />
      </GestureDetector>
    </View>;
  };
  const headerColors = section === 'fridge'
    ? { backgroundColor: scheme === 'dark' ? '#203F56' : '#DDEEF8',
      borderBottomColor: scheme === 'dark' ? '#456B84' : '#B8D7E9' }
    : { backgroundColor: scheme === 'dark' ? '#49392D' : '#E8D7C3',
      borderBottomColor: scheme === 'dark' ? '#66503E' : '#CEB698' };
  return (
    <View testID="pantry-screen" style={styles.container}>
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
      <BlurTargetView ref={backgroundRef} style={styles.body}>
      <View testID="pantry-header" style={[styles.header, { paddingTop: insets.top + 4,
        ...headerColors }]}>
        <View style={styles.headerControls}>
          <SlidingSegments
            style={styles.sectionSelector}
            emphasized
            height={40}
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
              setPendingOpen(false);
              setAddAt(null);
              setNoSpace(null);
              editingLabelsRef.current = null;
              setEditingLabels(false);
              setDeletingProducts(false);
              Keyboard.dismiss();
              if (next === 'fridge') setFridgeVisited(true);
              setSection(next);
            }}
          />
          {viewSelector}
        </View>
      </View>
      <View style={styles.body}>
        {pantry.ready && <PantryImageBoundsProbe urls={pantryImageUrls} items={pantry.items}
          onBounds={pantry.setImageBounds} />}
        {fridgeVisited && fridge.ready && <PantryImageBoundsProbe
          urls={fridgeImageUrls} items={fridge.items} onBounds={fridge.setImageBounds} />}
        {/* Preserve the native images, SVG boards, gestures and scroll offset across view changes. */}
        <View testID="pantry-cupboard" style={[styles.viewLayer, !cupboardVisible && styles.hiddenView]}
          pointerEvents={cupboardVisible ? 'auto' : 'none'} accessibilityElementsHidden={!cupboardVisible}
          importantForAccessibility={cupboardVisible ? 'auto' : 'no-hide-descendants'}>
          <PantryWoodBackground />
          <GestureDetector gesture={scrollGesture}><ScrollView style={styles.body}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, styles.shelfContent, { paddingBottom: bottomPadding + 88 }]}>
            {pantry.ready && <PantryShelf items={pantryScene.placed} today={today} shelfCount={pantry.shelfCount}
              selectedId={selection?.section === 'pantry' ? selection.id : null}
              hiddenId={sourceHidden && selection?.section === 'pantry' ? selection.id : null} onSelect={select} onPlace={place}
              editingLabels={section === 'pantry' && editingLabels} shelfLabels={pantry.shelfLabels} onChangeShelfLabel={changeShelfLabel} onInsertShelfBelow={insertPantryShelf}
              onRemoveShelf={removePantryShelf} removableShelfIndices={pantry.removableShelfIndices}
              onRemove={section === 'pantry' && deletingProducts ? removePantryProduct : undefined}
              notesEnabled={cupboardVisible && !selection && !searchOpen}
              showAddSlots={false} canAdd={pantry.ready} scrollGesture={scrollGesture} />}
            <Pressable disabled={!pantry.ready || editingLabels} testID="pantry-add-shelf"
              accessibilityRole="button" accessibilityLabel={t('pantry.addShelf')}
              accessibilityState={{ disabled: !pantry.ready || editingLabels }}
              onPress={() => { if (!editingLabelsRef.current) { if (pantry.shelfCount >= maxShelfCount) { setPaywallVisible(true); return; } pantry.addShelf(); setNoSpace(null); } }}
              style={({ pressed }) => [styles.addShelfButton, (!pantry.ready || editingLabels || pressed) && styles.pressed]}>
              <Ionicons name="add" size={22} color="#FFF4E3" />
              <Text style={styles.addShelfLabel}>{t('pantry.addShelf')}</Text>
            </Pressable>
            {section === 'pantry' && status}
          </ScrollView></GestureDetector>
        </View>
        {renderInventoryList('pantry')}
        {renderInventoryList('fridge')}
        {fridgeVisited && <View testID="pantry-fridge" style={[styles.viewLayer, !fridgeVisible && styles.hiddenView]}
          pointerEvents={fridgeVisible ? 'auto' : 'none'} accessibilityElementsHidden={!fridgeVisible}
          importantForAccessibility={fridgeVisible ? 'auto' : 'no-hide-descendants'}>
          <PantryFridge bottomPadding={bottomPadding} items={fridgeScene.placed} today={today} shelfCount={fridge.shelfCount}
            selectedId={selection?.section === 'fridge' ? selection.id : null}
            hiddenId={sourceHidden && selection?.section === 'fridge' ? selection.id : null}
            onSelect={selectFridge} onPlace={placeFridge} showAddSlots={false} canAdd={fridge.ready}
            editingLabels={section === 'fridge' && editingLabels} shelfLabels={fridge.shelfLabels}
            onRemove={section === 'fridge' && deletingProducts ? removeFridgeProduct : undefined}
            notesEnabled={fridgeVisible && !selection && !searchOpen}
            onChangeShelfLabel={changeFridgeShelfLabel} onInsertShelfBelow={insertFridgeShelf}
            onRemoveShelf={removeFridgeShelf} removableShelfIndices={fridge.removableShelfIndices}
            onAddShelf={() => { if (!editingLabelsRef.current) { if (fridge.shelfCount >= maxShelfCount) { setPaywallVisible(true); return; } fridge.addShelf(); setNoSpace(null); } }}
            footer={fridgeVisible ? status : null} />
        </View>}
        {pendingProducts}
        {!selected && !searchOpen && unplaced.length > 0 && <View pointerEvents="box-none"
          style={[styles.pendingAction, {
            bottom: tabBarOffset + PANTRY_ACTION_NAV_GAP - (PANTRY_ACTION_TOUCH_SIZE - PANTRY_ACTION_VISUAL_SIZE) / 2,
            left: Math.max(16, insets.left + 8),
          }]}>
          <Pressable testID={`${section}-pending-products`} disabled={!ready || editingLabels}
            onPress={() => { setPendingOpen(previous => !previous); Keyboard.dismiss(); }}
            accessibilityRole="button" accessibilityLabel={t('pantry.pendingProducts', { count: unplaced.length })}
            accessibilityState={{ disabled: !ready || editingLabels, expanded: pendingOpen }}
            style={({ pressed }) => [styles.floatingAction, (!ready || editingLabels || pressed) && styles.pressed]}>
            <View style={[styles.floatingActionFace, section === 'fridge' && styles.fridgeFloatingActionFace,
              pendingOpen && styles.floatingActionSelected]}>
              <Ionicons name="file-tray-full-outline" size={16.5} color="#FFF4E3" />
            </View>
          </Pressable>
        </View>}
        {!selected && !searchOpen && <View testID={`${section}-floating-actions`} pointerEvents="box-none"
          style={[styles.floatingActions, {
            bottom: tabBarOffset + PANTRY_ACTION_NAV_GAP - (PANTRY_ACTION_TOUCH_SIZE - PANTRY_ACTION_VISUAL_SIZE) / 2,
            right: Math.max(16, insets.right + 8),
          }]}>
          {deletingProducts && <Pressable testID={`${section}-delete-all`} disabled={!ready || !items.length}
            onPress={requestDeleteAll} accessibilityRole="button" accessibilityLabel={t('pantry.deleteAll')}
            accessibilityState={{ disabled: !ready || !items.length }}
            style={({ pressed }) => [styles.deleteAllAction, (!ready || !items.length || pressed) && styles.pressed]}>
            <View style={[styles.deleteAllFace, styles.deleteActionSelected]}>
              <Text style={styles.deleteAllText}>{t('pantry.deleteAll')}</Text>
            </View>
          </Pressable>}
          <Pressable testID={`${section}-delete-products`} disabled={!ready} onPress={() => {
            if (!ready) return;
            editingLabelsRef.current = null;
            setEditingLabels(false);
            setDeletingProducts((previous) => !previous);
            closeFocus();
            setNoSpace(null);
            Keyboard.dismiss();
          }} accessibilityRole="button"
            accessibilityLabel={t(deletingProducts ? 'pantry.finishDeletingProducts' : 'pantry.deleteProducts')}
            accessibilityState={{ disabled: !ready, selected: deletingProducts }}
            style={({ pressed }) => [styles.floatingAction, (!ready || pressed) && styles.pressed]}>
            <View style={[styles.floatingActionFace, section === 'fridge' && styles.fridgeFloatingActionFace,
              deletingProducts && styles.deleteActionSelected]}>
              <Ionicons name="trash-outline" size={16.5} color="#FFF4E3" />
            </View>
          </Pressable>
          <Pressable testID={`${section}-add-product`} disabled={!ready || editingLabels} onPress={openProductSearch}
            accessibilityRole="button" accessibilityLabel={t(section === 'fridge' ? 'pantry.addFridgeProduct' : 'pantry.addProduct')}
            accessibilityState={{ disabled: !ready || editingLabels }}
            style={({ pressed }) => [styles.floatingAction, (!ready || editingLabels || pressed) && styles.pressed]}>
            <View style={[styles.floatingActionFace, section === 'fridge' && styles.fridgeFloatingActionFace]}>
              <Ionicons name="nutrition-outline" size={16.5} color="#FFF4E3" />
            </View>
          </Pressable>
          <Pressable testID={`${section}-edit`} disabled={!ready} onPress={toggleLabelEditing} accessibilityRole="button"
            accessibilityLabel={t(editingLabels ? 'pantry.finishShelfEditing' : section === 'fridge' ? 'pantry.editFridge' : 'pantry.editPantry')}
            accessibilityState={{ disabled: !ready, selected: editingLabels }}
            style={({ pressed }) => [styles.floatingAction, (!ready || pressed) && styles.pressed]}>
            <View style={[styles.floatingActionFace, section === 'fridge' && styles.fridgeFloatingActionFace, editingLabels && styles.floatingActionSelected]}>
              <Ionicons name={editingLabels ? 'checkmark' : 'pencil-outline'} size={15.4} color="#FFF4E3" />
            </View>
          </Pressable>
        </View>}
      </View>
      </BlurTargetView>
      {selected && !searchOpen && <PantryProductFocus key={`${section}:${selected.instanceId}:${activeCart?.listId ?? 'no-cart'}`}
        activeListId={activeCart?.listId ?? null}
        product={selected.product} sourceRef={selection?.sourceRef} backgroundRef={backgroundRef}
        section={section}
        quantity={pantryQuantity(selected.quantity)} notes={selected.notes ?? ''}
        kitchenLocation={selected.kitchenLocation ?? ''} kitchenLocationOptions={kitchenLocationOptions}
        onKitchenLocationOptionsChange={setKitchenLocationOptions}
        shelfLabels={shelfLabels ?? {}} selectedShelfGroup={selectedShelfGroup} onChooseShelf={changeSelectedShelf}
        otherShelfLabels={otherInventory.shelfLabels ?? {}} onChooseOtherShelf={changeSelectedOtherShelf}
        expiryDate={selected.expiryDate ?? null}
        today={today}
        onEdit={editSelected} saveError={saveError} onRetrySave={retrySave}
        onFinish={finishSelected} onAddToCart={addSelectedToCart} onShowDetails={() => setDetailOpen(true)}
        onReady={hideSource} onClose={closeFocus}>
        <StoreProductModal roundedTop target={detailOpen
          ? { store: selected.product.store ?? 'mercadona', id: selected.product.id }
          : null} onClose={() => setDetailOpen(false)} />
      </PantryProductFocus>}
      {searchOpen && <PantryProductPicker section={section} shelfLabels={shelfLabels} onConfirm={add} onAddPurchase={addPurchase} onClose={() => {
        setSearchOpen(false);
        setAddAt(null);
      }} />}
    </View>
  );
}

/** Bind late gesture commits to their original inventory, even after a section change. */
function usePlaceProduct({ update, shelfCount }: ReturnType<typeof usePantryInventory>, section: PantrySection,
  setNoSpace: (section: PantrySection | null) => void, locked?: RefObject<PantrySection | null>) {
  return useCallback((instanceId: string, placement: PantryPlacement, beforeId?: string | null) => {
    if (locked?.current) return;
    update((previous) => {
      if (!previous.some(item => item.instanceId === instanceId)) return previous;
      const { placed: shelf, unplaced: pending } = arrangePantryItems(previous, shelfCount);
      const current = [...shelf, ...pending].find(item => item.instanceId === instanceId)!;
      const positions = Object.fromEntries(shelf.map(item => [item.instanceId, clampPantryPlacement(item, shelfCount)]));
      positions[instanceId] ??= clampPantryPlacement(current, shelfCount);
      const next = insertPantryPlacement(positions, instanceId, placement, shelfCount, beforeId);
      setNoSpace(next ? null : section);
      if (!next) return previous;
      return [...shelf, ...pending].map(item => {
        if (!next[item.instanceId]) return item;
        const { pendingPlacement: _pending, ...placedItem } = item;
        return { ...placedItem, ...next[item.instanceId] };
      });
    });
  }, [update, shelfCount, section, setNoSpace, locked]);
}

const pantryItemKey = (item: PantryItem) => item.instanceId;

const PantryListRow = memo(function PantryListRow({ item, today, onSelect, disabled, onRemove, notesEnabled, section = 'pantry' }: {
  item: PantryItem;
  today?: string;
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void;
  notesEnabled: boolean;
  disabled: boolean;
  section?: PantrySection;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const quantity = pantryQuantity(item.quantity);
  const quantityLabel = t(quantity === 1 ? 'pantry.oneUnit' : 'pantry.units', { count: quantity });
  const expiryDate = isPantryExpiryDate(item.expiryDate)
    ? `${item.expiryDate.slice(8, 10)}/${item.expiryDate.slice(5, 7)}/${item.expiryDate.slice(0, 4)}` : null;
  const expiryStatus = pantryExpiryStatus(item.expiryDate, today);
  const expiryLabel = expiryStatus ? t(expiryStatus === 'expired' ? 'pantry.expired' : 'pantry.expiringSoon') : '';
  const accessibilityLabel = `${item.product.name}. ${quantityLabel}${expiryDate ? `. ${t('pantry.expiry')}: ${expiryDate}` : ''}${expiryLabel ? `. ${expiryLabel}` : ''}`;
  const hasNote = !expiryStatus && !!item.notes?.trim() && !onRemove && !disabled;
  return <Pressable testID={`${section}-list-item-${item.instanceId}`}
    disabled={disabled} accessibilityState={{ disabled }}
    accessible={!onRemove && !hasNote} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    onPress={() => { if (!onRemove) onSelect(item.instanceId); }}
    style={({ pressed }) => [styles.productRow, pressed && styles.pressed]}>
    <ProductImage uri={item.product.illustrationUrl} style={styles.productImage} />
    <View style={styles.productText} accessible={hasNote} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityActions={hasNote ? [{ name: 'activate' }] : []}
      onAccessibilityAction={({ nativeEvent }) => { if (hasNote && nativeEvent.actionName === 'activate') onSelect(item.instanceId); }}
      onAccessibilityTap={() => { if (hasNote) onSelect(item.instanceId); }}>
      <View style={styles.productTitleRow}>
        <Text style={styles.productName}>{item.product.name}</Text>
        {quantity > 1 && <View style={styles.quantityBadge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={styles.quantityBadgeText}>{quantity}</Text>
        </View>}
      </View>
      {expiryDate && <Text style={styles.productExpiry}>{t('pantry.expiry')}: {expiryDate}</Text>}
    </View>
    {onRemove && <Pressable testID={`${section}-delete-item-${item.instanceId}`}
      style={({ pressed }) => [styles.deleteProductButton, pressed && styles.pressed]}
      accessibilityRole="button" accessibilityLabel={t('pantry.deleteProduct', { name: item.product.name })}
      onPress={(event) => { event.stopPropagation(); onRemove(item.instanceId); }}>
      <Ionicons name="trash" size={16} color="#D32F2F" />
    </Pressable>}
    {expiryStatus && !onRemove && !disabled && <View testID={`${section}-expiry-alarm-${item.instanceId}`}
      pointerEvents="none" style={styles.productNoteButton}><PantryExpiryAlarm /></View>}
    {hasNote && <View style={styles.productNoteButton}>
      <PantryNoteButton notes={item.notes!} name={item.product.name}
        testID={`${section}-note-item-${item.instanceId}`} enabled={notesEnabled} />
    </View>}
    {!disabled && !onRemove && <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />}
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
  viewSelector: { width: 44, flexShrink: 0 },
  body: { flex: 1 },
  // Keep both scroll viewports measured, including their offsets and image sizes.
  viewLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hiddenView: { opacity: 0 },
  deleteProductButton: { alignSelf: 'flex-start', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  productNoteButton: { alignSelf: 'flex-start' },
  deleteActionSelected: { backgroundColor: '#D32F2F', borderColor: '#D32F2F' },
  floatingActions: { position: 'absolute', flexDirection: 'row', gap: 0, zIndex: 2 },
  deleteAllAction: { minWidth: 96, maxWidth: 120, height: PANTRY_ACTION_TOUCH_SIZE, justifyContent: 'center', paddingHorizontal: 4 },
  deleteAllFace: { minHeight: PANTRY_ACTION_VISUAL_SIZE, borderRadius: PANTRY_ACTION_VISUAL_SIZE / 2,
    paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' },
  deleteAllText: { fontFamily: fonts.semibold, fontSize: 12, color: '#FFF4E3', textAlign: 'center' },
  floatingAction: { width: PANTRY_ACTION_TOUCH_SIZE, height: PANTRY_ACTION_TOUCH_SIZE,
    alignItems: 'center', justifyContent: 'center' },
  floatingActionFace: { width: PANTRY_ACTION_VISUAL_SIZE, height: PANTRY_ACTION_VISUAL_SIZE,
    borderRadius: PANTRY_ACTION_VISUAL_SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(61, 36, 19, 0.94)', borderWidth: 1, borderColor: 'rgba(255, 240, 212, 0.55)',
    shadowColor: '#25150C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 4,
    elevation: 3 },
  fridgeFloatingActionFace: { backgroundColor: '#285C7F', borderColor: '#A9D3EB', shadowColor: '#102A3C' },
  floatingActionSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  pressed: { opacity: 0.65 },
  content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  shelfContent: { paddingHorizontal: 10 },
  productList: { gap: 7 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8,
    borderRadius: 14, backgroundColor: withAlpha(colors.white, 0.60), borderWidth: 1, borderColor: colors.border },
  productImage: { width: 44, height: 50, borderRadius: 8 },
  productText: { flex: 1, gap: 2 },
  productTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  productName: { flex: 1, flexShrink: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  productExpiry: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 14, color: colors.inkSoft },
  quantityBadge: { minWidth: 24, height: 24, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.accent, borderRadius: 12, backgroundColor: colors.accentLight },
  quantityBadgeText: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.accent },
  emptyList: { padding: 24, textAlign: 'center', fontFamily: fonts.regular, fontSize: 14,
    lineHeight: 21, color: colors.inkSoft },
  addShelfButton: { minHeight: 48, alignSelf: 'center', maxWidth: '100%', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 24, backgroundColor: 'rgba(61, 36, 19, 0.9)',
    borderWidth: 1, borderColor: 'rgba(255, 240, 212, 0.4)' },
  addShelfLabel: { flexShrink: 1, color: '#FFF4E3', fontFamily: fonts.semibold, fontSize: 14 },
  info: { minHeight: 34, color: colors.inkSoft, fontSize: 13, lineHeight: 17,
    fontFamily: fonts.regular, padding: 8, backgroundColor: colors.white, borderRadius: 12 },
  error: { borderRadius: 12, padding: 12, backgroundColor: colors.surfaceAlt, minHeight: 44, justifyContent: 'center' },
  errorText: { fontFamily: fonts.medium, color: colors.red, fontSize: 13, textAlign: 'center' },
  pendingAction: { position: 'absolute', zIndex: 2 },
  pendingPanel: { position: 'absolute', borderRadius: 26, backgroundColor: colors.paper,
    borderWidth: 1, borderColor: colors.border, padding: 12, zIndex: 3,
    shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 12 },
  pendingHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 2, paddingBottom: 12 },
  pendingHeaderIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center' },
  pendingHeading: { flex: 1, gap: 3 },
  pendingTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  pendingSubtitle: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.inkSoft },
  pendingClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  pendingScroll: { flexGrow: 0, flexShrink: 0 },
  pendingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 2 },
  pendingProduct: { width: '23%', aspectRatio: 0.9, borderRadius: 17, padding: 8,
    backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center' },
  pendingImage: { width: '100%', height: '100%', borderRadius: 10 },

});
