// Modelo normalizado de producto para la UI (agnóstico de súper) + adaptadores
// desde la forma de cada catálogo. Lo consume StoreProductList para pintar la
// lista igual en las 6 subcategorías y en la búsqueda.
import type { CatalogStore } from '../constants/stores';
import type { MercadonaProduct, FavoriteProduct } from '../types';
import { formatPrice, formatSize, formatReferencePrice } from '../api/mercadona';
import type {
  BonpreuProduct, CarrefourProduct, BonareaProduct, ConsumProduct, DiaProduct, SorliProduct,
  CondisProduct, AmetllerProduct, AldiProduct, HiperdinoProduct, AlcampoProduct, PlusfrescProduct, TapestryProduct,
  GadisProduct, FroizProduct,
  AhorramasProduct,
} from '../api/catalog';

export type NutriScoreGrade = 'A' | 'B' | 'C' | 'D' | 'E';

export interface UIProduct {
  id: string;
  store: CatalogStore;
  name: string;
  imageUrl: string | null;
  /** Precio del envase ya formateado ("4,99 €"), o '' si no hay. */
  priceLabel: string;
  /** Precio numérico del envase (para el carrito). */
  unitPrice: number | null;
  /** Precio numérico por unidad canónica, usado para ordenar el catálogo. */
  pricePerUnit?: number | null;
  /** Línea secundaria: tamaño/formato del envase ("1 L", "250 Gr"), o null. */
  metaLabel: string | null;
  /** Precio por unidad de medida ya formateado ("3,90 €/L", "1,50 €/kg"), o null.
   *  Se muestra entre paréntesis a la derecha del precio del envase. */
  pricePerUnitLabel: string | null;
  nutriScoreGrade?: NutriScoreGrade | null;
  /** Tipo de oferta ("3x2", "2ª ud. -70%"…) para resaltar ARRIBA del nombre en
   *  rojo (pantalla de Ofertas). Opcional: solo lo aporta OffersScreen. */
  offerTag?: string | null;
  /** Cambio de precio (pantalla Cambios de precios): la fila sustituye la línea
   *  de precio por "anterior tachado · actual en verde/rojo · (%)". Opcional:
   *  solo lo aporta PriceChangesScreen. */
  priceChange?: { prevLabel: string; pctLabel: string; direction: 'up' | 'down' } | null;
  /** Categoría del retailer (para que la Lista agrupe por zona al añadir). */
  categoryName: string | null;
}

const numericPricePerUnit = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const match = value.replace(',', '.').match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

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
    pricePerUnit: numericPricePerUnit(p.price_instructions.reference_price),
    metaLabel: formatSize(p) || null,
    pricePerUnitLabel: formatReferencePrice(p),
    categoryName,
  };
}

export function bonpreuToUI(p: BonpreuProduct): UIProduct {
  return {
    id: p.id, store: 'esclat', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit),
    metaLabel: p.packaging ?? null, pricePerUnitLabel: p.pricePerUnit,
    categoryName: p.categoryName,
  };
}

export function carrefourToUI(p: CarrefourProduct): UIProduct {
  return {
    id: p.id, store: 'carrefour', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit),
    metaLabel: null, pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName,
  };
}

export function bonareaToUI(p: BonareaProduct): UIProduct {
  return {
    id: p.id, store: 'bonarea', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit),
    metaLabel: null, pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName,
  };
}

export function consumToUI(p: ConsumProduct): UIProduct {
  return {
    id: p.id, store: 'consum', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit),
    metaLabel: p.packaging ?? null, pricePerUnitLabel: p.pricePerUnit,
    categoryName: p.categoryName,
  };
}

export function diaToUI(p: DiaProduct): UIProduct {
  return {
    id: p.id, store: 'dia', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit),
    metaLabel: null, pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName,
    offerTag: p.promoName,
  };
}

export function sorliToUI(p: SorliProduct): UIProduct {
  return {
    id: p.id, store: 'sorli', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit),
    // El formato ya va en el nombre ("Naranja Bolsa 2kg") → sin metaLabel.
    metaLabel: null, pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName,
    nutriScoreGrade: p.nutriScoreGrade,
    offerTag: p.promoName,
  };
}

