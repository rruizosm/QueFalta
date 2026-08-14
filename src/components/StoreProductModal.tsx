import { useEffect, useRef, useState } from 'react';
import { Modal, View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';
import {
  fetchBonpreuProduct, fetchCarrefourProduct, fetchBonareaProduct, fetchConsumProduct, fetchDiaProduct, fetchSorliProduct,
  fetchEroskiProduct, fetchCapraboProduct, fetchCondisProduct, fetchAmetllerProduct, fetchAldiProduct, fetchGadisProduct, fetchHiperdinoProduct, fetchAlcampoProduct,
  fetchPlusfrescProduct,
  type BonpreuProduct, type CarrefourProduct, type BonareaProduct, type ConsumProduct, type DiaProduct, type SorliProduct,
  type CondisProduct, type AmetllerProduct, type AldiProduct, type GadisProduct, type HiperdinoProduct, type AlcampoProduct, type PlusfrescProduct, type TapestryProduct,
} from '../api/catalog';
import type { CatalogStore } from '../constants/stores';
import { useToast } from '../context/ToastContext';
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
}

/** Abre el detalle de un producto de CUALQUIER súper encima del modal actual
 *  (RN Modal → se apila sobre el detalle abierto y al cerrarse se vuelve a él).
 *  Mercadona delega en ProductDetailModal (que ya hace su propio fetch); para los
 *  espejos se carga el producto por id y se pinta su modal correspondiente. */
export default function StoreProductModal({ target, onClose, fullScreen = false, badgeLabel }: Props) {
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  const fullScreenTop = useHeaderTopPadding(56);
  const sheetTop = useHeaderTopPadding(56);
  const toast = useToast();
  const { t, lang } = useTranslation();
  const { profile } = useProfile();
  const region = profile?.region ?? null;
  const postalCode = profile?.postalCode ?? null;
  const targetStore = target?.store;
  const targetId = target?.id;
  // El cierre y el texto pueden cambiar de identidad al renderizar el padre.
  // El fetch solo debe reiniciarse cuando cambia el producto o su contexto.
  const feedbackRef = useRef({ onClose, showToast: toast.show, t });
  feedbackRef.current = { onClose, showToast: toast.show, t };
  const [mirror, setMirror] = useState<BonpreuProduct | CarrefourProduct | BonareaProduct | ConsumProduct | DiaProduct | SorliProduct | CondisProduct | AmetllerProduct | AldiProduct | GadisProduct | HiperdinoProduct | AlcampoProduct | PlusfrescProduct | TapestryProduct | null>(null);

  useEffect(() => {
    setMirror(null);
    if (!targetStore || !targetId || targetStore === 'mercadona') return;
    let cancelled = false;
    const fetcher =
      targetStore === 'esclat' ? fetchBonpreuProduct
      : targetStore === 'carrefour' ? (id: string) => fetchCarrefourProduct(id, region)
       : targetStore === 'consum' ? (id: string) => fetchConsumProduct(id, region, postalCode)
      : targetStore === 'dia' ? (id: string) => fetchDiaProduct(id, region)
      : targetStore === 'sorli' ? fetchSorliProduct
      : targetStore === 'eroski' ? fetchEroskiProduct
      : targetStore === 'caprabo' ? fetchCapraboProduct
      : targetStore === 'condis' ? fetchCondisProduct
      : targetStore === 'ametller' ? fetchAmetllerProduct
      : targetStore === 'aldi' ? fetchAldiProduct
      : targetStore === 'gadis' ? fetchGadisProduct
      : targetStore === 'hiperdino' ? fetchHiperdinoProduct
      : targetStore === 'alcampo' ? fetchAlcampoProduct
       : targetStore === 'plusfresc' ? (id: string) => fetchPlusfrescProduct(id, postalCode)
      : fetchBonareaProduct;
    fetcher(targetId)
      .then((p) => {
        if (cancelled) return;
        if (p) setMirror(p);
        else {
          const feedback = feedbackRef.current;
          feedback.showToast(feedback.t('product.loadError'), 'error');
          feedback.onClose();
        }
      })
      .catch(() => {
        if (!cancelled) {
          const feedback = feedbackRef.current;
          feedback.showToast(feedback.t('product.loadError'), 'error');
          feedback.onClose();
        }
      });
    return () => { cancelled = true; };
  }, [targetStore, targetId, region, postalCode, lang]);

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
  } else if (target.store === 'gadis') {
    const GadisProductModal = require('./GadisProductModal').default;
    content = <GadisProductModal product={mirror} onClose={onClose} topInset={topInset} badgeLabel={badgeLabel} />;
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
});
