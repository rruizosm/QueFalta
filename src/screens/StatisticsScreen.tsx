import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { limitsApply } from '../constants/limits';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { fetchPurchaseStatistics, type PurchaseStatisticItem, type PurchaseStatistics } from '../api/purchases';
import { STORE_META, type Store } from '../constants/stores';
import { getSubcategoryEmoji } from '../constants/subcategoryEmojis';
import PaywallModal from '../components/PaywallModal';
import ProfileSubscreenHeader from '../components/ProfileSubscreenHeader';
import { glassAvailable } from '../components/GlassSurface';

const EMPTY_STATISTICS: PurchaseStatistics = { purchaseCount: 0, stores: [], categories: [], products: [] };

const quantityLabel = (quantity: number) =>
  Number.isInteger(quantity)
    ? quantity.toString()
    : quantity.toLocaleString('es-ES', { maximumFractionDigits: 1 });

export default function StatisticsScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const { t } = useTranslation();
  const { isPremium, loading: profileLoading } = useProfile();
  const [statistics, setStatistics] = useState<PurchaseStatistics>(EMPTY_STATISTICS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [headerH, setHeaderH] = useState(0);
  const glassInset = glassAvailable ? headerH : 0;
  const locked = !profileLoading && limitsApply(isPremium);

  const load = useCallback(async () => {
    if (locked) {
      setStatistics(EMPTY_STATISTICS);
      setLoading(false);
      return;
    }
    try {
      setStatistics(await fetchPurchaseStatistics());
    } catch {
      setStatistics(EMPTY_STATISTICS);
    } finally {
      setLoading(false);
    }
  }, [locked]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const storeRows = useMemo(() => statistics.stores.map((row) => ({
    ...row,
    label: row.key && row.key in STORE_META
      ? STORE_META[row.key as Store].name
      : t('statistics.unknownStore'),
    iconSource: row.key && row.key in STORE_META ? STORE_META[row.key as Store].icon : null,
  })), [statistics.stores, t]);
  const categoryRows = useMemo(() => statistics.categories.map((row) => ({
    ...row,
    label: row.key?.startsWith('statistics.category.')
      ? t(row.key)
      : row.label === '__uncategorized__'
        ? t('statistics.uncategorized')
        : row.label ?? t('statistics.uncategorized'),
    icon: row.icon ?? getSubcategoryEmoji(row.label ?? '', '🛒'),
  })), [statistics.categories, t]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
      <ProfileSubscreenHeader
        title={t('statistics.title')}
        icon="pie-chart-outline"
        headerTop={headerTop}
        onLayout={(event) => setHeaderH(event.nativeEvent.layout.height)}
      />

      {loading || profileLoading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: glassInset + 60 }} />
      ) : locked ? (
        <View style={[styles.centerBox, glassInset ? { paddingTop: glassInset } : null]}>
          <View style={styles.lockIcon}><Ionicons name="lock-closed" size={24} color={colors.accent} /></View>
          <Text style={styles.emptyTitle}>{t('statistics.lockedTitle')}</Text>
          <Text style={styles.emptyText}>{t('statistics.lockedText')}</Text>
          <TouchableOpacity style={styles.unlockBtn} onPress={() => setPaywallVisible(true)} activeOpacity={0.85}>
            <Ionicons name="sparkles" size={16} color={colors.white} />
            <Text style={styles.unlockText}>{t('statistics.unlock')}</Text>
          </TouchableOpacity>
        </View>
      ) : statistics.products.length === 0 ? (
        <View style={[styles.centerBox, glassInset ? { paddingTop: glassInset } : null]}>
          <Ionicons name="pie-chart-outline" size={48} color={colors.inkFaint} />
          <Text style={styles.emptyTitle}>{t('statistics.emptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('statistics.emptyText')}</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad, paddingTop: glassInset ? glassInset + 8 : 0 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />}
        >
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>{t('statistics.summary', { n: statistics.purchaseCount })}</Text>
            <TouchableOpacity
              style={styles.generalStatisticsButton}
              disabled
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
            >
              <Text style={styles.generalStatisticsButtonText}>{t('statistics.general')}</Text>
            </TouchableOpacity>
          </View>
          <RankingCard kind="stores" title={t('statistics.stores')} icon="storefront-outline" rows={storeRows} t={t} styles={styles} />
          <RankingCard kind="categories" title={t('statistics.categories')} icon="pricetags-outline" rows={categoryRows} t={t} styles={styles} />
          <RankingCard kind="products" title={t('statistics.products')} icon="cart-outline" rows={statistics.products} t={t} styles={styles} />
        </ScrollView>
      )}

      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} subtitle={t('statistics.paywallSubtitle')} />
    </View>
  );
}

