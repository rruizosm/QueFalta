import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { STORE_META, type Store } from '../constants/stores';
import { limitsApply } from '../constants/limits';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import {
  fetchGeneralPurchaseStatistics,
  type GeneralProductStatistic,
  type GeneralPurchaseStatistics,
  type GeneralStorePreference,
  type GeneralStoreStatistic,
} from '../api/purchases';
import PaywallModal from '../components/PaywallModal';
import ProfileSubscreenHeader from '../components/ProfileSubscreenHeader';
import { glassAvailable } from '../components/GlassSurface';

const EMPTY_GENERAL_STATISTICS: GeneralPurchaseStatistics = {
  preferenceUserCount: 0,
  preferredStores: [],
  topProducts: [],
  addedStores: [],
};

const storeMeta = (key: string) => (
  key in STORE_META ? STORE_META[key as Store] : STORE_META.otros
);

export default function GeneralStatisticsScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const { t, lang } = useTranslation();
  const { isPremium, loading: profileLoading } = useProfile();
  const [statistics, setStatistics] = useState(EMPTY_GENERAL_STATISTICS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [headerH, setHeaderH] = useState(0);
  const glassInset = glassAvailable ? headerH : 0;
  const locked = !profileLoading && limitsApply(isPremium);
  const locale = lang === 'ca' ? 'ca-ES' : 'es-ES';

  const formatNumber = useCallback(
    (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 1 }),
    [locale],
  );

  const load = useCallback(async () => {
    if (locked) {
      setStatistics(EMPTY_GENERAL_STATISTICS);
      setLoadError(false);
      setLoading(false);
      return;
    }
    setLoadError(false);
    try {
      setStatistics(await fetchGeneralPurchaseStatistics());
    } catch {
      setLoadError(true);
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

  const contentTop = glassInset ? glassInset + 8 : 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
      <ProfileSubscreenHeader
        title={t('statistics.general')}
        icon="stats-chart-outline"
        headerTop={headerTop}
        titleFontSize={19}
        onLayout={(event) => setHeaderH(event.nativeEvent.layout.height)}
      />

      {loading || profileLoading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: glassInset + 60 }} />
      ) : locked ? (
        <View style={[styles.centerBox, glassInset ? { paddingTop: glassInset } : null]}>
          <View style={styles.stateIcon}>
            <Ionicons name="lock-closed" size={24} color={colors.accent} />
          </View>
          <Text style={styles.stateTitle}>{t('statistics.lockedTitle')}</Text>
          <Text style={styles.stateText}>{t('statistics.lockedText')}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setPaywallVisible(true)} activeOpacity={0.85}>
            <Ionicons name="sparkles" size={16} color={colors.white} />
            <Text style={styles.primaryButtonText}>{t('statistics.unlock')}</Text>
          </TouchableOpacity>
        </View>
      ) : loadError ? (
        <View style={[styles.centerBox, glassInset ? { paddingTop: glassInset } : null]}>
          <View style={styles.stateIcon}>
            <Ionicons name="cloud-offline-outline" size={25} color={colors.accent} />
          </View>
          <Text style={styles.stateTitle}>{t('statistics.generalLoadError')}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={load} activeOpacity={0.85}>
            <Ionicons name="refresh" size={17} color={colors.white} />
            <Text style={styles.primaryButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingTop: contentTop, paddingBottom: bottomPad }]}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          )}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Ionicons name="people" size={22} color={colors.accent} />
            </View>
            <Text style={styles.heroTitle}>{t('statistics.general')}</Text>
            <Text style={styles.heroText}>{t('statistics.generalIntro')}</Text>
          </View>

          <SectionHeader
            icon="heart-outline"
            title={t('statistics.preferredStores')}
            subtitle={t('statistics.preferredStoresText', {
              n: formatNumber(statistics.preferenceUserCount),
            })}
            styles={styles}
          />
          <StorePreferenceCard
            rows={statistics.preferredStores}
            totalUsers={statistics.preferenceUserCount}
            formatNumber={formatNumber}
            t={t}
            styles={styles}
          />

          <SectionHeader
            icon="trophy-outline"
            title={t('statistics.topAddedProducts')}
            subtitle={t('statistics.topAddedProductsText')}
            styles={styles}
          />
          <ProductRankingCard
            rows={statistics.topProducts}
            formatNumber={formatNumber}
            t={t}
            styles={styles}
          />

          <SectionHeader
            icon="storefront-outline"
            title={t('statistics.storesWithMostAdditions')}
            subtitle={t('statistics.storesWithMostAdditionsText')}
            styles={styles}
          />
          <StoreAdditionsCard
            rows={statistics.addedStores}
            formatNumber={formatNumber}
            t={t}
            styles={styles}
          />
        </ScrollView>
      )}

      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
}

