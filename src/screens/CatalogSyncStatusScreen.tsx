import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { CATALOG_STORES, type CatalogStore } from '../constants/stores';
import { fetchCatalogSyncStatuses, type CatalogSyncStatus } from '../api/catalogSyncStatus';

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function CatalogSyncStatusScreen() {
  const navigation = useNavigation();
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const { t, lang } = useTranslation();
  const [statuses, setStatuses] = useState<CatalogSyncStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <View style={styles.headerIcon}><Ionicons name="sync-outline" size={18} color={colors.accent} /></View>
          <Text style={styles.title}>{t('catalogSyncStatus.title')}</Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  headerTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
  title: { flex: 1, fontSize: 22, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  scroll: { padding: 16, paddingBottom: 40 },
  hint: { fontSize: 14, lineHeight: 20, color: colors.inkSoft, marginBottom: 16 },
  loader: { marginTop: 42 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  border: { borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBox: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
  iconBoxFallback: { borderWidth: 1, borderColor: colors.border },
  storeLogo: { width: 28, height: 28 },
  storeInitials: { fontFamily: fonts.bold, fontSize: 11, color: colors.accent },
  storeName: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  date: { maxWidth: '49%', textAlign: 'right', fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, color: colors.inkSoft },
});