// Condis: bilingüe (es/ca) con €/unidad en columna, como Sorli. El nombre ya trae
// marca y formato ("Leche Condis semidesnatada 1 L") → sin metaLabel.
export function condisToUI(p: CondisProduct): UIProduct {
  return {
    id: p.id, store: 'condis', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit),
    metaLabel: null, pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName,
  };
}

// Ametller Origen: bilingüe (es/ca) con €/unidad en columna, como Sorli/Condis.
// El nombre ya trae marca y formato ("… Ametller Origen 150 g") → sin metaLabel.
export function ametllerToUI(p: AmetllerProduct): UIProduct {
  return {
    id: p.id, store: 'ametller', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit),
    metaLabel: null, pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName,
  };
}

// Aldi: es-only, con marca y formato del envase (salesUnit) → metaLabel como Consum.
export function aldiToUI(p: AldiProduct): UIProduct {
  return {
    id: p.id, store: 'aldi', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit),
    metaLabel: p.packaging ?? null, pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName,
  };
}

/** Gadisline: la etiqueta de oferta es explícita; el precio publicado puede ser
 * directo o corresponder a una promoción por unidades. */
export function gadisToUI(p: GadisProduct): UIProduct {
  return {
    id: p.id, store: 'gadis', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit),
    metaLabel: p.packaging ?? null, pricePerUnitLabel: p.pricePerUnit,
    categoryName: p.categoryName, offerTag: p.promoName,
  };
}

export function froizToUI(p: FroizProduct): UIProduct {
  return { id: p.id, store: 'froiz', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit), metaLabel: p.packaging ?? null,
    pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName, offerTag: p.promoName };
}

/** Ahorramás: catálogo Demandware en castellano. El precio tachado y la
 * vigencia de campaña se conservan para Ofertas; la tarjeta usa el precio final. */
export function ahorramasToUI(p: AhorramasProduct): UIProduct {
  return { id: p.id, store: 'ahorramas', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit), metaLabel: p.packaging ?? null,
    pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName, offerTag: p.promoName };
}

// HiperDino: es-only, sin marca/formato aparte (van en el nombre), con €/unidad
// canónico extraído de price_text.
export function hiperdinoToUI(p: HiperdinoProduct): UIProduct {
  return {
    id: p.id, store: 'hiperdino', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit),
    metaLabel: p.packaging ?? null, pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName,
  };
}

// Alcampo: es-only, con marca y formato del envase (packSizeDescription) → metaLabel
// como Consum/Aldi, y €/unidad en columna.
export function alcampoToUI(p: AlcampoProduct): UIProduct {
  return {
    id: p.id, store: 'alcampo', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit),
    metaLabel: p.packaging ?? null, pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName,
  };
}

// Plusfresc: bilingüe (es/ca) con €/unidad en columna, como Sorli/Condis/Ametller.
// El nombre ya trae marca y formato ("Leche fresca entera LETONA, 1.5 l") → sin metaLabel.
export function plusfrescToUI(p: PlusfrescProduct): UIProduct {
  return {
    id: p.id, store: 'plusfresc', name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit),
    metaLabel: null, pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName,
  };
}

// Eroski y Caprabo comparten forma (TapestryProduct); el store lo fija el wrapper.
// El nombre ya incluye marca y formato ("Leche entera uht BIZKAIA ESNEA, brik
// 1 litro"); el precio unitario se muestra cuando la tarjeta de origen lo publica.
function tapestryToUI(p: TapestryProduct, store: CatalogStore): UIProduct {
  return {
    id: p.id, store, name: p.displayName, imageUrl: p.thumbnail,
    priceLabel: p.priceFormat ?? euro(p.unitPrice), unitPrice: p.unitPrice,
    pricePerUnit: numericPricePerUnit(p.pricePerUnit),
    metaLabel: null, pricePerUnitLabel: p.pricePerUnit, categoryName: p.categoryName,
  };
}
export const eroskiToUI = (p: TapestryProduct): UIProduct => tapestryToUI(p, 'eroski');
export const capraboToUI = (p: TapestryProduct): UIProduct => tapestryToUI(p, 'caprabo');

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
    pricePerUnit: null,
    metaLabel: null,
    pricePerUnitLabel: null,
    categoryName: null,
  };
}
