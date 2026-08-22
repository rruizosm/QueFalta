import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { limitsApply } from '../constants/limits';
import { CATALOG_STORE_KEYS, STORE_META, type CatalogStore } from '../constants/stores';
import { storeInRegion, storesForRegion } from '../constants/regions';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useProfile } from '../context/ProfileContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { searchCatalogStores } from '../lib/catalogSearch';
import type { UIProduct } from '../lib/productAdapters';
import type { LinkedNoteProduct } from '../api/lists';
import ProductImage from './ProductImage';
import PaywallModal from './PaywallModal';

export const PRODUCT_NOTE_MAX_LENGTH = 280;

type Props = {
  visible: boolean;
  productName: string;
  initialValue: string | null;
  initialProduct: LinkedNoteProduct | null;
  busy?: boolean;
  onSave: (note: string | null, product: LinkedNoteProduct | null) => void;
  onClose: () => void;
};

const normalizeNote = (value: string | null | undefined) => value?.trim() || null;
const productKey = (product: LinkedNoteProduct | null | undefined) => product
  ? `${product.store}:${product.id}:${product.name}:${product.imageUrl ?? ''}:${product.unitPrice ?? ''}`
  : '';

const linkedProductFromCatalog = (product: UIProduct): LinkedNoteProduct => ({
  store: product.store,
  id: product.id,
  name: product.name,
  imageUrl: product.imageUrl,
  unitPrice: product.unitPrice,
});

const euro = (value: number | null) => value == null
  ? null
  : `${value.toFixed(2).replace('.', ',')} €`;

