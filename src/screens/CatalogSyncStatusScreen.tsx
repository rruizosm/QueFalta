import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { CATALOG_STORES, type CatalogStore } from '../constants/stores';
import { fetchCatalogSyncStatuses, type CatalogSyncStatus } from '../api/catalogSyncStatus';
import ProfileSubscreenHeader from '../components/ProfileSubscreenHeader';
import { glassAvailable } from '../components/GlassSurface';

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function CatalogSyncStatusScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const { t, lang } = useTranslation();
  const [statuses, setStatuses] = useState<CatalogSyncStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [headerH, setHeaderH] = useState(0);
  const glassInset = glassAvailable ? headerH : 0;

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try { setStatuses(await fetchCatalogSyncStatuses()); }
    catch { setStatuses([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const byStore = new Map(statuses.map((status) => [status.store, status.syncedAt]));
  const locale = lang === 'ca' ? 'ca-ES' : 'es-ES';

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
      <ProfileSubscreenHeader
        title={t('catalogSyncStatus.title')}
        icon="sync-outline"
        headerTop={headerTop}
        titleFontSize={17}
        onLayout={(event) => setHeaderH(event.nativeEvent.layout.height)}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad, paddingTop: glassInset ? glassInset + 12 : 6 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
      >
        <Text style={styles.hint}>{t('catalogSyncStatus.hint')}</Text>
        {loading ? <ActivityIndicator size="large" color={colors.accent} style={styles.loader} /> : (
          <View style={styles.card}>
            {CATALOG_STORES.map((store, index) => {
              const timestamp = byStore.get(store.key as CatalogStore);
              return <View key={store.key} style={[styles.row, index < CATALOG_STORES.length - 1 && styles.border]}>
                {store.icon ? (
                  <View style={styles.iconBox}>
                    <Image source={store.icon} style={styles.storeLogo} resizeMode="contain" accessibilityLabel={store.name} />
                  </View>
                ) : (
                  <View style={[styles.iconBox, styles.iconBoxFallback]}>
                    <Text style={styles.storeInitials}>{store.name.slice(0, 2).toUpperCase()}</Text>
                  </View>
                )}
                <Text style={styles.storeName}>{store.name}</Text>
                <Text style={styles.date} numberOfLines={2}>{timestamp ? formatDate(timestamp, locale) : t('catalogSyncStatus.never')}</Text>
              </View>;
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { padding: 16, paddingBottom: 40 },
  hint: { fontSize: 12, fontFamily: fonts.medium, lineHeight: 18, color: colors.inkSoft, marginBottom: 14 },
  loader: { marginTop: 42 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, paddingVertical: 12, gap: 12 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBox: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
  iconBoxFallback: { borderWidth: 1, borderColor: colors.border },
  storeLogo: { width: 28, height: 28 },
  storeInitials: { fontFamily: fonts.bold, fontSize: 11, color: colors.accent },
  storeName: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  date: { maxWidth: '49%', textAlign: 'right', fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, color: colors.inkSoft },
});
