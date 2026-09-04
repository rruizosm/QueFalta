import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import {
  fetchBonpreuProduct, fetchCarrefourProduct, fetchBonareaProduct, fetchConsumProduct, fetchDiaProduct, fetchSorliProduct,
  fetchEroskiProduct, fetchCapraboProduct, fetchCondisProduct, fetchAmetllerProduct, fetchAldiProduct, fetchLidlProduct, fetchGadisProduct, fetchFroizProduct, fetchAhorramasProduct, fetchHiperdinoProduct, fetchAlcampoProduct,
  fetchPlusfrescProduct,
  type BonpreuProduct, type CarrefourProduct, type BonareaProduct, type ConsumProduct, type DiaProduct, type SorliProduct,
  type CondisProduct, type AmetllerProduct, type AldiProduct, type LidlProduct, type GadisProduct, type FroizProduct, type AhorramasProduct, type HiperdinoProduct, type AlcampoProduct, type PlusfrescProduct, type TapestryProduct,
} from '../api/catalog';
import type { CatalogStore } from '../constants/stores';
import type { RegionValue } from '../constants/regions';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useProfile } from '../context/ProfileContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useReducedMotion } from '../hooks/useReducedMotion';

/** Referencia a un producto de cualquier súper (lo que devuelve la comparativa). */
export interface ProductRef {
  store: CatalogStore;
  id: string;
}

interface Props {
  /** Producto a abrir encima del actual. null = oculto. */
  target: ProductRef | null;
  /** Vuelve al producto anterior (cierra solo este nivel). */
  onClose: () => void;
  /** Pantalla completa, sin borde ni sombra de hoja (cesta). */
  fullScreen?: boolean;
  /** Etiqueta contextual superpuesta en la imagen principal (p. ej. Novedad). */
  badgeLabel?: string;
  /** Si un resultado del comparador no existe en la zona activa, permite abrir
   *  su ficha desde el catálogo global que originó esa misma comparación. */
  fallbackToGlobalCatalog?: boolean;
}

type MirrorProduct = BonpreuProduct | CarrefourProduct | BonareaProduct | ConsumProduct
  | DiaProduct | SorliProduct | CondisProduct | AmetllerProduct | AldiProduct
  | LidlProduct
  | GadisProduct | FroizProduct | AhorramasProduct | HiperdinoProduct
  | AlcampoProduct | PlusfrescProduct | TapestryProduct;

const LOCATION_FILTERED_STORES = new Set<CatalogStore>(['carrefour', 'consum', 'dia', 'plusfresc']);

function fetchMirrorProduct(
  store: Exclude<CatalogStore, 'mercadona'>,
  id: string,
  region: RegionValue | null,
  postalCode: string | null,
  ignoreLocation = false,
  lidlStoreId: string | null = null,
): Promise<MirrorProduct | null> {
  const activeRegion = ignoreLocation ? null : region;
  const activePostalCode = ignoreLocation ? null : postalCode;
  const fetcher =
    store === 'esclat' ? fetchBonpreuProduct
    : store === 'carrefour' ? (productId: string) => fetchCarrefourProduct(productId, activeRegion)
    : store === 'consum' ? (productId: string) => fetchConsumProduct(productId, activeRegion, activePostalCode)
    : store === 'dia' ? (productId: string) => fetchDiaProduct(productId, activeRegion)
    : store === 'sorli' ? fetchSorliProduct
    : store === 'eroski' ? fetchEroskiProduct
    : store === 'caprabo' ? fetchCapraboProduct
    : store === 'condis' ? fetchCondisProduct
    : store === 'ametller' ? fetchAmetllerProduct
    : store === 'aldi' ? fetchAldiProduct
    : store === 'lidl' ? (productId: string) => fetchLidlProduct(productId, lidlStoreId)
    : store === 'gadis' ? fetchGadisProduct
    : store === 'froiz' ? fetchFroizProduct
    : store === 'ahorramas' ? fetchAhorramasProduct
    : store === 'hiperdino' ? fetchHiperdinoProduct
    : store === 'alcampo' ? fetchAlcampoProduct
    : store === 'plusfresc' ? (productId: string) => fetchPlusfrescProduct(productId, activePostalCode)
    : fetchBonareaProduct;
  return fetcher(id);
}

/** Abre el detalle de un producto de CUALQUIER súper encima del modal actual
 *  (RN Modal → se apila sobre el detalle abierto y al cerrarse se vuelve a él).
 *  Mercadona delega en ProductDetailModal (que ya hace su propio fetch); para los
 *  espejos se carga el producto por id y se pinta su modal correspondiente. */