function RankingCard({
  kind, title, icon, rows, t, styles,
}: {
  kind: 'stores' | 'categories' | 'products';
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  rows: Array<PurchaseStatisticItem & { label?: string; iconSource?: number | null }>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  styles: ReturnType<typeof themedStyles>;
}) {
  const maxQuantity = rows[0]?.quantity ?? 1;
  return (
    <View style={styles.cardBlock}>
      <View style={styles.sectionTitleRow}>
        <View style={styles.sectionIcon}><Ionicons name={icon} size={17} color={colors.accent} /></View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.card}>
        {rows.map((row, index) => (
          <View key={`${row.key ?? row.label}-${index}`} style={[styles.rankRow, index < rows.length - 1 && styles.rankRowBorder]}>
            <Text style={styles.rankNumber}>{index + 1}</Text>
            {kind === 'stores' ? (
              row.iconSource ? <Image source={row.iconSource} style={styles.storeLogo} contentFit="contain" /> : <View style={styles.storeLogoPlaceholder}><Ionicons name="storefront" size={16} color={colors.inkSoft} /></View>
            ) : kind === 'categories' ? (
              <View style={styles.categoryIcon}><Text style={styles.categoryEmoji}>{row.icon ?? '🛒'}</Text></View>
            ) : (
              row.imageUrl ? <Image source={row.imageUrl} style={styles.productImage} contentFit="contain" /> : <View style={styles.productImagePlaceholder}><Ionicons name="cart-outline" size={18} color={colors.inkFaint} /></View>
            )}
            <View style={styles.rankCopy}>
              <Text style={styles.rankLabel}>{row.label ?? ''}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressValue, { width: `${Math.max(8, (row.quantity / maxQuantity) * 100)}%` }]} />
              </View>
              <Text style={styles.rankMeta}>{t('statistics.purchases', { n: row.purchases })}</Text>
            </View>
            <Text style={styles.rankQuantity}>{t('statistics.units', { n: quantityLabel(row.quantity) })}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  heroCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    marginTop: 8, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.accentLight, borderRadius: 18,
  },
  heroTitle: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: fonts.bold, color: colors.ink },
  generalStatisticsButton: {
    flexShrink: 1, minHeight: 34, maxWidth: 142, paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: 12, borderWidth: 1, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white,
  },
  generalStatisticsButtonText: { fontSize: 11.5, lineHeight: 15, fontFamily: fonts.semibold, color: colors.accent, textAlign: 'center' },
  cardBlock: { marginTop: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },
  sectionIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 14 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rankRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rankNumber: { width: 22, fontSize: 14, fontFamily: fonts.bold, color: colors.accent, textAlign: 'center' },
  rankCopy: { flex: 1, minWidth: 0 },
  rankLabel: { fontSize: 13.5, lineHeight: 18, fontFamily: fonts.semibold, color: colors.ink },
  storeLogo: { width: 38, height: 38, borderRadius: 10 },
  storeLogoPlaceholder: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  categoryIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  categoryEmoji: { fontSize: 20 },
  productImage: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.surfaceAlt },
  productImagePlaceholder: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 5, marginTop: 6, backgroundColor: colors.surfaceAlt, borderRadius: 4, overflow: 'hidden' },
  progressValue: { height: '100%', backgroundColor: colors.accent, borderRadius: 4 },
  rankMeta: { fontSize: 11, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 4 },
  rankQuantity: { maxWidth: 85, fontSize: 12, fontFamily: fonts.bold, color: colors.ink, textAlign: 'right' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center', lineHeight: 20 },
  lockIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
  unlockBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 15, backgroundColor: colors.accent },
  unlockText: { fontSize: 13.5, fontFamily: fonts.bold, color: colors.white },
});
