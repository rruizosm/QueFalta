import { useEffect, useState } from 'react';
import { Modal, View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';
import {
  fetchBonpreuProduct, fetchCarrefourProduct, fetchBonareaProduct,
  type BonpreuProduct, type CarrefourProduct, type BonareaProduct,
} from '../api/catalog';
import type { CatalogStore } from '../constants/stores';
import { useToast } from '../context/ToastContext';

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
  const toast = useToast();
  const [mirror, setMirror] = useState<BonpreuProduct | CarrefourProduct | BonareaProduct | null>(null);

  useEffect(() => {
    setMirror(null);
    if (!target || target.store === 'mercadona') return;
    let cancelled = false;
    const fetcher =
      target.store === 'esclat' ? fetchBonpreuProduct
      : target.store === 'carrefour' ? fetchCarrefourProduct
      : fetchBonareaProduct;
    fetcher(target.id)
      .then((p) => {
        if (cancelled) return;
        if (p) setMirror(p);
        else { toast.show('No se pudo cargar el producto.', 'error'); onClose(); }
      })
      .catch(() => {
        if (!cancelled) { toast.show('No se pudo cargar el producto.', 'error'); onClose(); }
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
  } else {
    const BonareaProductModal = require('./BonareaProductModal').default;
    content = <BonareaProductModal product={mirror} onClose={onClose} />;
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      {/* Los modales son overlays absolute-fill: necesitan un contenedor flex:1. */}
      <View style={styles.host}>{content}</View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, backgroundColor: colors.paper },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
