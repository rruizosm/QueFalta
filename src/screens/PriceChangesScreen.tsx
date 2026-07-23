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
import { storeInRegion, storesForRegion } from '../constants/regions';
import StoreProductList from '../components/StoreProductList';
import StoreDropdown from '../components/StoreDropdown';
import ActiveCartBanner from '../components/ActiveCartBanner';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import SlidingSegments from '../components/SlidingSegments';
import { type ViewMode } from '../components/ViewModeToggle';

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
 *
 * Liquid Glass (F3 piloto, solo `glassAvailable`): TODO el chrome —banner de
 * carrito, cabecera, selector de súper y pestañas— vive en una franja de
 * cristal flotante (absolute, al final del árbol como NotificationsSheet) y la
 * lista pasa por debajo y se refracta (topInset de StoreProductList = altura
 * medida del chrome). Las pestañas usan la píldora deslizante de acento
 * (SlidingSegments, lenguaje F1b) y el toggle lista/cuadrícula sube al chrome
 * (hideToolbar + viewMode controlado). En fallback (Android / iOS ≤ 18) el
 * árbol y los estilos son EXACTAMENTE los de siempre.
 */
export default function PriceChangesScreen() {
  const styles = useThemedStyles(themedStyles);
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { profile } = useProfile();

  // Solo los súpers activados en el perfil (misma regla que el catálogo).
  const region = profile?.region ?? null;
  const postalCode = profile?.postalCode ?? null;
  const preferredStores = profile?.catalogStores ?? CATALOG_STORE_KEYS;
  const enabledKeys = preferredStores.filter((store) => storeInRegion(store, region));
  const allowedStores = enabledKeys.length > 0 ? enabledKeys : storesForRegion(region);
  const stores = useMemo(
    () => CATALOG_STORES.filter((s) => allowedStores.includes(s.key)),
    [allowedStores],
  );
  const [store, setStore] = useState<CatalogStore>(stores[0]?.key ?? 'mercadona');
  const [direction, setDirection] = useState<Direction>('down');

  // View mode controlado: el toggle vive junto a las pestañas en ambos modos.
  // La altura medida solo se usa en glass para que la lista pase por debajo.
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [chromeH, setChromeH] = useState(0);

  useEffect(() => {
    if (stores.length > 0 && !stores.some((s) => s.key === store)) {
      setStore(stores[0].key);
    }
  }, [stores, store]);

  // Caché por súper+dirección para no repetir consultas al alternar.
  const cacheKey = `${store}:${direction}:${region ?? 'none'}:${postalCode ?? 'none'}`;
  const [cache, setCache] = useState<Record<string, PriceChangeProduct[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (cache[cacheKey]) { setLoading(false); setError(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchPriceChanges(store, direction, region, postalCode)
      .then((items) => { if (!cancelled) setCache((c) => ({ ...c, [cacheKey]: items })); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // cache a propósito fuera de deps: solo dispara al cambiar súper/dirección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, direction, region, postalCode, cacheKey]);

  // La línea de precio de la fila pasa a "anterior tachado · actual en
  // verde/rojo · (%)" vía priceChange (lo pinta StoreProductList) →
  // StoreProductList se reutiliza tal cual, con stepper/cesta/favoritos/ficha.
  const products: UIProduct[] = useMemo(
    () => (cache[cacheKey] ?? []).map((c) => ({
      ...c.product,
      priceChange: {
        prevLabel: euro(c.prevPrice),
        pctLabel: pctLabel(c.deltaPct),
        direction,
      },
      metaLabel: null,
      pricePerUnitLabel: null,
    })),
    [cache, cacheKey, direction],
  );

  // Chrome de la pantalla (banner + cabecera + selector + pestañas), idéntico
  // en ambos modos salvo: back sin caja sobre el cristal (como el cerrar de
  // NotificationsSheet) y pestañas con píldora deslizante + toggle en línea.
  const chrome = (
    <>
      <ActiveCartBanner topInset nameOnly rounded />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={glassAvailable ? styles.backBtnGlass : styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('priceChanges.title')}</Text>
        {stores.length > 1 ? (
          <StoreDropdown stores={stores} value={store} onChange={setStore} />
        ) : (
          <View style={{ width: 38 }} />
        )}
      </View>

      {glassAvailable ? (
        // Pestañas de píldora deslizante + toggle lista/cuadrícula en la misma fila.
        <View style={styles.glassControls}>
          <SlidingSegments
            style={{ flex: 1 }}
            segments={[
              { key: 'down', label: t('priceChanges.down'), icon: 'arrow-down' },
              { key: 'up', label: t('priceChanges.up'), icon: 'arrow-up' },
            ]}
            value={direction}
            onChange={setDirection}
          />
          {/* Mismo toggle lista/cuadrícula que el catálogo (SlidingSegments compacto). */}
          <SlidingSegments
            compact
            segments={[
              { key: 'list', icon: 'list' },
              { key: 'grid', icon: 'grid' },
            ]}
            value={viewMode}
            onChange={setViewMode}
          />
        </View>
      ) : (
        <View style={styles.fallbackControls}>
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
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.viewBtn, viewMode === 'list' && styles.viewBtnOn]}
              onPress={() => setViewMode('list')}
              activeOpacity={0.85}
            >
              <Ionicons name="list" size={19} color={viewMode === 'list' ? colors.white : colors.inkSoft} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewBtn, viewMode === 'grid' && styles.viewBtnOn]}
              onPress={() => setViewMode('grid')}
              activeOpacity={0.85}
            >
              <Ionicons name="grid" size={17} color={viewMode === 'grid' ? colors.white : colors.inkSoft} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      {!glassAvailable && chrome}

      <StoreProductList
        products={products}
        loading={loading}
        error={error}
        emptyText={t('priceChanges.empty')}
        errorText={t('priceChanges.error')}
        keepOrder
        topInset={glassAvailable ? chromeH : 0}
        hideToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        roundedCards
      />

      {/* Chrome de cristal: al FINAL del árbol para pintarse encima; la lista
          se refracta al pasar por debajo. El StoreDropdown puede seguir dentro:
          el cristal arranca en y=0, así que el onLayout con el que ancla su
          menú sigue dando coordenadas de pantalla. */}
      {glassAvailable && (
        <View
          style={styles.chrome}
          onLayout={(e) => setChromeH(e.nativeEvent.layout.height)}
        >
          <GlassSurface style={styles.chromeGlass} fallbackColor={colors.paper}>
            {chrome}
          </GlassSurface>
        </View>
      )}
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
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  // Sobre el cristal, sin caja (evita glass anidado; como NotificationsSheet).
  backBtnGlass: {
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 22, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.4, textAlign: 'center' },

  // ── Tab switcher (Bajadas / Subidas), SOLO fallback ───────────
  tabs: {
    flex: 1, flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    padding: 3, gap: 3, borderRadius: 18,
  },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 15 },
  tabActive: {
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentMid,
  },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.inkSoft },
  tabTextActive: { color: colors.ink },
  fallbackControls: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 10,
  },
  viewToggle: {
    flexDirection: 'row', gap: 3,
    backgroundColor: colors.surfaceAlt,
    padding: 4, borderRadius: 18,
  },
  viewBtn: {
    width: 36, height: 36, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  viewBtnOn: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent, shadowOpacity: 0.4, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },

  // ── Chrome de cristal (solo glassAvailable, F3) ───────────────
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  chromeGlass: {
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  glassControls: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16,
  },
});
