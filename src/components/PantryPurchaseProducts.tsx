import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fetchPurchaseItems } from '../api/purchases';
import { resolvePantryPurchaseProducts } from '../api/pantry';
import type { NewListItem } from '../api/lists';
import type { PantryProduct, PantryPurchaseProduct, PantrySection } from '../lib/pantryLayout';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';

import PantryImageBoundsProbe from './PantryImageBoundsProbe';
import { usePantryAddMeasurements } from '../hooks/usePantryAddMeasurements';
import type { PantryVisibleBounds } from '../lib/pantryVisibleBounds';

interface PurchaseProduct { item: NewListItem; product: PantryProduct | null }

/** Purchase detail for pantry selection. Profile history keeps its prices/actions. */
export default function PantryPurchaseProducts({ purchaseId, onAddPurchase, section = 'pantry' }: {
  purchaseId: string;
  section?: PantrySection;
  onAddPurchase: (products: readonly PantryPurchaseProduct[], bounds?: ReadonlyMap<string, PantryVisibleBounds>) => boolean;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const [rows, setRows] = useState<PurchaseProduct[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [noSpace, setNoSpace] = useState(false);
  const adding = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setRows(null); setError(false); setNoSpace(false); adding.current = false;
    void fetchPurchaseItems(purchaseId, controller.signal).then(async (items) => {
      if (controller.signal.aborted) return;
      const products = await resolvePantryPurchaseProducts(items, controller.signal);
      if (!controller.signal.aborted) setRows(items.map((item, index) => ({ item, product: products[index] })));
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [purchaseId, attempt]);

  const measurements = usePantryAddMeasurements((rows ?? []).flatMap(row => row.product ? [row.product] : []));

  if (error) return <View style={styles.status}>
    <Text style={styles.notice} accessibilityRole="alert">{t('history.detailError')}</Text>
    <Pressable style={styles.retry} onPress={() => setAttempt((value) => value + 1)} accessibilityRole="button">
      <Text style={styles.retryText}>{t('common.retry')}</Text>
    </Pressable>
  </View>;
  if (!rows) return <ActivityIndicator color={colors.accent} style={styles.status} />;
  if (!rows.length) return <Text style={[styles.notice, styles.status]}>{t('history.noDetail')}</Text>;

  const available = rows.flatMap(({ item, product }): PantryPurchaseProduct[] => product ? [{ product, quantity: item.quantity }] : []);
  return <View testID="pantry-purchase-products"><PantryImageBoundsProbe key={measurements.attempt} urls={measurements.urls} onBounds={measurements.onBounds} />{rows.map(({ item, product }, index) => (
    <View key={index} style={styles.row}
      testID={`pantry-purchase-product-${index}`}>
      {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.thumbnail} resizeMode="contain" />
        : <View style={styles.thumbnail}><Text style={styles.emoji}>{item.categoryEmoji ?? '🛒'}</Text></View>}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{item.productName}</Text>
        <Text style={styles.quantity}>{item.quantity} {item.unit ?? 'ud'}</Text>
        {!product && <Text style={styles.notice}>{t(section === 'fridge' ? 'pantry.fridgeProductUnavailable' : 'pantry.productUnavailable')}</Text>}
      </View>
    </View>
  ))}
    {measurements.failed && <View><Text style={styles.notice} accessibilityRole="alert">{t('pantry.measureError')}</Text>
      <Pressable onPress={measurements.retry} accessibilityRole="button" style={styles.retry}><Text style={styles.retryText}>{t('common.retry')}</Text></Pressable></View>}
    {noSpace && <Text style={styles.notice} accessibilityRole="alert">{t('pantry.noSpace')}</Text>}
    <Pressable testID="pantry-add-purchase" accessibilityRole="button"
      accessibilityLabel={t(section === 'fridge' ? 'pantry.addFridgePurchase' : 'pantry.addPurchase')} accessibilityState={{ disabled: !available.length || !measurements.ready }}
      disabled={!available.length || !measurements.ready} onPress={() => {
        if (!available.length || !measurements.ready || adding.current) return;
        adding.current = true;
        if (!onAddPurchase(available, measurements.bounds)) { adding.current = false; setNoSpace(true); }
      }} style={({ pressed }) => [styles.addPurchase, (!available.length || !measurements.ready) && styles.addPurchaseDisabled,
        pressed && styles.addPurchasePressed]}>
      <Ionicons name="basket-outline" size={16} color={colors.white} />
      {available.length > 0 && !measurements.ready && !measurements.failed && <ActivityIndicator color={colors.white} />}
      <Text style={styles.addPurchaseText}>{t(available.length > 0 && !measurements.ready && !measurements.failed ? 'pantry.measuringProducts' : section === 'fridge' ? 'pantry.addFridgePurchase' : 'pantry.addPurchase')}</Text>
    </Pressable>
  </View>;
}

const themedStyles = () => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 56, paddingVertical: 10 },
  addPurchase: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: colors.accent, borderRadius: 14, minHeight: 44,
    paddingHorizontal: 12, paddingVertical: 11, marginTop: 8, marginBottom: 4,
  },
  addPurchaseText: { flexShrink: 1, fontSize: 13.5, fontFamily: fonts.bold, color: colors.white, textAlign: 'center' },
  addPurchaseDisabled: { opacity: 0.45 },
  addPurchasePressed: { opacity: 0.8 },
  thumbnail: { width: 36, height: 36, borderRadius: 5, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 18 },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 13, fontFamily: fonts.semibold, color: colors.ink },
  quantity: { fontSize: 11, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  notice: { fontSize: 12, lineHeight: 17, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 3 },
  status: { paddingVertical: 16 },
  retry: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.accent },
});
