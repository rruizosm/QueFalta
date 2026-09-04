import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import {
  fetchLidlStoreCandidates,
  LidlStoreDirectoryUnavailableError,
  type LidlStoreCandidate,
} from '../api/lidlStores';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';

interface Props {
  postalCode: string;
  selectedStoreId: string | null;
  onSelect: (storeId: string) => void;
  inverse?: boolean;
}

export default function LidlStorePicker({
  postalCode,
  selectedStoreId,
  onSelect,
  inverse = false,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const [stores, setStores] = useState<LidlStoreCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setUnavailable(false);
    setStores([]);
    fetchLidlStoreCandidates(postalCode)
      .then((rows) => { if (active) setStores(rows); })
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof LidlStoreDirectoryUnavailableError) setUnavailable(true);
        else setError(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [postalCode]);

  return (
    <View style={styles.wrap}>
      <View style={styles.headingRow}>
        <View style={styles.lidlMark}><Text style={styles.lidlMarkText}>Lidl</Text></View>
        <View style={styles.headingCopy}>
          <Text style={[styles.title, inverse && styles.inverseText]}>{t('region.lidlStoreTitle')}</Text>
          <Text style={[styles.hint, inverse && styles.inverseMuted]}>{t('region.lidlStoreHint')}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={inverse ? colors.white : colors.accent} />
          <Text style={[styles.status, inverse && styles.inverseMuted]}>{t('region.lidlStoreLoading')}</Text>
        </View>
      ) : unavailable ? (
        <Text style={[styles.status, inverse && styles.inverseMuted]}>{t('region.lidlStoreUnavailable')}</Text>
      ) : error ? (
        <Text style={styles.error}>{t('region.lidlStoreError')}</Text>
      ) : stores.length === 0 ? (
        <Text style={[styles.status, inverse && styles.inverseMuted]}>{t('region.lidlStoreNone')}</Text>
      ) : stores.map((store) => {
        const selected = selectedStoreId === store.id;
        const address = [store.street, store.streetNumber].filter(Boolean).join(' ');
        return (
          <TouchableOpacity
            key={store.id}
            activeOpacity={0.82}
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(store.id);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${store.name}. ${address}, ${store.city}`}
            style={[
              styles.card,
              inverse && styles.cardInverse,
              selected && (inverse ? styles.cardSelectedInverse : styles.cardSelected),
            ]}
          >
            <Ionicons
              name="storefront-outline"
              size={19}
              color={selected ? (inverse ? colors.blue : colors.accent) : colors.inkSoft}
            />
            <View style={styles.cardCopy}>
              <View style={styles.storeNameRow}>
                <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text>
                {store.isDefault ? <Text style={styles.recommended}>{t('region.lidlStoreRecommended')}</Text> : null}
              </View>
              <Text style={styles.address} numberOfLines={2}>
                {[address, `${store.postalCode} ${store.city}`].filter(Boolean).join(' · ')}
              </Text>
              {!store.catalogSyncedAt ? (
                <Text style={styles.pending}>{t('region.lidlCatalogPending')}</Text>
              ) : null}
            </View>
            <Ionicons
              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={selected ? (inverse ? colors.blue : colors.accent) : colors.inkFaint}
            />
          </TouchableOpacity>
        );
      })}
    </View>
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
  storeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  storeName: { flexShrink: 1, color: colors.ink, fontFamily: fonts.bold, fontSize: 13.5 },
  recommended: {
    color: colors.accent, fontFamily: fonts.bold, fontSize: 9.5,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  address: { color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 11.5, lineHeight: 15 },
  pending: { color: colors.orange, fontFamily: fonts.bold, fontSize: 10.5 },
});
