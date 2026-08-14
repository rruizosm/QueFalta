export type OfferType = 'discount' | 'second_unit' | 'multibuy' | 'club' | 'other';

export interface OfferTypeSource {
  promoName: string | null;
  prevPrice: number | null;
}

const ALL_OFFER_TYPES: OfferType[] = ['discount', 'second_unit', 'multibuy', 'club', 'other'];

const OFFER_TYPE_SUPPORT: Record<string, OfferType[]> = {
  carrefour: ALL_OFFER_TYPES,
  esclat: ALL_OFFER_TYPES,
  consum: ['discount'],
  dia: ['discount', 'second_unit', 'multibuy', 'club'],
  sorli: ['discount', 'second_unit', 'multibuy', 'other'],
  eroski: ['discount', 'second_unit', 'multibuy', 'other'],
  caprabo: ['discount', 'second_unit', 'multibuy', 'other'],
  condis: ['discount', 'second_unit', 'multibuy', 'other'],
  ametller: ALL_OFFER_TYPES,
  aldi: ['discount', 'second_unit', 'other'],
  hiperdino: ['discount'],
  alcampo: ALL_OFFER_TYPES,
  gadis: ALL_OFFER_TYPES,
  ahorramas: ['discount', 'second_unit', 'multibuy', 'other'],
  plusfresc: ['discount', 'second_unit', 'multibuy', 'other'],
};

export const offerTypesForStore = (store: string): OfferType[] =>
  OFFER_TYPE_SUPPORT[store] ?? ALL_OFFER_TYPES;

const normalizeOfferLabel = (value: string | null | undefined) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ª/g, 'a')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Clasifica las etiquetas heterogéneas de los retailers en facetas estables.
 * Una promoción puede pertenecer a varias (p. ej. "Club · 2ª unidad"). */
export function offerTypesOf(offer: OfferTypeSource): OfferType[] {
  const label = normalizeOfferLabel(offer.promoName);
  const secondUnit = /(?:\b2\s*a?s?\s*(?:ud|uds|unidad|unidades|unitat|unitats)\b|\bsegunda\s+unidad\b|\bsegona\s+unitat\b)/.test(label);
  const multibuy = /(?:\b[2-9]\s*x\s*[1-9]\b|\b[2-9]\s*(?:uds?|unidades?|unitats?)\s*(?:por|per|a)\b|\b(?:dos|tres|cuatro)\s+(?:por|per|a)\b|\blotes?\b|\blots?\b|\bpack\b|\bllevate\s*\d+\s*y\s*paga\s*\d+\b|\b(?:unidades?|unitats?)\s+(?:regalo|regal)\b)/.test(label);
  const club = /(?:\bclub\b|\btarjeta\b|\btargeta\b|\bacumul|\bcupon|\bbonific|\bsocio\b|\bclient)/.test(label);
  const textDiscount = /(?:precio\s+(?:rebajado|reducido|imbatible)|preu\s+rebaixat|super\s+precio|\bdescuento\b|\bdescompte\b|\bdto\.?\b|-\s*\d+\s*%|\boferta\s*[·:-]?\s*\d+\s*%)/.test(label);
  const discount = offer.prevPrice != null || (!secondUnit && !multibuy && textDiscount);

  const types: OfferType[] = [];
  if (discount) types.push('discount');
  if (secondUnit) types.push('second_unit');
  if (multibuy) types.push('multibuy');
  if (club) types.push('club');
  if (types.length === 0) types.push('other');
  return types;
}
