import React from 'react';
import type { LidlProduct } from '../api/catalog';
import AldiProductModal from './AldiProductModal';

/** Lidl publica ficha básica (nombre, marca, formato, precio e imagen). */
export default function LidlProductModal(props: { product: LidlProduct | null; onClose: () => void; topInset?: number; badgeLabel?: string }) {
  return <AldiProductModal {...props} store="lidl" />;
}
