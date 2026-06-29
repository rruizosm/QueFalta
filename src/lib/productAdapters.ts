// Modelo normalizado de producto para la UI (agnóstico de súper) + adaptadores
// desde la forma de cada catálogo. Lo consume StoreProductList para pintar la
// lista igual en las 6 subcategorías y en la búsqueda.
import type { CatalogStore } from '../constants/stores';
import type { MercadonaProduct, FavoriteProduct } from '../types';
import { formatPrice, formatSize, formatReferencePrice } from '../api/mercadona';
import type {
  BonpreuProduct, CarrefourProduct, BonareaProduct, ConsumProduct, DiaProduct,
} from '../api/catalog';

export interface UIProduct {
  id: string;
  store: CatalogStore;
  name: string;
  imageUrl: string | null;
  /** Precio del envase ya formateado ("4,99 €"), o '' si no hay. */
  priceLabel: string;
  /** Precio numérico del envase (para el carrito). */
  unitPrice: number | null;
  /** Línea secundaria: tamaño/formato del envase ("1 L", "250 Gr"), o null. */
  metaLabel: string | null;
  /** Precio por unidad de medida ya formateado ("3,90 €/L", "1,50 €/kg"), o null.
   *  Se muestra entre paréntesis a la derecha del precio del envase. */
  pricePerUnitLabel: string | null;
  /** Categoría del retailer (para que la Lista agrupe por zona al añadir). */
  categoryName: string | null;
  /** CCAA donde el producto es EXCLUSIVO, o null si es nacional. Solo Mercadona lo
   *  aporta (único súper con datos por almacén); dispara la insignia de exclamación
   *  en lista/cuadrícula y la línea "Producto solo disponible en …" en la ficha. */
  exclusiveRegions: string[] | null;
}

const euro = (n: number | null | undefined): string =>
  n != null ? `${n.toFixed(2).replace('.', ',')} €` : '';

export function mercadonaToUI(
  p: MercadonaProduct,
  // Por defecto, la categoría (N2) que el producto trae del espejo → la Lista lo
  // agrupa por su zona. ProductsScreen (navegación por categorías) pasa el N1
  // explícito y ese tiene prioridad.
  categoryName: string | null = p.categories?.[0]?.name ?? null,
): UIProduct {
  return {
    id: p.id,
    store: 'mercadona',
    name: p.display_name,
    imageUrl: p.thumbnail ?? null,
    priceLabel: formatPrice(p),
    unitPrice: parseFloat(p.price_instructions.unit_price),
    metaLabel: formatSize(p) || null,
    pricePerUnitLabel: formatReferencePrice(p),
    categoryName,
    exclusiveRegions: p.regions && p.regions.length ? p.regions : null,
  };
}

export function bonpreuToUI(p: BonpreuProduct): UIProduct {
  return {
    id: p.id, store: 'esclat', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: euro(p.unitPrice), unitPrice: p.unitPrice,
    metaLabel: p.packaging ?? null, pricePerUnitLabel: p.pricePerUnit,
    categoryName: p.categoryName, exclusiveRegions: null,
  };
}

export function carrefourToUI(p: CarrefourProduct): UIProduct {
  return {
    id: p.id, store: 'carrefour', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    metaLabel: null, pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName,
    exclusiveRegions: null,
  };
}

export function bonareaToUI(p: BonareaProduct): UIProduct {
  return {
    id: p.id, store: 'bonarea', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    metaLabel: null, pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName,
    exclusiveRegions: null,
  };
}

export function consumToUI(p: ConsumProduct): UIProduct {
  return {
    id: p.id, store: 'consum', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    metaLabel: p.packaging ?? null, pricePerUnitLabel: p.pricePerUnit,
    categoryName: p.categoryName, exclusiveRegions: null,
  };
}

export function diaToUI(p: DiaProduct): UIProduct {
  return {
    id: p.id, store: 'dia', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    metaLabel: null, pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName,
    exclusiveRegions: null,
  };
}

/** Favorito guardado → producto de UI. El precio es el snapshot de cuando se
 *  marcó; no hay metaLabel ni categoría del retailer (se perdieron al guardar). */
export function favoriteToUI(p: FavoriteProduct): UIProduct {
  const n = p.price != null ? parseFloat(p.price) : NaN;
  const unitPrice = Number.isFinite(n) ? n : null;
  return {
    id: p.refId,
    store: p.store,
    name: p.name,
    imageUrl: p.imageUrl ?? null,
    priceLabel: euro(unitPrice),
    unitPrice,
    metaLabel: null,
    pricePerUnitLabel: null,
    categoryName: null,
    exclusiveRegions: null,
  };
}