export default function ProductNoteSheet({
  visible,
  productName,
  initialValue,
  initialProduct,
  busy = false,
  onSave,
  onClose,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation();
  const { profile, isPremium, loading: profileLoading } = useProfile();
  const [value, setValue] = useState(initialValue ?? '');
  const [selectedProduct, setSelectedProduct] = useState<LinkedNoteProduct | null>(initialProduct);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UIProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [pickerStore, setPickerStore] = useState<CatalogStore | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const noteProductLocked = !profileLoading && limitsApply(isPremium);

  const region = profile?.region ?? null;
  const postalCode = profile?.postalCode ?? null;
  const preferredStores = profile?.catalogStores ?? CATALOG_STORE_KEYS;
  const enabledStores = useMemo(() => {
    const enabledInRegion = preferredStores.filter((store) => storeInRegion(store, region));
    return enabledInRegion.length > 0 ? enabledInRegion : storesForRegion(region);
  }, [preferredStores, region]);

  useEffect(() => {
    if (!visible) {
      setPaywallVisible(false);
      return;
    }
    setValue(initialValue ?? '');
    setSelectedProduct(initialProduct);
    setPickerOpen(false);
    setQuery('');
    setResults([]);
    setSearching(false);
    setSearchError(false);
    setPickerStore(enabledStores.length === 1 ? enabledStores[0] : null);
  }, [enabledStores, initialProduct, initialValue, visible]);

  useEffect(() => {
    if (!pickerOpen || !pickerStore || noteProductLocked) {
      setResults([]);
      setSearching(false);
      setSearchError(false);
      return;
    }
    const normalized = query.trim();
    if (normalized.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setSearching(true);
    setSearchError(false);
    const handle = setTimeout(() => {
      searchCatalogStores(
        [pickerStore],
        normalized,
        region,
        postalCode,
        controller.signal,
        40,
      )
        .then((products) => { if (!cancelled) setResults(products); })
        .catch(() => { if (!cancelled) setSearchError(true); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(handle);
      controller.abort();
    };
  }, [noteProductLocked, pickerOpen, pickerStore, postalCode, query, region]);

  const normalizedValue = normalizeNote(value);
  const changed = normalizedValue !== normalizeNote(initialValue)
    || productKey(selectedProduct) !== productKey(initialProduct);
  const close = () => { if (!busy) onClose(); };
  const save = () => {
    const assigningProduct = selectedProduct != null
      && productKey(selectedProduct) !== productKey(initialProduct);
    if (noteProductLocked && assigningProduct) {
      setPaywallVisible(true);
      return;
    }
    if (!busy && changed) onSave(normalizedValue, selectedProduct);
  };
  const openPicker = () => {
    if (profileLoading || busy) return;
    if (noteProductLocked) {
      setPaywallVisible(true);
      return;
    }
    Keyboard.dismiss();
    setPickerOpen(true);
    setQuery('');
    setResults([]);
    setSearchError(false);
    setPickerStore(enabledStores.length === 1 ? enabledStores[0] : null);
  };
  const chooseStore = (store: CatalogStore) => {
    Haptics.selectionAsync();
    Keyboard.dismiss();
    setPickerStore(store);
    setQuery('');
    setResults([]);
    setSearchError(false);
  };
  const chooseProduct = (product: UIProduct) => {
    if (noteProductLocked) {
      setPickerOpen(false);
      setPaywallVisible(true);
      return;
    }
    Haptics.selectionAsync();
    setSelectedProduct(linkedProductFromCatalog(product));
    setPickerOpen(false);
  };

  const selectedStore = selectedProduct ? STORE_META[selectedProduct.store] : null;

  return (
    <>
      <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? 'none' : 'slide'}
      onRequestClose={pickerOpen ? () => setPickerOpen(false) : close}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessible={false} />
        <View
          style={[
            styles.sheet,
            pickerOpen && styles.pickerSheet,
            { paddingBottom: Platform.OS === 'ios' ? 30 : Math.max(insets.bottom, 20) },
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            {pickerOpen ? (
              <TouchableOpacity
                style={styles.iconBox}
                onPress={() => setPickerOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
              >
                <Ionicons name="arrow-back" size={20} color={colors.accent} />
              </TouchableOpacity>
            ) : (
              <View style={styles.iconBox}>
                <Ionicons name="chatbubble-ellipses-outline" size={21} color={colors.accent} />
              </View>
            )}
            <View style={styles.headerText}>
              <Text style={styles.title}>
                {pickerOpen ? t('list.noteProductPickerTitle') : t('list.noteTitle')}
              </Text>
              <Text style={styles.productName} numberOfLines={1}>
                {pickerOpen ? t('list.noteProductPickerSubtitle') : productName}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={close}
              disabled={busy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              accessibilityState={{ disabled: busy }}
            >
              <Ionicons name="close" size={18} color={colors.inkSoft} />
            </TouchableOpacity>
          </View>

          {pickerOpen ? (
            <View style={styles.pickerBody}>
              {enabledStores.length > 1 && (
                <View style={styles.storeSelector}>
                  <Text style={styles.storeSelectorTitle}>{t('list.noteStoreSelectTitle')}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.storeOptions}
                  >
                    {enabledStores.map((storeKey) => {
                      const store = STORE_META[storeKey];
                      const selected = pickerStore === storeKey;
                      return (
                        <TouchableOpacity
                          key={storeKey}
                          style={[styles.storeOption, selected && styles.storeOptionSelected]}
                          activeOpacity={0.7}
                          onPress={() => chooseStore(storeKey)}
                          accessibilityRole="button"
                          accessibilityLabel={t('list.noteStoreSelectA11y', { store: store.name })}
                          accessibilityState={{ selected }}
                        >
                          {store.icon ? (
                            <Image source={store.icon} style={styles.storeOptionIcon} resizeMode="contain" />
                          ) : (
                            <View style={styles.storeOptionIconFallback}>
                              <Ionicons name="storefront-outline" size={14} color={colors.inkSoft} />
                            </View>
                          )}
                          <Text
                            style={[styles.storeOptionText, selected && styles.storeOptionTextSelected]}
                            numberOfLines={1}
                          >
                            {store.name}
                          </Text>
                          {selected && <Ionicons name="checkmark" size={15} color={colors.accent} />}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {pickerStore ? (
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={18} color={colors.inkFaint} />
                  <TextInput
                    style={styles.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder={t('list.noteProductSearch')}
                    placeholderTextColor={colors.inkFaint}
                    autoFocus
                    autoCorrect={false}
                    returnKeyType="search"
                    accessibilityLabel={t('list.noteProductSearch')}
                  />
                  {!!query && (
                    <TouchableOpacity
                      onPress={() => setQuery('')}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.clear')}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={[styles.searchBox, styles.searchBoxDisabled]}>
                  <Ionicons name="search" size={18} color={colors.inkFaint} />
                  <Text style={styles.searchDisabledText}>{t('list.noteProductSearchDisabled')}</Text>
                </View>
              )}

              {!pickerStore ? (
                <Text style={styles.pickerStateText}>{t('list.noteStoreSelectHint')}</Text>
              ) : searching ? (
                <ActivityIndicator color={colors.accent} style={styles.pickerState} />
              ) : searchError ? (
                <Text style={styles.pickerStateText}>{t('catalog.searchError')}</Text>
              ) : query.trim().length < 2 ? (
                <Text style={styles.pickerStateText}>{t('catalog.minLetters')}</Text>
              ) : results.length === 0 ? (
                <Text style={styles.pickerStateText}>{t('catalog.noResults')}</Text>
              ) : (
                <FlatList
                  data={results}
                  keyExtractor={(item) => `${item.store}:${item.id}`}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.results}
                  renderItem={({ item }) => {
                    const store = STORE_META[item.store];
                    return (
                      <TouchableOpacity
                        style={styles.resultRow}
                        activeOpacity={0.7}
                        onPress={() => chooseProduct(item)}
                        accessibilityRole="button"
                        accessibilityLabel={t('list.noteProductSelectA11y', {
                          product: item.name,
                          store: store.name,
                        })}
                      >
                        {item.imageUrl ? (
                          <ProductImage uri={item.imageUrl} style={styles.resultImage} />
                        ) : (
                          <View style={styles.resultImagePlaceholder}>
                            <Ionicons name="basket-outline" size={20} color={colors.inkFaint} />
                          </View>
                        )}
                        <View style={styles.resultText}>
                          <Text style={styles.resultName} numberOfLines={2}>{item.name}</Text>
                          <View style={styles.resultMeta}>
                            <Text style={styles.resultStore} numberOfLines={1}>{store.name}</Text>
                            {!!item.priceLabel && <Text style={styles.resultPrice}>{item.priceLabel}</Text>}
                          </View>
                        </View>
                        {store.icon ? (
                          <Image source={store.icon} style={styles.storeLogo} resizeMode="contain" />
                        ) : (
                          <Ionicons name="storefront-outline" size={17} color={colors.inkFaint} />
                        )}
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.body}
            >
              <TextInput
                style={styles.input}
                placeholder={t('list.notePlaceholder')}
                placeholderTextColor={colors.inkFaint}
                value={value}
                onChangeText={setValue}
                autoFocus
                multiline
                maxLength={PRODUCT_NOTE_MAX_LENGTH}
                textAlignVertical="top"
                editable={!busy}
                accessibilityLabel={t('list.notePlaceholder')}
              />
              <Text style={styles.counter}>{value.length}/{PRODUCT_NOTE_MAX_LENGTH}</Text>

              <View style={styles.productSectionHeader}>
                <View style={styles.productSectionTitleRow}>
                  <Ionicons name="link-outline" size={17} color={colors.accent} />
                  <Text style={styles.productSectionTitle}>{t('list.noteProductTitle')}</Text>
                </View>
                {selectedProduct && (
                  <TouchableOpacity
                    style={styles.replaceButton}
                    onPress={openPicker}
                    disabled={busy || profileLoading}
                    accessibilityRole="button"
                    accessibilityLabel={t('list.noteProductReplace')}
                  >
                    {noteProductLocked && <Ionicons name="lock-closed" size={11} color={colors.accent} />}
                    <Text style={styles.replaceText}>{t('list.noteProductReplace')}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {selectedProduct ? (
                <View style={styles.selectedCard}>
                  {selectedProduct.imageUrl ? (
                    <ProductImage uri={selectedProduct.imageUrl} style={styles.selectedImage} />
                  ) : (
                    <View style={styles.selectedImagePlaceholder}>
                      <Ionicons name="basket-outline" size={19} color={colors.inkFaint} />
                    </View>
                  )}
                  <View style={styles.selectedText}>
                    <Text style={styles.selectedName} numberOfLines={2}>{selectedProduct.name}</Text>
                    <Text style={styles.selectedMeta} numberOfLines={1}>
                      {selectedStore?.name}{euro(selectedProduct.unitPrice) ? ` · ${euro(selectedProduct.unitPrice)}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.unlinkBtn}
                    onPress={() => setSelectedProduct(null)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={t('list.noteProductRemove')}
                  >
                    <Ionicons name="close" size={17} color={colors.inkSoft} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.linkProductBtn}
                  activeOpacity={0.7}
                  onPress={openPicker}
                  disabled={busy || profileLoading}
                  accessibilityRole="button"
                  accessibilityLabel={t('list.noteProductAdd')}
                  accessibilityHint={noteProductLocked ? t('list.noteProductPlusHint') : undefined}
                >
                  <Ionicons
                    name={noteProductLocked ? 'lock-closed' : 'add'}
                    size={noteProductLocked ? 15 : 19}
                    color={colors.accent}
                  />
                  <Text style={styles.linkProductText}>{t('list.noteProductAdd')}</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.productHint}>{t('list.noteProductHint')}</Text>

              <View style={styles.actions}>
                {(!!value || !!selectedProduct) && (
                  <TouchableOpacity
                    style={styles.clearBtn}
                    onPress={() => { setValue(''); setSelectedProduct(null); }}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={t('list.noteClear')}
                  >
                    <Ionicons name="trash-outline" size={17} color={colors.inkSoft} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.saveBtn, (!changed || busy) && styles.saveBtnDisabled]}
                  onPress={save}
                  disabled={!changed || busy}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.save')}
                  accessibilityState={{ disabled: !changed || busy, busy }}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={19} color={colors.white} />
                      <Text style={styles.saveText}>{t('common.save')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
      </Modal>
      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
      />
    </>
  );
}

const themedStyles = () => StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    maxHeight: '92%',
  },
  pickerSheet: { height: '84%' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  iconBox: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: { fontSize: 18, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.2 },
  productName: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  body: { paddingHorizontal: 20, paddingTop: 18 },
  input: {
    minHeight: 106,
    maxHeight: 170,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 16,
    backgroundColor: colors.white,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fonts.medium,
    color: colors.ink,
  },
  counter: {
    alignSelf: 'flex-end', marginTop: 6,
    fontSize: 11, fontFamily: fonts.medium, color: colors.inkFaint,
  },
  productSectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12, marginBottom: 8, gap: 10,
  },
  productSectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  productSectionTitle: { fontSize: 13.5, fontFamily: fonts.bold, color: colors.ink },
  replaceButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  replaceText: { fontSize: 12, fontFamily: fonts.bold, color: colors.accent },
  linkProductBtn: {
    minHeight: 48, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed',
    borderColor: colors.accentMid, backgroundColor: colors.accentLight,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  linkProductText: { fontSize: 13.5, fontFamily: fonts.bold, color: colors.accent },
  productHint: {
    marginTop: 7, fontSize: 11.5, lineHeight: 16,
    fontFamily: fonts.medium, color: colors.inkFaint,
  },
  selectedCard: {
    minHeight: 66, borderRadius: 16, borderWidth: 1, borderColor: colors.accentMid,
    backgroundColor: colors.accentLight, padding: 9,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  selectedImage: { width: 46, height: 46, borderRadius: 10, backgroundColor: colors.white },
  selectedImagePlaceholder: {
    width: 46, height: 46, borderRadius: 10, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  selectedText: { flex: 1 },
  selectedName: { fontSize: 12.5, lineHeight: 16, fontFamily: fonts.semibold, color: colors.ink },
  selectedMeta: { marginTop: 3, fontSize: 11, fontFamily: fonts.medium, color: colors.inkSoft },
  unlinkBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  clearBtn: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  saveBtn: {
    flex: 1, minHeight: 50, borderRadius: 25,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: colors.accent,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveText: { fontSize: 15, fontFamily: fonts.bold, color: colors.white },
  pickerBody: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  storeSelector: { marginBottom: 12 },
  storeSelectorTitle: {
    marginBottom: 8, fontSize: 12.5, fontFamily: fonts.bold, color: colors.ink,
  },
  storeOptions: { gap: 8, paddingRight: 4 },
  storeOption: {
    height: 44, maxWidth: 190, borderRadius: 22,
    paddingLeft: 6, paddingRight: 12,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
    flexDirection: 'row', alignItems: 'center', gap: 7,
  },
  storeOptionSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  storeOptionIcon: { width: 30, height: 30, borderRadius: 15 },
  storeOptionIconFallback: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  storeOptionText: { flexShrink: 1, fontSize: 12, fontFamily: fonts.semibold, color: colors.inkSoft },
  storeOptionTextSelected: { color: colors.ink },
  searchBox: {
    minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white, paddingHorizontal: 13,
    flexDirection: 'row', alignItems: 'center', gap: 9,
  },
  searchBoxDisabled: { opacity: 0.55 },
  searchInput: { flex: 1, fontSize: 14.5, fontFamily: fonts.medium, color: colors.ink, paddingVertical: 10 },
  searchDisabledText: { flex: 1, fontSize: 14, fontFamily: fonts.medium, color: colors.inkFaint },
  pickerState: { marginTop: 38 },
  pickerStateText: {
    marginTop: 34, paddingHorizontal: 16, textAlign: 'center',
    fontSize: 13, lineHeight: 18, fontFamily: fonts.medium, color: colors.inkSoft,
  },
  results: { paddingTop: 12, paddingBottom: 12 },
  resultRow: {
    minHeight: 70, paddingVertical: 9, paddingHorizontal: 9, marginBottom: 8,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  resultImage: { width: 50, height: 50, borderRadius: 10, backgroundColor: colors.surfaceAlt },
  resultImagePlaceholder: {
    width: 50, height: 50, borderRadius: 10, backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  resultText: { flex: 1 },
  resultName: { fontSize: 12.5, lineHeight: 16, fontFamily: fonts.semibold, color: colors.ink },
  resultMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  resultStore: { flexShrink: 1, fontSize: 10.5, fontFamily: fonts.medium, color: colors.inkSoft },
  resultPrice: { fontSize: 11, fontFamily: fonts.bold, color: colors.accent },
  storeLogo: { width: 25, height: 25, borderRadius: 5 },
});
