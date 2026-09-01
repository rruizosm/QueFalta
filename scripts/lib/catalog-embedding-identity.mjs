import { createHash } from 'node:crypto';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_CONTENT_VERSION = 'catalog_embedding_content_v1';

const ATTRIBUTE_RULES = [
  ['sin_lactosa', /\bsin lactosa\b/],
  ['vegetal', /\b(vegetal|avena|soja|almendra)\b/],
  ['bio', /\b(bio|ecologic[oa])\b/],
  ['infantil', /\b(infantil|bebe)\b/],
  ['sin_gluten', /\bsin gluten\b/],
  ['sin_azucar', /\bsin azucar\b/],
  ['proteina', /\b(proteina|proteico)\b/],
  ['desnatada', /\bdesnatad[oa]\b/],
  ['semidesnatada', /\bsemidesnatad[oa]\b/],
  ['entera', /\benter[oa]\b/],
  ['preparado', /\b(al horno|hornead[oa]|asad[oa]|cocid[oa]|frit[oa]|rebozad[oa]|empanad[oa]|a la romana)\b/],
];

// Mantiene las mismas familias funcionales que catalog_product_family_v1. La
// señal procede del nombre del producto, nunca del árbol variable de cada súper.
const FAMILY_RULES = [
  ['toothpaste', /\b(pasta de dientes|dentifrico)\b/],
  ['shower_gel', /\b(gel de ducha|gel de bano|gel corporal)\b/],
  ['laundry_detergent', /\b(detergente (ropa|lavadora)|capsulas lavadora)\b/],
  ['dishwasher', /\b(lavavajillas|rentavaixelles)\b/],
  ['fabric_softener', /\bsuavizante\b/],
  ['shampoo', /\b(champu|shampoo)\b/],
  ['deodorant', /\bdesodorante\b/],
  ['nappies', /\b(panal|panales)\b/],
  ['pizza', /\bpizza\b/],
  ['ice_cream', /\b(helado|sorbete)\b/],
  ['charcuterie', /\b(chorizo|mortadela|salchichon|fuet)\b/],
  ['cephalopod', /\b(chipiron|calamar|pulpo)\b/],
  ['pastry', /\bhojaldre\b/],
  ['yogurt', /\b(yogur|yogurt|skyr|kefir|activia)\b/],
  ['cheese', /\b(queso|formatge|provolone|mozzarella|emmental|gouda|cheddar|brie|camembert|philadelphia)\b/],
  ['butter', /\b(mantequilla|mantega)\b/],
  ['kombucha', /\bkombucha\b/],
  ['tea', /\b(te|tea|te frio|ice tea|nestea|fuze tea|lipton)\b/],
  ['coffee', /\b(cafe|coffee|espresso|cappuccino|capuchino)\b/],
  ['cocoa_drink', /\b(chocolate (a la taza|bebida)|cacao (soluble|instantaneo)|batido de chocolate)\b/],
  ['plant_drink', /\b(bebida (vegetal|de (avena|soja|almendra|arroz|coco))|leche de (avena|soja|almendra|arroz|coco)|begetal)\b/],
  ['milk', /\bleche\b/],
  ['horchata', /\bhorchata\b/],
  ['juice', /\b(zumo|jugo|nectar|smoothie|bifrutas)\b/],
  ['isotonic_drink', /\b(isotonico|isotonica|aquarius|powerade)\b/],
  ['energy_drink', /\b(energetico|energetica|energy drink|red bull|monster)\b/],
  ['tonic', /\b(tonica|tonic water)\b/],
  ['beer', /\b(cerveza|beer)\b/],
  ['cider', /\b(sidra|cider)\b/],
  ['sparkling_wine', /\b(cava|champan|champagne|espumoso)\b/],
  ['wine', /\b(vino|vermut|vermouth|sangria)\b/],
  ['spirit', /\b(ginebra|gin|ron|whisky|whiskey|vodka|tequila|licor)\b/],
  ['soft_drink', /\b(refresco|gaseosa|soda|cola|coca cola|pepsi|fanta|sprite|seven up|7up)\b/],
  ['cream', /\b(nata|crema de leche)\b/],
  ['eggs', /^\s*(huevo|huevos|ous)\b/],
  ['mayonnaise', /\b(mayonesa|maionesa)\b/],
  ['ketchup', /\b(ketchup|catsup)\b/],
  ['mustard', /\bmostaza\b/],
  ['pesto', /\bpesto\b/],
  ['soy_sauce', /\bsalsa de soja\b/],
  ['tomato_sauce', /\b(tomate (frito|triturado)|salsa de tomate)\b/],
  ['oil', /\baceite\b/],
  ['vinegar', /\bvinagre\b/],
  ['pasta', /\b(pasta|espagueti|spaghetti|macarron|tallarin|fideo|ravioli|tortellini)\b/],
  ['rice', /\barroz\b/],
  ['bread', /\b(pan|baguette|chapata|molde)\b/],
  ['flour', /\bharina\b/],
  ['breakfast_cereal', /\b(cereal|muesli|granola)\b/],
  ['biscuits', /\b(galleta|cookie)\b/],
  ['chicken', /\bpollo\b/],
  ['turkey', /\bpavo\b/],
  ['beef', /\b(ternera|vacuno|buey)\b/],
  ['pork', /\b(cerdo|porcino)\b/],
  ['lamb', /\bcordero\b/],
  ['rabbit', /\bconejo\b/],
  ['salmon', /\bsalmon\b/],
  ['tuna', /\b(atun|bonito)\b/],
  ['hake', /\bmerluza\b/],
  ['cod', /\bbacalao\b/],
  ['sardine', /\bsardina\b/],
  ['prawn', /\b(gamba|langostino|camaron)\b/],
];

