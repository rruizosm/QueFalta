import { useEffect, useState } from 'react';
import { Modal, View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';
import {
  fetchBonpreuProduct, fetchCarrefourProduct, fetchBonareaProduct, fetchConsumProduct, fetchDiaProduct,
  type BonpreuProduct, type CarrefourProduct, type BonareaProduct, type ConsumProduct, type DiaProduct,
} from '../api/catalog';
import type { CatalogStore } from '../constants/stores';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';

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
}

/** Abre el detalle de un producto de CUALQUIER súper encima del modal actual
 *  (RN Modal → se apila sobre el detalle abierto y al cerrarse se vuelve a él).
 *  Mercadona delega en ProductDetailModal (que ya hace su propio fetch); para los
 *  espejos se carga el producto por id y se pinta su modal correspondiente. */
export default function StoreProductModal({ target, onClose }: Props) {
  const styles = useThemedStyles(themedStyles);
  const toast = useToast();
  const { t } = useTranslation();
  const [mirror, setMirror] = useState<BonpreuProduct | CarrefourProduct | BonareaProduct | ConsumProduct | DiaProduct | null>(null);

  useEffect(() => {
    setMirror(null);
    if (!target || target.store === 'mercadona') return;
    let cancelled = false;
    const fetcher =
      target.store === 'esclat' ? fetchBonpreuProduct
      : target.store === 'carrefour' ? fetchCarrefourProduct
      : target.store === 'consum' ? fetchConsumProduct
      : target.store === 'dia' ? fetchDiaProduct
      : fetchBonareaProduct;
    fetcher(target.id)
      .then((p) => {
        if (cancelled) return;
        if (p) setMirror(p);
        else { toast.show(t('product.loadError'), 'error'); onClose(); }
      })
      .catch(() => {
        if (!cancelled) { toast.show(t('product.loadError'), 'error'); onClose(); }
      });
    return () => { cancelled = true; };
  }, [target?.store, target?.id]);

  if (!target) return null;

  // Los modales se cargan con require() EN render para romper el ciclo de módulos:
  // cada modal importa SimilarProductsSection, que importa este dispatcher.
  let content;
  if (target.store === 'mercadona') {
    const ProductDetailModal = require('./ProductDetailModal').default;
    content = <ProductDetailModal productId={target.id} onClose={onClose} />;
  } else if (!mirror) {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  } else if (target.store === 'esclat') {
    const BonpreuProductModal = require('./BonpreuProductModal').default;
    content = <BonpreuProductModal product={mirror} onClose={onClose} />;
  } else if (target.store === 'carrefour') {
    const CarrefourProductModal = require('./CarrefourProductModal').default;
    content = <CarrefourProductModal product={mirror} onClose={onClose} />;
  } else if (target.store === 'consum') {
    const ConsumProductModal = require('./ConsumProductModal').default;
    content = <ConsumProductModal product={mirror} onClose={onClose} />;
  } else if (target.store === 'dia') {
    const DiaProductModal = require('./DiaProductModal').default;
    content = <DiaProductModal product={mirror} onClose={onClose} />;
  } else {
    const BonareaProductModal = require('./BonareaProductModal').default;
    content = <BonareaProductModal product={mirror} onClose={onClose} />;
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* La hoja NO cubre toda la pantalla: empieza bajo el banner del carrito
          activo, que sigue visible arriba (lo pinta la pantalla de debajo
          —subcategoría/catálogo/favoritos— que queda en superposición detrás).
          Los modales internos son overlays absolute-fill → rellenan la hoja. */}
      <View style={styles.sheet}>{content}</View>
    </Modal>
  );
}

// Alto reservado arriba para el banner del carrito activo (ActiveCartBanner con
// topInset): la hoja arranca justo debajo de él. Si cambia el banner, ajustar.
const SHEET_TOP = 100;

const themedStyles = () => StyleSheet.create({
  sheet: {
    position: 'absolute',
    top: SHEET_TOP, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.paper,
    borderTopWidth: 1, borderTopColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 }, elevation: 12,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