function SectionHeader({ icon, title, subtitle, styles }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  styles: ReturnType<typeof themedStyles>;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={17} color={colors.accent} />
      </View>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function StorePreferenceCard({ rows, totalUsers, formatNumber, t, styles }: {
  rows: GeneralStorePreference[];
  totalUsers: number;
  formatNumber: (value: number) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  styles: ReturnType<typeof themedStyles>;
}) {
  const maxUsers = rows[0]?.users || 1;
  if (rows.length === 0) return <EmptyCard t={t} styles={styles} />;
  return (
    <View style={styles.card}>
      {rows.map((row, index) => {
        const meta = storeMeta(row.key);
        const percentage = totalUsers > 0 ? Math.round((row.users / totalUsers) * 100) : 0;
        return (
          <View
            key={row.key}
            style={[styles.storeRow, index < rows.length - 1 && styles.rowBorder]}
            accessible
            accessibilityLabel={`${meta.name}, ${percentage}%, ${t('statistics.selectedUsers', { n: formatNumber(row.users) })}`}
          >
            <StoreLogo source={meta.icon} styles={styles} />
            <View style={styles.rankingCopy}>
              <View style={styles.rankingTitleRow}>
                <Text style={styles.rankingLabel} numberOfLines={1}>{meta.name}</Text>
                <Text style={styles.percentage}>{percentage}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressValue, { width: `${Math.max(5, (row.users / maxUsers) * 100)}%` }]} />
              </View>
              <Text style={styles.rankingMeta}>{t('statistics.selectedUsers', { n: formatNumber(row.users) })}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ProductRankingCard({ rows, formatNumber, t, styles }: {
  rows: GeneralProductStatistic[];
  formatNumber: (value: number) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  styles: ReturnType<typeof themedStyles>;
}) {
  if (rows.length === 0) return <EmptyCard t={t} styles={styles} />;
  return (
    <View style={styles.card}>
      {rows.map((row, index) => {
        const meta = storeMeta(row.storeKey);
        const quantityText = t('statistics.addedUnits', { n: formatNumber(row.quantity) });
        return (
          <View
            key={`${row.storeKey}:${row.key}`}
            style={[styles.productRow, index < rows.length - 1 && styles.rowBorder]}
            accessible
            accessibilityLabel={`${index + 1}. ${row.label}, ${meta.name}, ${quantityText}`}
          >
            <Text style={styles.rankNumber}>{index + 1}</Text>
            {row.imageUrl ? (
              <Image source={row.imageUrl} style={styles.productImage} contentFit="contain" transition={120} />
            ) : (
              <View style={styles.productPlaceholder}>
                <Ionicons name="basket-outline" size={19} color={colors.inkFaint} />
              </View>
            )}
            <View style={styles.productCopy}>
              <Text style={styles.productName} numberOfLines={2}>{row.label}</Text>
              <View style={styles.storeMetaRow}>
                {meta.icon ? <Image source={meta.icon} style={styles.miniStoreLogo} contentFit="contain" /> : null}
                <Text style={styles.productStore} numberOfLines={1}>{meta.name}</Text>
              </View>
            </View>
            <Text style={styles.quantityValue}>{formatNumber(row.quantity)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function StoreAdditionsCard({ rows, formatNumber, t, styles }: {
  rows: GeneralStoreStatistic[];
  formatNumber: (value: number) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  styles: ReturnType<typeof themedStyles>;
}) {
  const maxQuantity = rows[0]?.quantity || 1;
  if (rows.length === 0) return <EmptyCard t={t} styles={styles} />;
  return (
    <View style={styles.card}>
      {rows.map((row, index) => {
        const meta = storeMeta(row.key);
        const quantityText = t('statistics.addedUnits', { n: formatNumber(row.quantity) });
        return (
          <View
            key={row.key}
            style={[styles.storeRow, index < rows.length - 1 && styles.rowBorder]}
            accessible
            accessibilityLabel={`${index + 1}. ${meta.name}, ${quantityText}`}
          >
            <Text style={styles.rankNumber}>{index + 1}</Text>
            <StoreLogo source={meta.icon} styles={styles} />
            <View style={styles.rankingCopy}>
              <View style={styles.rankingTitleRow}>
                <Text style={styles.rankingLabel} numberOfLines={1}>{meta.name}</Text>
                <Text style={styles.storeQuantity}>{formatNumber(row.quantity)}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressValue, { width: `${Math.max(5, (row.quantity / maxQuantity) * 100)}%` }]} />
              </View>
              <Text style={styles.rankingMeta}>{quantityText}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function StoreLogo({ source, styles }: { source: any; styles: ReturnType<typeof themedStyles> }) {
  return source ? (
    <Image source={source} style={styles.storeLogo} contentFit="contain" />
  ) : (
    <View style={styles.storeLogoPlaceholder}>
      <Ionicons name="storefront" size={16} color={colors.inkSoft} />
    </View>
  );
}

function EmptyCard({ t, styles }: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  styles: ReturnType<typeof themedStyles>;
}) {
  return (
    <View style={[styles.card, styles.emptyCard]}>
      <Ionicons name="analytics-outline" size={25} color={colors.inkFaint} />
      <Text style={styles.emptyText}>{t('statistics.generalEmpty')}</Text>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingHorizontal: 16, gap: 0 },
  heroCard: {
    alignItems: 'center', marginTop: 8, paddingHorizontal: 20, paddingVertical: 20,
    borderRadius: 22, borderWidth: 1, borderColor: colors.accentMid,
    backgroundColor: colors.accentLight,
  },
  heroIcon: {
    width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    marginBottom: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.accentMid,
  },
  heroTitle: { fontSize: 19, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center' },
  heroText: { marginTop: 5, fontSize: 13.5, lineHeight: 19, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 22, marginBottom: 10 },
  sectionIcon: {
    width: 34, height: 34, borderRadius: 12, backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 16.5, lineHeight: 21, fontFamily: fonts.bold, color: colors.ink },
  sectionSubtitle: { marginTop: 2, fontSize: 12, lineHeight: 17, fontFamily: fonts.medium, color: colors.inkSoft },
  card: {
    overflow: 'hidden', paddingHorizontal: 14, borderRadius: 20, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.white,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
  storeLogo: { width: 40, height: 40, borderRadius: 11, backgroundColor: colors.surfaceAlt },
  storeLogoPlaceholder: { width: 40, height: 40, borderRadius: 11, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  rankingCopy: { flex: 1, minWidth: 0 },
  rankingTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankingLabel: { flex: 1, minWidth: 0, fontSize: 13.5, fontFamily: fonts.semibold, color: colors.ink },
  percentage: { fontSize: 13, fontFamily: fonts.bold, color: colors.accent },
  storeQuantity: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.ink },
  progressTrack: { height: 5, marginTop: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  progressValue: { height: '100%', borderRadius: 4, backgroundColor: colors.accent },
  rankingMeta: { marginTop: 4, fontSize: 10.5, fontFamily: fonts.medium, color: colors.inkSoft },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11 },
  rankNumber: { width: 21, fontSize: 13.5, fontFamily: fonts.bold, color: colors.accent, textAlign: 'center' },
  productImage: { width: 47, height: 47, borderRadius: 11, backgroundColor: colors.surfaceAlt },
  productPlaceholder: { width: 47, height: 47, borderRadius: 11, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  productCopy: { flex: 1, minWidth: 0 },
  productName: { fontSize: 12.5, lineHeight: 16, fontFamily: fonts.semibold, color: colors.ink },
  storeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  miniStoreLogo: { width: 16, height: 16, borderRadius: 4 },
  productStore: { flex: 1, fontSize: 10.5, fontFamily: fonts.medium, color: colors.inkSoft },
  quantityValue: { maxWidth: 64, fontSize: 12.5, fontFamily: fonts.bold, color: colors.accent, textAlign: 'right' },
  emptyCard: { minHeight: 108, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 20 },
  emptyText: { maxWidth: 260, fontSize: 12.5, lineHeight: 18, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  stateIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
  stateTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center' },
  stateText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 15, backgroundColor: colors.accent },
  primaryButtonText: { fontSize: 13.5, fontFamily: fonts.bold, color: colors.white },
});
