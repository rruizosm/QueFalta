import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { fetchSimilarProducts, type SimilarProduct } from '../api/catalog';
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';
import { PRICE_COMPARISON_ENABLED } from '../constants/limits';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import StoreProductModal, { type ProductRef } from './StoreProductModal';
import PaywallModal from './PaywallModal';

interface Props {
  /** Identificador del producto origen; la RPC carga nombre y unidad en servidor. */
  productId: string | null;
  /** Tienda del producto origen: se excluye de la comparativa. */
  excludeStore: CatalogStore;
}

const STORE_META = Object.fromEntries(CATALOG_STORES.map((store) => [store.key, store]));
const euro = (value: number): string => `${value.toFixed(2).replace('.', ',')} €`;
const perUnitLabel = (value: number | null, unit: string | null): string | null => {
  if (value == null) return null;
  const label = unit === 'l' ? 'L' : unit === 'kg' ? 'kg' : unit === 'ud' ? 'ud.' : unit;
  return label ? `${euro(value)}/${label}` : euro(value);
};

/** Comparador v3 bajo demanda. Abrir una ficha no lanza ninguna consulta: el
 * usuario decide cuándo buscar y recibe hasta dos matches estrictos por cada
 * supermercado activo. El servidor usa precio total para Caprabo, Eroski e
 * HiperDino y precio unitario canónico para el resto. */
