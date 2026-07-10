import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import {
  fetchCarrefourOffers, OFFER_STORES,
  type BrowseCursor, type CarrefourOffer,
} from '../api/catalog';
import type { UIProduct } from '../lib/productAdapters';
import { CATALOG_STORES, type CatalogStore } from '../constants/stores';
import StoreProductList from '../components/StoreProductList';
import StoreDropdown from '../components/StoreDropdown';
import ActiveCartBanner from '../components/ActiveCartBanner';

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/**
 * OffersScreen — "Ofertas" (botón de la cabecera del Home, junto a Novedades y
 * Cambios de precios). Lista las ofertas vivas del súper: promos de lote ("3x2",
 * "2ª unidad -70%"…) y descuentos directos ("Antes X €"), en la línea secundaria
 * de cada fila. Hoy solo Carrefour las expone (OFFER_STORES); el selector no se
 * filtra por la preferencia de súpers del usuario porque quien solo usa otro
 * súper también puede querer ver ofertas. A diferencia de Novedades (~100 filas),
 * aquí hay miles → paginación keyset de servidor (onEndReached), todas
 * alcanzables. Requiere supabase/migrations/carrefour_offers.sql (sin ella la
 * query falla por columna inexistente y se muestra el error).
 */
export default function OffersScreen() {
  const styles = useThemedStyles(themedStyles);
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  const stores = useMemo(
    () => CATALOG_STORES.filter((s) => OFFER_STORES.includes(s.key)),
    [],
  );
  const [store, setStore] = useState<CatalogStore>(stores[0]?.key ?? 'carrefour');

  const [items, setItems] = useState<CarrefourOffer[]>([]);
  const [cursor, setCursor] = useState<BrowseCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  // Descarta respuestas de una carga anterior (cambio de súper o desmontaje).
  const loadSeq = useRef(0);

  // Primera página (y recarga al cambiar de súper, cuando haya más de uno).
  useEffect(() => {
    const seq = ++loadSeq.current;
    setItems([]);
    setCursor(null);
    setLoading(true);
    setError(false);
    fetchCarrefourOffers(null)
      .then((page) => {
        if (loadSeq.current !== seq) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      })
      .catch(() => { if (loadSeq.current === seq) setError(true); })
      .finally(() => { if (loadSeq.current === seq) setLoading(false); });
  }, [store]);

  // Páginas siguientes al llegar al final (cursor null = no hay más).
  const loadMore = useCallback(() => {
    if (!cursor || loading || loadingMore) return;
    const seq = loadSeq.current;
    setLoadingMore(true);
    fetchCarrefourOffers(cursor)
      .then((page) => {
        if (loadSeq.current !== seq) return;
        setItems((prev) => [...prev, ...page.items]);
        setCursor(page.nextCursor);
      })
      .catch(() => {}) // fallo de red al paginar: se reintenta al volver a llegar al final
      .finally(() => { if (loadSeq.current === seq) setLoadingMore(false); });
  }, [cursor, loading, loadingMore]);

  // La promo va en la línea secundaria gris: "3x2", "Antes 2,95 €" o ambas.
  // El €/unidad se omite para dejarle todo el ancho (igual que Cambios de precios).
  const products: UIProduct[] = useMemo(
    () => items.map((o) => ({
      ...o.product,
      metaLabel: [
        o.promoName,
        o.prevPrice != null ? t('offers.before', { price: euro(o.prevPrice) }) : null,
      ].filter(Boolean).join('  ·  ') || null,
      pricePerUnitLabel: null,
    })),
    [items, t],
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
        <Text style={styles.title}>{t('offers.title')}</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Siempre visible (aunque haya un solo súper con ofertas): es lo que dice
          de qué súper son las ofertas que se están viendo. */}
      <StoreDropdown stores={stores} value={store} onChange={setStore} />

      <StoreProductList
        products={products}
        loading={loading}
        error={error}
        emptyText={t('offers.empty')}
        errorText={t('offers.error')}
        keepOrder
        onEndReached={loadMore}
        loadingMore={loadingMore}
      />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  // ── Header (mismo patrón que Novedades/Cambios de precios) ─────
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
