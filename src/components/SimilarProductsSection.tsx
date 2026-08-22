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
import ProductImage from './ProductImage';

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

/** Comparador v5 bajo demanda. Abrir una ficha no lanza ninguna consulta: el
 * usuario decide cuándo buscar y recibe hasta dos matches estrictos por cada
 * supermercado activo. El servidor usa precio total para Caprabo, Eroski e
 * HiperDino y precio unitario canónico para el resto. */
export default function SimilarProductsSection({ productId, excludeStore }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const { profile, loading: profileLoading, isPremium } = useProfile();
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
    if (!isPremium) {
      setPaywallVisible(true);
      return;
    }
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
  }, [excludeStore, isPremium, loading, productId, targetStores]);

  const grouped = useMemo(
    () => targetStores
      .map((store) => ({
        store,
        products: similars.filter((product) => product.store === store).slice(0, 2),
      }))
      .filter(({ products }) => products.length > 0),
    [similars, targetStores],
  );
  const hasResults = attempted && !loading && !error && similars.length > 0;
  const hasCheaperResults = hasResults && similars.some((product) => product.isCheaper);
  const currentIsCheapest = hasResults && !hasCheaperResults;

  if (!PRICE_COMPARISON_ENABLED || !productId || profileLoading || targetStores.length === 0) return null;

  const buttonInk = isPremium ? colors.white : colors.accent;
  const searchButton = (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={hasResults ? t('similar.foundButton') : t('similar.searchButton')}
      accessibilityHint={!isPremium ? t('similar.unlockTooltip') : undefined}
      accessibilityState={{ disabled: loading || hasResults }}
      activeOpacity={0.78}
      disabled={loading || hasResults}
      onPress={search}
      style={[styles.searchButton, isPremium && styles.searchButtonUnlocked]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={buttonInk} />
      ) : hasResults ? (
        <Ionicons name="checkmark-circle" size={18} color={buttonInk} />
      ) : (
        <Ionicons name="search" size={18} color={buttonInk} />
      )}
      <Text style={[styles.searchButtonText, isPremium && styles.searchButtonTextUnlocked]}>
        {loading
          ? t('similar.searching')
          : hasResults
            ? t('similar.foundButton')
            : t('similar.searchButton')}
      </Text>
      {!isPremium ? <Ionicons name="lock-closed" size={13} color={colors.accent} /> : null}
    </TouchableOpacity>
  );

  return (
    <View style={styles.compareSection}>
      <View style={[styles.searchButtonBackground, loading && styles.searchButtonDisabled]}>
        {searchButton}
      </View>

      {error ? <Text style={styles.messageError}>{t('similar.searchError')}</Text> : null}
      {attempted && !loading && !error && similars.length === 0 ? (
        <Text style={styles.messageEmpty}>{t('similar.noReliable')}</Text>
      ) : null}

      {hasResults ? (
        <View style={styles.results}>
          <View style={styles.resultsHeader}>
            <View style={styles.resultsTitleIcon}>
              <Ionicons name="git-compare-outline" size={18} color={colors.accent} />
            </View>
            <View style={styles.resultsHeading}>
              <Text style={styles.sectionTitle}>{t('similar.resultsTitle')}</Text>
              <Text style={styles.sectionHint}>{t('similar.resultsHint')}</Text>
            </View>
            <View style={styles.resultCount}>
              <Text style={styles.resultCountText}>{similars.length}</Text>
            </View>
          </View>

          <View
            accessible
            accessibilityLabel={currentIsCheapest
              ? `${t('similar.currentBestTitle')}. ${t('similar.currentBestBody')}`
              : `${t('similar.cheaperFoundTitle')}. ${t('similar.cheaperFoundBody')}`}
            style={[
              styles.resultSummary,
              currentIsCheapest ? styles.currentBestSummary : styles.cheaperFoundSummary,
            ]}
          >
            <View style={[
              styles.resultSummaryIcon,
              currentIsCheapest ? styles.currentBestIcon : styles.cheaperFoundIcon,
            ]}>
              <Ionicons
                name={currentIsCheapest ? 'shield-checkmark' : 'trending-down'}
                size={21}
                color={currentIsCheapest ? colors.ok : colors.accent}
              />
            </View>
            <View style={styles.resultSummaryCopy}>
              <Text style={[
                styles.resultSummaryTitle,
                currentIsCheapest ? styles.currentBestTitle : styles.cheaperFoundTitle,
              ]}>
                {currentIsCheapest ? t('similar.currentBestTitle') : t('similar.cheaperFoundTitle')}
              </Text>
              <Text style={styles.resultSummaryBody}>
                {currentIsCheapest ? t('similar.currentBestBody') : t('similar.cheaperFoundBody')}
              </Text>
            </View>
          </View>

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
                  <View style={styles.storeCount}>
                    <Text style={styles.storeCountText}>{products.length}</Text>
                  </View>
                </View>

                {products.map((product, index) => {
                  const ppu = perUnitLabel(product.pricePerUnit, product.pricePerUnitUnit);
                  const displayName = product.locked
                    ? t('similar.cheaperOption')
                    : (product.displayName ?? t('similar.unnamedProduct'));
                  const priceLabel = product.priceTotal != null ? euro(product.priceTotal) : null;
                  const accessibilityPrice = [priceLabel, ppu].filter(Boolean).join(', ');
                  return (
                    <TouchableOpacity
                      key={`${product.store}-${product.id ?? 'locked'}`}
                      style={[
                        styles.compareRow,
                        index > 0 && styles.compareRowDivider,
                        !product.locked && product.isCheaper && styles.compareRowCheaper,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={accessibilityPrice
                        ? t('similar.openProductWithPrice', {
                          product: displayName,
                          store: meta?.name ?? store,
                          price: accessibilityPrice,
                        })
                        : t('similar.openProduct', {
                          product: displayName,
                          store: meta?.name ?? store,
                        })}
                      activeOpacity={0.7}
                      onPress={() =>
                        product.locked || !product.id
                          ? setPaywallVisible(true)
                          : setTarget({ store: product.store, id: product.id })
                      }
                    >
                      <View style={styles.productImageWrap}>
                        {product.thumbnail ? (
                          <ProductImage uri={product.thumbnail} style={styles.productImage} />
                        ) : (
                          <View style={[styles.productImage, styles.iconEmpty]}>
                            <Ionicons name="basket-outline" size={20} color={colors.inkSoft} />
                          </View>
                        )}
                      </View>
                      <View style={styles.compareInfo}>
                        <Text style={styles.compareName} numberOfLines={2}>
                          {displayName}
                        </Text>
                        {!product.locked && product.isCheaper ? (
                          <View style={styles.cheaperBadge}>
                            <Ionicons name="arrow-down" size={10} color={colors.ok} />
                            <Text style={styles.cheaperBadgeText}>{t('similar.betterPrice')}</Text>
                          </View>
                        ) : null}
                      </View>
                      {product.locked ? (
                        <View style={styles.lockBox}>
                          <Ionicons name="lock-closed" size={13} color={colors.accent} />
                        </View>
                      ) : (
                        <View style={styles.comparePriceBox}>
                          {priceLabel ? <Text style={styles.comparePrice}>{priceLabel}</Text> : null}
                          {ppu ? <Text style={styles.comparePerUnit}>{ppu}</Text> : null}
                        </View>
                      )}
                      <View style={styles.chevronBox}>
                        <Ionicons name="chevron-forward" size={14} color={colors.inkSoft} />
                      </View>
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
      />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  compareSection: { marginTop: 18 },
  searchButtonBackground: {
    borderRadius: 18,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentMid,
  },
  searchButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    overflow: 'hidden',
  },
  searchButtonUnlocked: { backgroundColor: colors.accent },
  searchButtonDisabled: { opacity: 0.72 },
  searchButtonText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fonts.bold,
    color: colors.accent,
    textAlign: 'center',
  },
  searchButtonTextUnlocked: { color: colors.white },
  results: { marginTop: 22 },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 13,
  },
  resultsTitleIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  resultsHeading: { flex: 1, minWidth: 0 },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  sectionHint: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 15,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  resultCount: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultCountText: {
    fontSize: 11.5,
    fontFamily: fonts.bold,
    color: colors.inkSoft,
  },
  resultSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 2,
  },
  currentBestSummary: {
    backgroundColor: 'rgba(63,143,79,0.10)',
    borderColor: 'rgba(63,143,79,0.28)',
  },
  cheaperFoundSummary: {
    backgroundColor: colors.accentLight,
    borderColor: colors.accentMid,
  },
  resultSummaryIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentBestIcon: { backgroundColor: 'rgba(63,143,79,0.14)' },
  cheaperFoundIcon: { backgroundColor: colors.white },
  resultSummaryCopy: { flex: 1, minWidth: 0 },
  resultSummaryTitle: {
    fontSize: 13.5,
    lineHeight: 17,
    fontFamily: fonts.bold,
  },
  currentBestTitle: { color: colors.ok },
  cheaperFoundTitle: { color: colors.accent },
  resultSummaryBody: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 15.5,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
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
    marginTop: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  storeHeader: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.surfaceAlt,
  },
  storeIcon: { width: 26, height: 26, borderRadius: 7 },
  storeName: { flex: 1, fontSize: 13, fontFamily: fonts.bold, color: colors.ink },
  storeCount: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  storeCountText: {
    fontSize: 10.5,
    fontFamily: fonts.bold,
    color: colors.inkSoft,
  },
  compareRow: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: colors.white,
  },
  compareRowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  compareRowCheaper: {
    backgroundColor: 'rgba(63,143,79,0.06)',
  },
  productImageWrap: {
    width: 58,
    height: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  productImage: { width: '100%', height: '100%' },
  iconEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  compareInfo: { flex: 1, minWidth: 0 },
  compareName: { fontSize: 12.5, lineHeight: 16, fontFamily: fonts.semibold, color: colors.ink },
  cheaperBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9,
    backgroundColor: 'rgba(63,143,79,0.13)',
  },
  cheaperBadgeText: { fontSize: 9.5, fontFamily: fonts.bold, color: colors.ok },
  comparePriceBox: { alignItems: 'flex-end', minWidth: 66 },
  lockBox: {
    width: 26,
    height: 26,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  comparePrice: { fontSize: 15, lineHeight: 18, fontFamily: fonts.bold, color: colors.accent },
  comparePerUnit: { fontSize: 11, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },
  chevronBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
});