export function normalizeIdentityText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function semanticProductName(value) {
  const normalized = normalizeIdentityText(value)
    .replace(/\b(burger|burguer|hamburguesas?)\b/g, 'hamburguesa')
    // Los paréntesis suelen envolver variantes semánticas (fresa, sin alcohol,
    // descafeinado). Quitamos solo los delimitadores, nunca su contenido.
    .replace(/[()]/g, ' ')
    .replace(/\b\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:kg|g|gr|ml|cl|l|ud|uds|u)\b/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|ml|cl|l|ud|uds|u)\b/g, ' ')
    .replace(/\b\d+\s*[x×]\b/g, ' ')
    .replace(/\b(pack(?: de)? ahorro|pack familiar|formato familiar|formato ahorro)\b/g, ' ')
    // `dia` y `consum` son palabras naturales ambiguas (crema de dia,
    // listo para consumir). Solo retiramos marcas inequívocas del nombre.
    .replace(/\b(hacendado|bonpreu|bonarea|carrefour|deliplus|aliada|eroski|caprabo|sorli|ametller|alcampo|auchan|plusfresc)\b/g, ' ')
    .replace(/\b(brik|brick|carton|botella|garrafa|lata|tarro|bote|bolsa|paquete|bandeja|envase|granel)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || normalizeIdentityText(value);
}

export function stableCategoryFamily(name) {
  const normalized = normalizeIdentityText(name).replace(/[-_/]+/g, ' ');
  if (/\bagua\b/.test(normalized) && !/\bagua de colonia\b/.test(normalized)) return 'water';
  return FAMILY_RULES.find(([, rule]) => rule.test(normalized))?.[0] ?? null;
}

export function semanticAttributes(name) {
  const normalized = normalizeIdentityText(name);
  return Object.fromEntries(ATTRIBUTE_RULES.map(([key, rule]) => [key, rule.test(normalized)]));
}

const hash = (value) => createHash('sha256').update(value).digest('hex');

const normalizedQuantity = (value) => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(value);
};

const activeAttributeKeys = (attributes) => Object.entries(attributes ?? {})
  .filter(([, active]) => active === true)
  .map(([key]) => key)
  .sort();

export function buildCatalogMatchMetadataHash({
  attributes,
  canonicalUnit = null,
  categoryFamily = null,
  globalGtin = null,
  published = true,
  quantityBase = null,
}) {
  return hash(JSON.stringify({
    attributes: activeAttributeKeys(attributes),
    canonicalUnit: canonicalUnit || null,
    categoryFamily: categoryFamily || null,
    globalGtin: globalGtin || null,
    published: published === true,
    quantityBase: normalizedQuantity(quantityBase),
  }));
}

/**
 * Constructor congelado del texto catalog_embedding_content_v1. Mantenerlo
 * estable evita mezclar distribuciones de embeddings bajo la misma versión.
 */
export function buildCatalogEmbeddingInputV1({
  name,
  nameCa = null,
  brand = null,
  category = null,
  packaging = null,
  canonicalUnit = null,
}) {
  const attributes = semanticAttributes(`${name} ${nameCa || ''} ${category || ''}`);
  const activeAttributes = Object.entries(attributes)
    .filter(([, active]) => active)
    .map(([key]) => key);
  const content = [
    `nombre: ${name}`,
    nameCa && normalizeIdentityText(nameCa) !== normalizeIdentityText(name)
      ? `nombre catalán: ${nameCa}`
      : null,
    brand ? `marca: ${brand}` : null,
    category ? `categoría: ${category}` : null,
    packaging ? `formato: ${packaging}` : null,
    canonicalUnit ? `unidad: ${canonicalUnit}` : null,
    activeAttributes.length
      ? `atributos: ${activeAttributes.join(', ')}`
      : 'atributos: estándar o no indicados',
  ].filter(Boolean).join('; ');

  return {
    attributes,
    content,
    embeddingInputHash: hash(content),
  };
}

export function buildCatalogEmbeddingIdentity({
  name,
  brand = null,
  canonicalUnit = null,
  quantityBase = null,
  globalGtin = null,
  matchAttributes = null,
  published = true,
}) {
  const semanticName = semanticProductName(name);
  const normalizedBrand = normalizeIdentityText(brand) || null;
  const categoryFamily = stableCategoryFamily(name);
  const attributes = semanticAttributes(name);
  const activeAttributes = activeAttributeKeys(attributes);
  const content = [
    `nombre: ${semanticName}`,
    normalizedBrand ? `marca: ${normalizedBrand}` : null,
    categoryFamily ? `familia: ${categoryFamily}` : null,
    activeAttributes.length ? `atributos: ${activeAttributes.join(', ')}` : null,
  ].filter(Boolean).join('; ');

  return {
    attributes,
    categoryFamily,
    semanticIdentityContent: content,
    semanticIdentityHash: hash(content),
    matchMetadataHash: buildCatalogMatchMetadataHash({
      attributes: matchAttributes ?? attributes,
      canonicalUnit,
      categoryFamily,
      globalGtin,
      published,
      quantityBase,
    }),
    semanticName,
  };
}

export function buildCatalogEmbeddingProjectionV1({
  name,
  nameCa = null,
  brand = null,
  category = null,
  packaging = null,
  canonicalUnit = null,
  quantityBase = null,
  globalGtin = null,
  published = true,
}) {
  const embeddingInput = buildCatalogEmbeddingInputV1({
    name,
    nameCa,
    brand,
    category,
    packaging,
    canonicalUnit,
  });
  const identity = buildCatalogEmbeddingIdentity({
    name,
    brand,
    canonicalUnit,
    quantityBase,
    globalGtin,
    matchAttributes: embeddingInput.attributes,
    published,
  });
  return { embeddingInput, identity };
}
