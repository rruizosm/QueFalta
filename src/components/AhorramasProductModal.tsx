import React from 'react';
import type { AhorramasProduct } from '../api/catalog';
import AldiProductModal from './AldiProductModal';

/** Ahorramás comparte el detalle básico de espejo hasta sincronizar la ficha
 * completa. Los precios y promociones proceden del catálogo público. */
export default function AhorramasProductModal(props: { product: AhorramasProduct | null; onClose: () => void; topInset?: number; badgeLabel?: string }) {
  return <AldiProductModal {...props} store="ahorramas" />;
}
