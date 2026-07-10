import { useEffect, useState } from 'react';
import { Modal, View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';
import {
  fetchBonpreuProduct, fetchCarrefourProduct, fetchBonareaProduct, fetchConsumProduct, fetchDiaProduct, fetchSorliProduct,
  type BonpreuProduct, type CarrefourProduct, type BonareaProduct, type ConsumProduct, type DiaProduct, type SorliProduct,
} from '../api/catalog';
import type { CatalogStore } from '../constants/stores';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';

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
  /** Pantalla completa, sin hueco superior (cesta). Por defecto es una hoja que
   *  arranca bajo el banner del carrito activo (catálogo/categorías/comparativa). */
  fullScreen?: boolean;
}

/** Abre el detalle de un producto de CUALQUIER súper encima del modal actual
 *  (RN Modal → se apila sobre el detalle abierto y al cerrarse se vuelve a él).
 *  Mercadona delega en ProductDetailModal (que ya hace su propio fetch); para los
 *  espejos se carga el producto por id y se pinta su modal correspondiente. */
export default function StoreProductModal({ target, onClose, fullScreen = false }: Props) {
  const styles = useThemedStyles(themedStyles);
  const fullScreenTop = useHeaderTopPadding(56);
  // Alto reservado arriba para el banner del carrito activo (ActiveCartBanner
  // con topInset, marginTop useHeaderTopPadding(52) + ~48 de banner): la hoja
  // arranca justo debajo de él. Si cambia el banner, ajustar.
  const sheetTop = useHeaderTopPadding(52) + 48;
  const toast = useToast();
  const { t } = useTranslation();
  const [mirror, setMirror] = useState<BonpreuProduct | CarrefourProduct | BonareaProduct | ConsumProduct | DiaProduct | SorliProduct | null>(null);

  useEffect(() => {
    setMirror(null);
    if (!target || target.store === 'mercadona') return;
    let cancelled = false;
    const fetcher =
      target.store === 'esclat' ? fetchBonpreuProduct
      : target.store === 'carrefour' ? fetchCarrefourProduct
      : target.store === 'consum' ? fetchConsumProduct
      : target.store === 'dia' ? fetchDiaProduct
      : target.store === 'sorli' ? fetchSorliProduct
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

  // Inset superior de la cabecera del modal interno: a pantalla completa (cesta)
  // despeja la barra de estado/notch como el resto de cabeceras (56 en iOS); en
  // la hoja basta con poco, porque la propia hoja ya arranca bajo el notch.
  const topInset = fullScreen ? fullScreenTop : 16;

  // Los modales se cargan con require() EN render para romper el ciclo de módulos:
  // cada modal importa SimilarProductsSection, que importa este dispatcher.
  let content;
  if (target.store === 'mercadona') {
    const ProductDetailModal = require('./ProductDetailModal').default;
    content = <ProductDetailModal productId={target.id} onClose={onClose} topInset={topInset} />;
  } else if (!mirror) {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  } else if (target.store === 'esclat') {
    const BonpreuProductModal = require('./BonpreuProductModal').default;
    content = <BonpreuProductModal product={mirror} onClose={onClose} topInset={topInset} />;
  } else if (target.store === 'carrefour') {
    const CarrefourProductModal = require('./CarrefourProductModal').default;
    content = <CarrefourProductModal product={mirror} onClose={onClose} topInset={topInset} />;
  } else if (target.store === 'consum') {
    const ConsumProductModal = require('./ConsumProductModal').default;
    content = <ConsumProductModal product={mirror} onClose={onClose} topInset={topInset} />;
  } else if (target.store === 'dia') {
    const DiaProductModal = require('./DiaProductModal').default;
    content = <DiaProductModal product={mirror} onClose={onClose} topInset={topInset} />;
  } else if (target.store === 'sorli') {
    const SorliProductModal = require('./SorliProductModal').default;
    content = <SorliProductModal product={mirror} onClose={onClose} topInset={topInset} />;
  } else {
    const BonareaProductModal = require('./BonareaProductModal').default;
    content = <BonareaProductModal product={mirror} onClose={onClose} topInset={topInset} />;
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* fullScreen (cesta): cubre toda la pantalla, sin hueco arriba. Si no, la
          hoja NO cubre todo: empieza bajo el banner del carrito activo, que sigue
          visible arriba (lo pinta la pantalla de debajo —subcategoría/catálogo/
          favoritos—). Los modales internos son overlays absolute-fill → rellenan
          el contenedor en ambos casos. */}
      <View style={fullScreen ? styles.sheetFull : [styles.sheet, { top: sheetTop }]}>{content}</View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    // top inline (sheetTop): bajo el banner del carrito activo
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
