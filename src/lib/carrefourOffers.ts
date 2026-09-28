/** Resolución local de promociones: observed_at indica cuándo se observó el
 * catálogo, nunca la vigencia de una promoción. Las fechas son días locales. */
export type CarrefourPromotionKind = 'multibuy' | 'second_unit' | 'discount' | 'club' | 'shipping';

export interface CarrefourPromotion {
  name: string;
  text: string | null;
  start: string | null;
  end: string | null;
  kind: CarrefourPromotionKind;
  link: string | null;
}

export interface ResolvedCarrefourOffers {
  primary: CarrefourPromotion | null;
  promotions: CarrefourPromotion[];
  strikethroughPrice: number | null;
}

const kinds: CarrefourPromotionKind[] = ['multibuy', 'second_unit', 'discount', 'club', 'shipping'];
const priority: Record<CarrefourPromotionKind, number> = {
  multibuy: 0, second_unit: 1, discount: 2, club: 3, shipping: 4,
};
const datePart = (value: unknown): string | null =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)
    ? value.slice(0, 10) : null;
const stringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const positivePrice = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
const object = (value: unknown): Record<string, any> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;

/** Marketing badges describe a feature, not a savings or buying condition. */
const nonOffer = (name: string) => /^(?:air\s*fryer|innovaci[oó]n|novedad)$/i.test(name.trim());
const live = (promotion: CarrefourPromotion, today: string) =>
  (promotion.start == null || promotion.start <= today)
  && (promotion.end == null || promotion.end >= today);

function parsePromotion(value: unknown): CarrefourPromotion | null {
  const row = object(value);
  const name = stringOrNull(row?.name);
  if (!row || !name || nonOffer(name) || !kinds.includes(row.kind)) return null;
  return {
    name, text: stringOrNull(row.text), start: datePart(row.start),
    end: datePart(row.end), kind: row.kind, link: stringOrNull(row.link),
  };
}

function legacyKind(name: string | null, price: number | null): CarrefourPromotionKind | null {
  if (name && nonOffer(name)) return null;
  const label = (name ?? '').toLowerCase();
  if (/\b[2-9]\s*x\s*[1-9]\b/.test(label)) return 'multibuy';
  if (/2[ªa]?\s*(?:ud|unidad)|segunda unidad/.test(label)) return 'second_unit';
  if (/\bclub\b|cup[oó]n|tarjeta|acumul|socio/.test(label)) return 'club';
  if (/env[ií]o\s+gratis|portes\s+gratis/.test(label)) return 'shipping';
  if (price != null || /descuento|rebajado|%/.test(label)) return 'discount';
  return null;
}

export function resolveCarrefourOffers(
  row: Record<string, any>, community: string | null, today: string,
): ResolvedCarrefourOffers {
  const regional = community ? object(object(row.regional_prices)?.[community]) : null;
  const regionalOffers = object(regional?.offers);
  const baseOffers = object(row.quefalta_offers ?? object(row.raw)?.quefalta_offers);
  // Una entrada regional antigua solo acredita el precio. No sabemos si el
  // badge de Madrid se publicó allí, así que no se hereda.
  const source = regional ? regionalOffers?.version === 1 ? regionalOffers : null
    : baseOffers?.version === 1 ? baseOffers : null;
  const legacyAllowed = !regional && !source;
  const rawPromotions = source && Array.isArray(source.promotions)
    ? source.promotions.map(parsePromotion).filter((p): p is CarrefourPromotion => p != null)
    : [];
  const promotions = rawPromotions.filter((p) => live(p, today));
  const previous = positivePrice(source?.strikethrough_price ?? (legacyAllowed ? row.strikethrough_price : null));
  const current = positivePrice(regional?.p ?? row.unit_price);
  const validPrevious = previous != null && current != null && previous > current ? previous : null;
  if (legacyAllowed) {
    const name = stringOrNull(row.promo_name);
    const kind = legacyKind(name, validPrevious);
    if (kind && (name || validPrevious != null)) {
      const legacy: CarrefourPromotion = {
        name: name ?? 'Precio rebajado', text: stringOrNull(row.promo_text),
        start: datePart(row.promo_start), end: datePart(row.promo_end), kind, link: null,
      };
      if (live(legacy, today)) promotions.push(legacy);
    }
  }
  // Los registros v1 aún conservan la promoción principal en columnas: cubre
  // despliegues parciales si el array falta, sin convertir badges editoriales.
  if (source && !Array.isArray(source.promotions)) {
    const name = stringOrNull(source.promo_name);
    const kind = legacyKind(name, validPrevious);
    if (kind && name) {
      const fallback: CarrefourPromotion = {
        name, text: stringOrNull(source.promo_text), start: datePart(source.promo_start),
        end: datePart(source.promo_end), kind, link: null,
      };
      if (live(fallback, today)) promotions.push(fallback);
    }
  }
  promotions.sort((a, b) => priority[a.kind] - priority[b.kind]);
  // El precio anterior solo se presenta junto a una rebaja inmediata explícita.
  const primary = promotions[0] ?? null;
  return {
    primary,
    promotions,
    strikethroughPrice: primary?.kind === 'discount' ? validPrevious : null,
  };
}
