import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { fetchWeeklyNewProducts } from '../api/catalog';
import type { UIProduct } from '../lib/productAdapters';
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';
import StoreProductList from '../components/StoreProductList';
import StoreDropdown from '../components/StoreDropdown';
import ActiveCartBanner from '../components/ActiveCartBanner';

/**
 * NewArrivalsScreen — "Novedades de la semana" (botón de la cabecera del Home).
 * Selector de súper (los del usuario) + lista de productos nuevos con el mismo
 * añadir-a-la-cesta de siempre (StoreProductList). Mercadona sale de su
 * endpoint oficial de novedades (en vivo); el resto, de first_seen_at del
 * espejo (productos que aparecieron en el último sync semanal). Ver
 * supabase/migrations/catalog_first_seen.sql.
 */
export default function NewArrivalsScreen() {
  const styles = useThemedStyles(themedStyles);
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { profile } = useProfile();

  // Solo los súpers activados en el perfil (misma regla que el catálogo).
  const enabledKeys = profile?.catalogStores ?? CATALOG_STORE_KEYS;
  const stores = useMemo(
    () => CATALOG_STORES.filter((s) => enabledKeys.includes(s.key)),
    [enabledKeys],
  );
  const [store, setStore] = useState<CatalogStore>(stores[0]?.key ?? 'mercadona');

  // Si la preferencia cambia y la tienda activa deja de estar, salta a la primera.
  useEffect(() => {
    if (stores.length > 0 && !stores.some((s) => s.key === store)) {
      setStore(stores[0].key);
    }
  }, [stores, store]);

  // Caché por súper para no repetir la consulta al alternar en el selector.
  const [cache, setCache] = useState<Partial<Record<CatalogStore, UIProduct[]>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (cache[store]) { setLoading(false); setError(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchWeeklyNewProducts(store)
      .then((items) => { if (!cancelled) setCache((c) => ({ ...c, [store]: items })); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // cache a propósito fuera de deps: solo dispara al cambiar de súper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <ActiveCartBanner topInset />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('newArrivals.title')}</Text>
        <View style={{ width: 38 }} />
      </View>

      {stores.length > 1 && (
        <StoreDropdown stores={stores} value={store} onChange={setStore} />
      )}

      <StoreProductList
        products={cache[store] ?? []}
        loading={loading}
        error={error}
        emptyText={t('newArrivals.empty')}
        errorText={t('newArrivals.error')}
        keepOrder
      />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  // ── Header (mismo patrón que Favoritos) ───────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 12,
  },
  backBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3, textAlign: 'center' },
});
