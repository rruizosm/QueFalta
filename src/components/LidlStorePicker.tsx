import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import {
  fetchLidlStores,
  LidlStoreDirectoryUnavailableError,
  type LidlStoreCandidate,
} from '../api/lidlStores';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import LidlStoreMap from './LidlStoreMap';

interface Props {
  postalCode: string | null;
  selectedStoreId: string | null;
  onSelect: (storeId: string) => Promise<void>;
  required: boolean;
  onClose: () => void;
  inverse?: boolean;
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export default function LidlStorePicker({
  postalCode,
  selectedStoreId,
  onSelect,
  inverse = false,
  required,
  onClose,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const [stores, setStores] = useState<LidlStoreCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const open = true;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const select = async (id: string) => {
    if (lock.current || id === selectedStoreId) return;
    lock.current = true; setSaving(true); setSaveError(false);
    try { await onSelect(id); } catch { setSaveError(true); }
    finally { lock.current = false; setSaving(false); }
  };
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setUnavailable(false);
    setStores([]);
    fetchLidlStores()
      .then((rows) => { if (active) setStores(rows); })
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof LidlStoreDirectoryUnavailableError) setUnavailable(true);
        else setError(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  const selectedStore = stores.find((store) => store.id === selectedStoreId) ?? null;
  const filteredStores = useMemo(() => {
    const needle = normalizeSearch(query);
    if (!needle) return stores;
    return stores.filter((store) => normalizeSearch([
      store.name,
      store.street,
      store.streetNumber,
      store.postalCode,
      store.city,
    ].filter(Boolean).join(' ')).includes(needle));
  }, [query, stores]);

  const storeCard = (store: LidlStoreCandidate, inModal = false) => {
    const selected = selectedStoreId === store.id;
    const address = [store.street, store.streetNumber].filter(Boolean).join(' ');
    return (
      <TouchableOpacity
        activeOpacity={0.82}
        onPress={() => {
          Haptics.selectionAsync();
          void select(store.id);
        }}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`${store.name}. ${address}, ${store.city}`}
        style={[
          styles.card,
          inverse && !inModal && styles.cardInverse,
          selected && (inverse && !inModal ? styles.cardSelectedInverse : styles.cardSelected),
        ]}
      >
        <Ionicons
          name="storefront-outline"
          size={19}
          color={selected ? (inverse && !inModal ? colors.blue : colors.accent) : colors.inkSoft}
        />
        <View style={styles.cardCopy}>
          <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text>
          <Text style={styles.address} numberOfLines={2}>
            {[address, `${store.postalCode} ${store.city}`].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={selected ? (inverse && !inModal ? colors.blue : colors.accent) : colors.inkFaint}
        />
      </TouchableOpacity>
    );
  };

  return (
          <Modal visible={open} animationType="slide" presentationStyle={required ? "fullScreen" : "pageSheet"} onRequestClose={() => { if (!required && !saving) onClose(); }}>
            <SafeAreaView style={styles.modalScreen}>
              <View style={styles.modalHeader}>
                {!required ? <TouchableOpacity disabled={saving} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.closeButton}>
                  <Ionicons name="close" size={23} color={colors.ink} />
                </TouchableOpacity> : <View style={styles.closeButton} />}
                <Text style={styles.modalTitle}>{t('region.lidlStoreTitle')}</Text>
                <View style={styles.closeButton} />
              </View>
              {selectedStore ? <View style={styles.selectedStoreContainer}>{storeCard(selectedStore)}</View> : <Text style={styles.mapHint}>{t('catalog.lidlStoreRequired')}</Text>}
              {loading ? <ActivityIndicator /> : unavailable || error ? <View style={styles.card}>
                <Text style={styles.error}>{t(unavailable ? 'region.lidlStoreUnavailable' : 'region.lidlStoreError')}</Text>
                <TouchableOpacity onPress={() => setRetry(n => n + 1)}><Text>{t('common.retry')}</Text></TouchableOpacity>
              </View> : null}
              <View style={styles.searchBox}>
                <Ionicons name="search" size={18} color={colors.inkSoft} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t('region.lidlStoreSearch')}
                  accessibilityLabel={t('region.lidlStoreSearch')}
                  placeholderTextColor={colors.inkFaint}
                  autoCorrect={false}
                  autoCapitalize="none"
                  style={styles.searchInput}
                />
                {query ? (
                  <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('common.clear')}>
                    <Ionicons name="close-circle" size={20} color={colors.inkSoft} />
                  </TouchableOpacity>
                ) : null}
              </View>
              {open ? <LidlStoreMap
                stores={stores}
                postalCode={postalCode}
                selectedStoreId={selectedStoreId}
                onSelect={(id) => {
                  Haptics.selectionAsync();
                  void select(id);
                }}
              /> : null}
              {saving ? <ActivityIndicator /> : null}
              {saveError ? <Text style={styles.error}>{t('onboarding.saveError')}</Text> : null}
              {query ? <FlatList
                automaticallyAdjustKeyboardInsets
                style={styles.searchResults}
                data={filteredStores}
                keyExtractor={(store) => store.id}
                renderItem={({ item }) => storeCard(item, true)}
                contentContainerStyle={styles.storeList}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                ListEmptyComponent={<Text style={styles.empty}>{t('region.lidlStoreNoResults')}</Text>}
              /> : <Text style={styles.mapHint}>{t('region.lidlMapHint')}</Text>}
            </SafeAreaView>
          </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  wrap: { gap: 9, marginTop: 6 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lidlMark: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#0050aa',
    borderWidth: 3, borderColor: '#ffdd00', alignItems: 'center', justifyContent: 'center',
  },
  lidlMarkText: { color: colors.white, fontSize: 11, fontFamily: fonts.bold },
  headingCopy: { flex: 1, gap: 1 },
  title: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14 },
  hint: { color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 11.5, lineHeight: 16 },
  inverseText: { color: colors.white },
  inverseMuted: { color: 'rgba(255,255,255,0.82)' },
  statusRow: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 40 },
  status: { color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17 },
  error: { color: colors.red, fontFamily: fonts.medium, fontSize: 12.5 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderRadius: 16,
  },
  cardInverse: { borderColor: 'rgba(255,255,255,0.72)' },
  cardSelected: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  cardSelectedInverse: { borderColor: colors.blue, backgroundColor: '#edf4fc' },
  cardCopy: { flex: 1, minWidth: 0, gap: 2 },
  storeName: { flexShrink: 1, color: colors.ink, fontFamily: fonts.bold, fontSize: 13.5 },
  address: { color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 11.5, lineHeight: 15 },
  chooseButton: {
    minHeight: 48, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1,
    borderColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  chooseButtonInverse: { borderColor: 'rgba(255,255,255,0.72)' },
  chooseText: { flex: 1, color: colors.accent, fontFamily: fonts.bold, fontSize: 13.5 },
  modalScreen: { flex: 1, backgroundColor: colors.paper },
  selectedStoreContainer: { paddingHorizontal: 16, paddingTop: 12 },
  modalHeader: {
    minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 17 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  searchBox: {
    margin: 16, marginBottom: 6, minHeight: 48, paddingHorizontal: 14, borderRadius: 16,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  searchInput: { flex: 1, color: colors.ink, fontFamily: fonts.medium, fontSize: 15 },
  storeList: { padding: 16, gap: 9, paddingBottom: 36 },
  searchResults: { maxHeight: 160, flexGrow: 0 },
  mapHint: { padding: 14, color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 12 },
  empty: { padding: 24, textAlign: 'center', color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 13 },
});
