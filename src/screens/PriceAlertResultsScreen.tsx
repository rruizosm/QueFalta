import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRoute, type RouteProp } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { CATALOG_STORES } from '../constants/stores';
import {
  fetchPriceAlertNotificationProducts,
  type PriceAlertResultEventType,
  type PriceAlertResultProduct,
} from '../api/priceAlerts';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import ProfileSubscreenHeader from '../components/ProfileSubscreenHeader';
import StoreProductModal, { type ProductRef } from '../components/StoreProductModal';
import type { HomeStackParamList } from '../types';

const euro = (value: number) => `${value.toFixed(2).replace('.', ',')} €`;
const pct = (value: number) => `${Math.abs(value).toFixed(1).replace('.', ',')}%`;

export default function PriceAlertResultsScreen() {
  const styles = useThemedStyles(themedStyles);
  const route = useRoute<RouteProp<HomeStackParamList, 'PriceAlertResults'>>();
  const { t } = useTranslation();
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const [items, setItems] = useState<PriceAlertResultProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [target, setTarget] = useState<ProductRef | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setItems(await fetchPriceAlertNotificationProducts(route.params.notificationId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [route.params.notificationId]);

  useEffect(() => { load(); }, [load]);

  const storeNames = useMemo(
    () => Object.fromEntries(CATALOG_STORES.map((store) => [store.key, store.name])),
    [],
  );

  const eventLabel = (eventType: PriceAlertResultEventType) => {
    if (eventType === 'new_arrival') return t('priceAlerts.resultNew');
    if (eventType === 'new_offer') return t('priceAlerts.resultOffer');
    return t('priceAlerts.resultDrop');
  };

  const renderItem = ({ item }: { item: PriceAlertResultProduct }) => {
    const shownPrice = item.eventType === 'new_offer'
      ? item.promoPrice ?? item.currentPrice
      : item.currentPrice;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.82}
        onPress={() => setTarget({ store: item.store, id: item.productId })}
        accessibilityRole="button"
        accessibilityLabel={t('priceAlerts.openProduct', { product: item.displayName })}
      >
        <View style={styles.imageWrap}>
          {item.thumbnail ? (
            <Image source={{ uri: item.thumbnail }} style={styles.image} contentFit="contain" transition={120} />
          ) : (
            <Ionicons name="basket-outline" size={27} color={colors.inkFaint} />
          )}
        </View>
        <View style={styles.copy}>
          <View style={styles.metaRow}>
            <Text style={styles.store} numberOfLines={1}>{storeNames[item.store] ?? item.store}</Text>
            <View style={[
              styles.eventBadge,
              item.eventType === 'new_offer' && styles.eventOffer,
              item.eventType === 'new_arrival' && styles.eventNew,
            ]}>
              <Text style={styles.eventText}>{eventLabel(item.eventType)}</Text>
            </View>
          </View>
          <Text style={styles.productName} numberOfLines={2}>{item.displayName}</Text>
          {item.promoName && item.eventType === 'new_offer' ? (
            <Text style={styles.promo} numberOfLines={1}>{item.promoName}</Text>
          ) : item.categoryName ? (
            <Text style={styles.category} numberOfLines={1}>{item.categoryName}</Text>
          ) : null}
          <View style={styles.priceRow}>
            {shownPrice != null ? <Text style={styles.price}>{euro(shownPrice)}</Text> : null}
            {item.eventType === 'price_drop' && item.previousPrice != null ? (
              <Text style={styles.previous}>{t('priceAlerts.previousPrice', { price: euro(item.previousPrice) })}</Text>
            ) : null}
            {item.eventType === 'price_drop' && item.priceDeltaPct != null ? (
              <Text style={styles.dropPct}>−{pct(item.priceDeltaPct)}</Text>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
      <ProfileSubscreenHeader
        title={t('priceAlerts.resultsTitle')}
        icon="pricetag-outline"
        headerTop={headerTop}
      />

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={[styles.loader, { marginTop: headerTop + 100 }]} />
      ) : error ? (
        <View style={[styles.state, { paddingTop: headerTop + 100 }]}>
          <Ionicons name="cloud-offline-outline" size={38} color={colors.inkFaint} />
          <Text style={styles.stateText}>{t('priceAlerts.resultsError')}</Text>
          <TouchableOpacity style={styles.retry} onPress={load} accessibilityRole="button">
            <Text style={styles.retryText}>{t('priceAlerts.resultsRetry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.store}:${item.productId}`}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingTop: headerTop + 66, paddingBottom: bottomPad },
            items.length === 0 && styles.emptyContent,
          ]}
          ListHeaderComponent={items.length > 0 ? (
            <View style={styles.intro}>
              {route.params.title ? <Text style={styles.ruleTitle}>{route.params.title}</Text> : null}
              <Text style={styles.introText}>{t('priceAlerts.resultsSubtitle')}</Text>
            </View>
          ) : null}
          ListEmptyComponent={(
            <View style={styles.state}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.inkFaint} />
              <Text style={styles.stateText}>{t('priceAlerts.resultsEmpty')}</Text>
            </View>
          )}
        />
      )}

      <StoreProductModal target={target} onClose={() => setTarget(null)} />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 14, gap: 9 },
  emptyContent: { flexGrow: 1 },
  intro: { marginBottom: 5 },
  ruleTitle: { fontSize: 16, lineHeight: 21, fontFamily: fonts.bold, color: colors.ink },
  introText: { marginTop: 3, fontSize: 12.5, lineHeight: 18, fontFamily: fonts.medium, color: colors.inkSoft },
  loader: { alignSelf: 'center' },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  stateText: { marginTop: 12, textAlign: 'center', fontSize: 13.5, lineHeight: 20, fontFamily: fonts.medium, color: colors.inkSoft },
  retry: { marginTop: 16, borderRadius: 12, backgroundColor: colors.accent, paddingHorizontal: 18, paddingVertical: 11 },
  retryText: { fontSize: 13, fontFamily: fonts.bold, color: colors.white },
  card: {
    minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: 11,
    borderRadius: 15, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white, padding: 10,
  },
  imageWrap: {
    width: 78, height: 88, borderRadius: 12, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.photoPlaceholder,
  },
  image: { width: '100%', height: '100%' },
  copy: { flex: 1, minWidth: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  store: { flex: 1, minWidth: 0, fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft },
  eventBadge: { borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: colors.accentLight },
  eventOffer: { backgroundColor: colors.accentLight },
  eventNew: { backgroundColor: colors.surfaceAlt },
  eventText: { fontSize: 9.5, fontFamily: fonts.bold, color: colors.ink },
  productName: { marginTop: 6, fontSize: 13.5, lineHeight: 17, fontFamily: fonts.bold, color: colors.ink },
  promo: { marginTop: 3, fontSize: 11, fontFamily: fonts.bold, color: colors.accent },
  category: { marginTop: 3, fontSize: 10.5, fontFamily: fonts.medium, color: colors.inkSoft },
  priceRow: { marginTop: 7, flexDirection: 'row', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' },
  price: { fontSize: 14, fontFamily: fonts.bold, color: colors.ink },
  previous: { fontSize: 10.5, fontFamily: fonts.medium, color: colors.inkSoft, textDecorationLine: 'line-through' },
  dropPct: { fontSize: 10.5, fontFamily: fonts.bold, color: colors.ok },
});