export default function StoreProductModal({
  target,
  onClose,
  fullScreen = false,
  badgeLabel,
  fallbackToGlobalCatalog = false,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  const fullScreenTop = useHeaderTopPadding(56);
  const sheetTop = useHeaderTopPadding(56);
  const { t, lang } = useTranslation();
  const { profile } = useProfile();
  const region = profile?.region ?? null;
  const postalCode = profile?.postalCode ?? null;
  const lidlStoreId = profile?.lidlStoreId ?? null;
  const targetStore = target?.store;
  const targetId = target?.id;
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = targetStore && targetId
    ? [targetStore, targetId, region ?? '', postalCode ?? '', lidlStoreId ?? '', lang, reloadToken].join('\u001f')
    : null;
  const [mirrorResult, setMirrorResult] = useState<{ key: string; product: MirrorProduct } | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const mirror = requestKey && mirrorResult?.key === requestKey ? mirrorResult.product : null;
  const loadError = requestKey != null && errorKey === requestKey;

  useEffect(() => {
    setErrorKey(null);
    if (!targetStore || !targetId || targetStore === 'mercadona' || !requestKey) return;
    let cancelled = false;
    (async () => {
      try {
        const store = targetStore as Exclude<CatalogStore, 'mercadona'>;
        let product = await fetchMirrorProduct(store, targetId, region, postalCode, false, lidlStoreId);
        if (!product && fallbackToGlobalCatalog && LOCATION_FILTERED_STORES.has(store)) {
          product = await fetchMirrorProduct(store, targetId, region, postalCode, true);
        }
        if (cancelled) return;
        if (product) setMirrorResult({ key: requestKey, product });
        else setErrorKey(requestKey);
      } catch {
        if (!cancelled) setErrorKey(requestKey);
      }
    })();
    return () => { cancelled = true; };
  }, [fallbackToGlobalCatalog, requestKey, targetStore, targetId, region, postalCode, lidlStoreId]);

  if (!target) return null;

  // Inset superior de la cabecera del modal interno: a pantalla completa (cesta)
  // despeja la barra de estado/notch como el resto de cabeceras (56 en iOS); en
  // la hoja basta con poco, porque la propia hoja ya arranca bajo el notch.
  const topInset = fullScreen ? fullScreenTop : 16;

  // Los modales se cargan con require() EN render para romper el ciclo de módulos:
  // cada modal importa SimilarProductsSection, que importa este dispatcher.
  let content;
  if (target.store === 'mercadona') {
    const ProductDetailModal = require('./ProductDetailModal').default;
    content = <ProductDetailModal productId={target.id} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (loadError) {
    content = (
      <View style={styles.loadState}>
        <View style={[styles.loadHeader, { paddingTop: topInset }]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={24} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.loadHeaderTitle}>{t('product.detailTitle')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorState}>
          <Ionicons name="alert-circle-outline" size={44} color={colors.inkFaint} />
          <Text style={styles.errorText}>{t('product.detailLoadError')}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setReloadToken((current) => current + 1)}
            activeOpacity={0.75}
            style={styles.retryButton}
          >
            <Ionicons name="refresh" size={17} color={colors.white} />
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  } else if (!mirror) {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  } else if (target.store === 'esclat') {
    const BonpreuProductModal = require('./BonpreuProductModal').default;
    content = <BonpreuProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (target.store === 'carrefour') {
    const CarrefourProductModal = require('./CarrefourProductModal').default;
    content = <CarrefourProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (target.store === 'consum') {
    const ConsumProductModal = require('./ConsumProductModal').default;
    content = <ConsumProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (target.store === 'dia') {
    const DiaProductModal = require('./DiaProductModal').default;
    content = <DiaProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (target.store === 'sorli') {
    const SorliProductModal = require('./SorliProductModal').default;
    content = <SorliProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (target.store === 'eroski' || target.store === 'caprabo') {
    const TapestryProductModal = require('./TapestryProductModal').default;
    const storeLabel = target.store === 'caprabo' ? 'Caprabo' : 'Eroski';
    content = <TapestryProductModal product={mirror} store={target.store} storeLabel={storeLabel} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (target.store === 'condis') {
    const CondisProductModal = require('./CondisProductModal').default;
    content = <CondisProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (target.store === 'ametller') {
    const AmetllerProductModal = require('./AmetllerProductModal').default;
    content = <AmetllerProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (target.store === 'aldi') {
    const AldiProductModal = require('./AldiProductModal').default;
    content = <AldiProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (target.store === 'lidl') {
    const LidlProductModal = require('./LidlProductModal').default;
    content = <LidlProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (target.store === 'gadis') {
    const GadisProductModal = require('./GadisProductModal').default;
    content = <GadisProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (target.store === 'froiz') {
    const AldiProductModal = require('./AldiProductModal').default;
    content = <AldiProductModal product={mirror} store="froiz" onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (target.store === 'ahorramas') {
    const AhorramasProductModal = require('./AhorramasProductModal').default;
    content = <AhorramasProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (target.store === 'hiperdino') {
    const HiperdinoProductModal = require('./HiperdinoProductModal').default;
    content = <HiperdinoProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (target.store === 'alcampo') {
    const AlcampoProductModal = require('./AlcampoProductModal').default;
    content = <AlcampoProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else if (target.store === 'plusfresc') {
    const PlusfrescProductModal = require('./PlusfrescProductModal').default;
    content = <PlusfrescProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  } else {
    const BonareaProductModal = require('./BonareaProductModal').default;
    content = <BonareaProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
  }

  return (
    <Modal visible transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      {/* fullScreen (cesta) cubre toda la pantalla. El detalle anidado conserva
          el formato de hoja y despeja la barra de estado. */}
      <View style={fullScreen ? styles.sheetFull : [styles.sheet, { top: sheetTop }]}>{content}</View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    // top inline (sheetTop): despeja la barra de estado
    backgroundColor: colors.paper,
    borderTopWidth: 1, borderTopColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 }, elevation: 12,
  },
  // Pantalla completa (cesta): sin hueco superior ni borde/sombra de hoja.
  sheetFull: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.paper,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadState: { flex: 1, backgroundColor: colors.paper },
  loadHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
  },
  closeButton: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  loadHeaderTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink },
  headerSpacer: { width: 38, height: 38 },
  errorState: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12,
    paddingHorizontal: 40, paddingBottom: 48,
  },
  errorText: {
    fontSize: 14, lineHeight: 20, fontFamily: fonts.medium,
    color: colors.inkSoft, textAlign: 'center',
  },
  retryButton: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 4, paddingHorizontal: 18, borderRadius: 16, backgroundColor: colors.accent,
  },
  retryButtonText: { fontSize: 14, fontFamily: fonts.bold, color: colors.white },
});
