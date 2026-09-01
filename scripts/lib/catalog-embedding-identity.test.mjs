import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildCatalogEmbeddingInputV1,
  buildCatalogEmbeddingIdentity,
  buildCatalogEmbeddingProjectionV1,
  semanticProductName,
  stableCategoryFamily,
} from './catalog-embedding-identity.mjs';

const identity = (overrides = {}) => buildCatalogEmbeddingIdentity({
  name: 'Leche entera 1 L botella',
  brand: 'La Granja',
  canonicalUnit: 'l',
  quantityBase: 1,
  globalGtin: '8412345678905',
  published: true,
  ...overrides,
});

test('el constructor v1 conserva exactamente el texto y hash enviados al modelo', () => {
  const result = buildCatalogEmbeddingInputV1({
    name: 'Leche entera 1 L botella',
    nameCa: 'Llet sencera 1 L ampolla',
    brand: 'La Granja',
    category: 'Lácteos',
    packaging: 'Botella 1 L',
    canonicalUnit: 'l',
  });
  assert.equal(
    result.content,
    'nombre: Leche entera 1 L botella; nombre catalán: Llet sencera 1 L ampolla; marca: La Granja; categoría: Lácteos; formato: Botella 1 L; unidad: l; atributos: entera',
  );
  assert.equal(
    result.embeddingInputHash,
    createHash('sha256').update(result.content).digest('hex'),
  );
  assert.equal(
    result.embeddingInputHash,
    '6a3f94644c9aabbf87f14d2aeed1c81650b891ad14e181a7625f1a82a42d9237',
  );
});

test('precio, imagen, promociones, disponibilidad, timestamps y categoría cruda no alteran el input', () => {
  const baseline = identity({ category: 'Lácteos' });
  const commercialChange = identity({
    category: 'Refrigerados > Leches',
    price: 9.99,
    imageUrl: 'https://example.invalid/new.jpg',
    promotion: '2x1',
    available: false,
    updatedAt: '2030-01-01T00:00:00Z',
  });
  assert.equal(commercialChange.semanticIdentityHash, baseline.semanticIdentityHash);
  assert.equal(commercialChange.matchMetadataHash, baseline.matchMetadataHash);
});

test('la proyección v1 detecta categoría/formato sin convertirlos en cambio semántico', () => {
  const baseline = buildCatalogEmbeddingProjectionV1({
    name: 'Leche entera 1 L',
    brand: 'La Granja',
    category: 'Lácteos',
    packaging: 'Botella',
    canonicalUnit: 'l',
    quantityBase: 1,
  });
  const commercialRename = buildCatalogEmbeddingProjectionV1({
    name: 'Leche entera 1 L',
    brand: 'La Granja',
    category: 'Refrigerados > Leches',
    packaging: 'Brik',
    canonicalUnit: 'l',
    quantityBase: 1,
  });
  assert.notEqual(
    commercialRename.embeddingInput.embeddingInputHash,
    baseline.embeddingInput.embeddingInputHash,
  );
  assert.equal(
    commercialRename.identity.semanticIdentityHash,
    baseline.identity.semanticIdentityHash,
  );
  assert.equal(
    commercialRename.identity.matchMetadataHash,
    baseline.identity.matchMetadataHash,
  );
});

test('formato y cantidad son metadata: no regeneran el vector pero invalidan el matching', () => {
  const oneLitre = identity();
  const twoLitres = identity({
    name: 'Leche entera 2 L brik',
    quantityBase: 2,
  });
  assert.equal(twoLitres.semanticIdentityHash, oneLitre.semanticIdentityHash);
  assert.notEqual(twoLitres.matchMetadataHash, oneLitre.matchMetadataHash);
});

test('GTIN, unidad y publicación solo cambian match_metadata_hash', () => {
  const baseline = identity();
  for (const change of [
    { globalGtin: '8422222222222' },
    { canonicalUnit: 'ud' },
    { published: false },
  ]) {
    const changed = identity(change);
    assert.equal(changed.semanticIdentityHash, baseline.semanticIdentityHash);
    assert.notEqual(changed.matchMetadataHash, baseline.matchMetadataHash);
  }
});

test('match_metadata_hash representa los atributos realmente almacenados', () => {
  const baseline = identity({ matchAttributes: { bio: false, sin_gluten: false } });
  const changed = identity({ matchAttributes: { bio: true, sin_gluten: false } });
  assert.equal(changed.semanticIdentityHash, baseline.semanticIdentityHash);
  assert.notEqual(changed.matchMetadataHash, baseline.matchMetadataHash);
});

test('la familia se deriva del nombre y permanece estable frente al árbol de categorías', () => {
  assert.equal(stableCategoryFamily('Yogur griego natural'), 'yogurt');
  assert.equal(stableCategoryFamily('Agua mineral sin gas'), 'water');
  assert.equal(stableCategoryFamily('Agua de colonia infantil'), null);
  assert.equal(semanticProductName('Yogur (pack ahorro) 4 x 125 g'), 'yogur');
});

test('los paréntesis de formato no alteran la identidad semántica', () => {
  assert.equal(
    identity({ name: 'Yogur (pack ahorro) 4 x 125 g' }).semanticIdentityHash,
    identity({ name: 'Yogur 125 g' }).semanticIdentityHash,
  );
  assert.equal(
    identity({ name: 'Yogur (formato familiar) 1 kg' }).semanticIdentityHash,
    identity({ name: 'Yogur 125 g' }).semanticIdentityHash,
  );
});

test('conserva variantes semánticas escritas entre paréntesis', () => {
  assert.notEqual(
    identity({ name: 'Yogur (fresa) 125 g' }).semanticIdentityHash,
    identity({ name: 'Yogur (limón) 125 g' }).semanticIdentityHash,
  );
  assert.notEqual(
    identity({ name: 'Café (descafeinado) 250 g' }).semanticIdentityHash,
    identity({ name: 'Café 250 g' }).semanticIdentityHash,
  );
  assert.notEqual(
    identity({ name: 'Cerveza (sin alcohol) 33 cl' }).semanticIdentityHash,
    identity({ name: 'Cerveza 33 cl' }).semanticIdentityHash,
  );
});

test('no elimina palabras ambiguas que también pueden ser marcas', () => {
  assert.notEqual(
    identity({ name: 'Crema de día 50 ml' }).semanticIdentityHash,
    identity({ name: 'Crema de noche 50 ml' }).semanticIdentityHash,
  );
  assert.match(semanticProductName('Producte de consum diari'), /\bconsum\b/);
  assert.match(identity({ name: 'Leche entera 1 L', brand: 'Consum' }).semanticIdentityContent, /marca: consum/);
});

test('un cambio semántico real modifica el input', () => {
  assert.notEqual(
    identity({ name: 'Leche entera 1 L botella' }).semanticIdentityHash,
    identity({ name: 'Leche sin lactosa 1 L botella' }).semanticIdentityHash,
  );
});
