import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { fetchPriceChanges, type PriceChangeProduct } from '../api/catalog';
import type { UIProduct } from '../lib/productAdapters';
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';
import StoreProductList from '../components/StoreProductList';
import StoreDropdown from '../components/StoreDropdown';
import ActiveCartBanner from '../components/ActiveCartBanner';

type Direction = 'down' | 'up';

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
// "−8,5 %" / "+3,2 %" (el % ya viene redondeado a 1 decimal de la BD).
const pctLabel = (n: number) =>
  `${n > 0 ? '+' : '-'}${Math.abs(n).toFixed(1).replace('.', ',')} %`;

/**
 * PriceChangesScreen — "Cambios de precios" (botón de la cabecera del Home).
 * Pestañas Bajadas/Subidas + selector de súper; cada fila muestra el precio
 * NUEVO destacado y "Antes X € (±N %)" en la línea secundaria, ordenado por
 * magnitud del cambio (orden del servidor, keepOrder). Los datos los deja el
 * trigger del sync semanal: ver supabase/migrations/catalog_price_changes.sql
 * (sin ejecutarla no hay datos y se muestra el vacío).
 */
export default function PriceChangesScreen() {
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
  const [direction, setDirection] = useState<Direction>('down');

  useEffect(() => {
    if (stores.length > 0 && !stores.some((s) => s.key === store)) {
      setStore(stores[0].key);
    }
  }, [stores, store]);

  // Caché por súper+dirección para no repetir consultas al alternar.
  const cacheKey = `${store}:${direction}`;
  const [cache, setCache] = useState<Record<string, PriceChangeProduct[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (cache[cacheKey]) { setLoading(false); setError(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchPriceChanges(store, direction)
      .then((items) => { if (!cancelled) setCache((c) => ({ ...c, [cacheKey]: items })); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // cache a propósito fuera de deps: solo dispara al cambiar súper/dirección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, direction]);

  // El precio nuevo va destacado (priceLabel del adaptador); el anterior y el %
  // viajan en la línea secundaria gris (metaLabel) → StoreProductList se
  // reutiliza tal cual, con stepper/cesta/favoritos/ficha incluidos.
  const products: UIProduct[] = useMemo(
    () => (cache[cacheKey] ?? []).map((c) => ({
      ...c.product,
      metaLabel: t('priceChanges.before', { price: euro(c.prevPrice), pct: pctLabel(c.deltaPct) }),
      pricePerUnitLabel: null,
    })),
    [cache, cacheKey, t],
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <ActiveCartBanner topInset />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('priceChanges.title')}</Text>
        <View style={{ width: 38 }} />
      </View>

      {stores.length > 1 && (
        <StoreDropdown stores={stores} value={store} onChange={setStore} />
      )}

      {/* Pestañas Bajadas / Subidas (mismo switcher que Favoritos/Catálogo). */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, direction === 'down' && styles.tabActive]}
          onPress={() => setDirection('down')}
          activeOpacity={0.8}
        >
          <View style={styles.tabInner}>
            <Ionicons name="arrow-down" size={13} color={direction === 'down' ? colors.ink : colors.inkSoft} />
            <Text style={[styles.tabText, direction === 'down' && styles.tabTextActive]}>{t('priceChanges.down')}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, direction === 'up' && styles.tabActive]}
          onPress={() => setDirection('up')}
          activeOpacity={0.8}
        >
          <View style={styles.tabInner}>
            <Ionicons name="arrow-up" size={13} color={direction === 'up' ? colors.ink : colors.inkSoft} />
            <Text style={[styles.tabText, direction === 'up' && styles.tabTextActive]}>{t('priceChanges.up')}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <StoreProductList
        products={products}
        loading={loading}
        error={error}
        emptyText={t('priceChanges.empty')}
        errorText={t('priceChanges.error')}
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

  // ── Tab switcher (Bajadas / Subidas) ──────────────────────────
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: colors.surfaceAlt,
    padding: 3, gap: 3,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  tabActive: { backgroundColor: colors.white },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.inkSoft },
  tabTextActive: { color: colors.ink },
});