export default function SimilarProductsSection({ productId, excludeStore }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const { profile, loading: profileLoading } = useProfile();
  const [similars, setSimilars] = useState<SimilarProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState(false);
  const [target, setTarget] = useState<ProductRef | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const requestVersion = useRef(0);

  const targetStores = useMemo(
    () => (profile?.catalogStores ?? CATALOG_STORE_KEYS).filter((store) => store !== excludeStore),
    [excludeStore, profile?.catalogStores],
  );
  const targetStoresKey = targetStores.join(',');

  useEffect(() => {
    requestVersion.current += 1;
    setTarget(null);
    setSimilars([]);
    setLoading(false);
    setAttempted(false);
    setError(false);
  }, [productId, excludeStore, targetStoresKey]);

  const search = useCallback(async () => {
    if (!productId || targetStores.length === 0 || loading) return;
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    setLoading(true);
    setAttempted(true);
    setError(false);
    try {
      const results = await fetchSimilarProducts(excludeStore, productId, targetStores);
      if (requestVersion.current === version) setSimilars(results);
    } catch {
      if (requestVersion.current === version) {
        setSimilars([]);
        setError(true);
      }
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }, [excludeStore, loading, productId, targetStores]);

  const grouped = useMemo(
    () => targetStores.map((store) => ({
      store,
      products: similars.filter((product) => product.store === store).slice(0, 2),
    })),
    [similars, targetStores],
  );
  const hasResults = attempted && !loading && !error && similars.length > 0;

  if (!PRICE_COMPARISON_ENABLED || !productId || profileLoading || targetStores.length === 0) return null;

  return (
    <View style={styles.compareSection}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={hasResults ? t('similar.foundButton') : t('similar.searchButton')}
        accessibilityState={{ disabled: loading || hasResults }}
        activeOpacity={0.78}
        disabled={loading || hasResults}
        onPress={search}
        style={[styles.searchButton, loading && styles.searchButtonDisabled]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : hasResults ? (
          <Ionicons name="checkmark-circle" size={18} color={colors.white} />
        ) : (
          <Ionicons name="search" size={18} color={colors.white} />
        )}
        <Text style={styles.searchButtonText}>
          {loading
            ? t('similar.searching')
            : hasResults
              ? t('similar.foundButton')
              : t('similar.searchButton')}
        </Text>
      </TouchableOpacity>

      {error ? <Text style={styles.messageError}>{t('similar.searchError')}</Text> : null}
      {attempted && !loading && !error && similars.length === 0 ? (
        <Text style={styles.messageEmpty}>{t('similar.noReliable')}</Text>
      ) : null}

      {hasResults ? (
        <View style={styles.results}>
          <Text style={styles.sectionTitle}>{t('similar.resultsTitle')}</Text>
          {grouped.map(({ store, products }) => {
            const meta = STORE_META[store];
            return (
              <View key={store} style={styles.storeGroup}>
                <View style={styles.storeHeader}>
                  {meta?.icon ? (
                    <Image source={meta.icon} style={styles.storeIcon} resizeMode="cover" />
                  ) : (
                    <View style={[styles.storeIcon, styles.iconEmpty]}>
                      <Ionicons name="storefront" size={13} color={colors.inkSoft} />
                    </View>
                  )}
                  <Text style={styles.storeName}>{meta?.name ?? store}</Text>
                </View>

                {products.length === 0 ? (
                  <Text style={styles.storeEmpty}>{t('similar.storeEmpty')}</Text>
                ) : products.map((product) => {
                  const ppu = perUnitLabel(product.pricePerUnit, product.pricePerUnitUnit);
                  return (
                    <TouchableOpacity
                      key={`${product.store}-${product.id ?? 'locked'}`}
                      style={[
                        styles.compareRow,
                        !product.locked && product.isCheaper && styles.compareRowCheaper,
                      ]}
                      activeOpacity={0.7}
                      onPress={() =>
                        product.locked || !product.id
                          ? setPaywallVisible(true)
                          : setTarget({ store: product.store, id: product.id })
                      }
                    >
                      {product.thumbnail ? (
                        <Image source={{ uri: product.thumbnail }} style={styles.productImage} resizeMode="contain" />
                      ) : (
                        <View style={[styles.productImage, styles.iconEmpty]}>
                          <Ionicons name="basket-outline" size={18} color={colors.inkSoft} />
                        </View>
                      )}
                      <View style={styles.compareInfo}>
                        <Text style={styles.compareName} numberOfLines={2}>
                          {product.locked ? t('similar.cheaperOption') : product.displayName}
                        </Text>
                      </View>
                      {product.locked ? (
                        <View style={styles.lockBox}>
                          <Ionicons name="lock-closed" size={13} color={colors.accent} />
                        </View>
                      ) : (
                        <View style={styles.comparePriceBox}>
                          {product.priceTotal != null ? (
                            <Text style={styles.comparePrice}>{euro(product.priceTotal)}</Text>
                          ) : null}
                          {ppu ? <Text style={styles.comparePerUnit}>{ppu}</Text> : null}
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={15} color={colors.inkFaint} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </View>
      ) : null}

      <StoreProductModal target={target} onClose={() => setTarget(null)} />
      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        subtitle={t('similar.unlockTooltip')}
      />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  compareSection: { marginTop: 18 },
  searchButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    overflow: 'hidden',
  },
  searchButtonDisabled: { opacity: 0.72 },
  searchButtonText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fonts.bold,
    color: colors.white,
    textAlign: 'center',
  },
  results: { marginTop: 18 },
  sectionTitle: {
    fontSize: 10.5,
    fontFamily: fonts.bold,
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  messageEmpty: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  messageError: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fonts.medium,
    color: colors.red,
  },
  storeGroup: {
    marginTop: 11,
    padding: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 20,
  },
  storeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  storeIcon: { width: 22, height: 22 },
  storeName: { flex: 1, fontSize: 12.5, fontFamily: fonts.bold, color: colors.ink },
  storeEmpty: {
    marginTop: 7,
    marginLeft: 30,
    fontSize: 11.5,
    fontFamily: fonts.medium,
    color: colors.inkFaint,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 7,
    borderRadius: 18,
    overflow: 'hidden',
  },
  compareRowCheaper: {
    backgroundColor: 'rgba(201,138,30,0.16)',
    borderColor: colors.yellow,
  },
  productImage: { width: 38, height: 38, borderRadius: 10 },
  iconEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  compareInfo: { flex: 1, minWidth: 0 },
  compareName: { fontSize: 11.5, lineHeight: 15, fontFamily: fonts.medium, color: colors.inkSoft },
  comparePriceBox: { alignItems: 'flex-end' },
  lockBox: {
    width: 26,
    height: 26,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  comparePrice: { fontSize: 14, fontFamily: fonts.bold, color: colors.accent },
  comparePerUnit: { fontSize: 11, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },
});
