import React from 'react';
import type { GadisProduct } from '../api/catalog';
import AldiProductModal from './AldiProductModal';

/** Gadis y Aldi comparten por ahora el detalle básico de espejo. El adaptador
 * mantiene separados favorito, precio e identificador de tienda en el dispatcher. */
export default function GadisProductModal(props: { product: GadisProduct | null; onClose: () => void; topInset?: number; badgeLabel?: string }) {
  // La ficha visual de Aldi está ligada a su tienda; Gadis se renderiza desde el
  // dispatcher genérico hasta que se incorpore detalle nutricional estructurado.
  return <AldiProductModal {...props} store="gadis" />;
}
