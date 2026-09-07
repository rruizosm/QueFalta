import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const lidlModal = readFileSync(new URL('../../src/components/LidlProductModal.tsx', import.meta.url), 'utf8');
const sharedModal = readFileSync(new URL('../../src/components/AldiProductModal.tsx', import.meta.url), 'utf8');
const gridCard = readFileSync(new URL('../../src/components/ProductGridCard.tsx', import.meta.url), 'utf8');
const detailImage = readFileSync(new URL('../../src/components/ProductDetailImage.tsx', import.meta.url), 'utf8');
const productImage = readFileSync(new URL('../../src/components/ProductImage.tsx', import.meta.url), 'utf8');

test('la oferta Lidl no se superpone como etiqueta en la imagen', () => {
  assert.doesNotMatch(lidlModal, /badgeLabel=.*promoName/);
  assert.match(lidlModal, /<AldiProductModal \{\.\.\.props\} store="lidl" \/>/);
});

test('la ficha Lidl usa el bloque promocional de Bonpreu', () => {
  assert.match(sharedModal, /const lidlPromotion = store === 'lidl'/);
  assert.match(sharedModal, /<View style=\{styles\.promoBox\}>/);
  assert.match(sharedModal, /<View style=\{styles\.promoPill\}>/);
  assert.match(sharedModal, /backgroundColor: colors\.accentLight/);
  assert.match(sharedModal, /borderColor: colors\.accentMid/);
});

test('la oferta Lidl de la ficha usa el mismo diseño y tipografía que Carrefour', () => {
  assert.doesNotMatch(sharedModal, /maxWidth: '68%'/);
  assert.match(sharedModal, /promoBox: \{[\s\S]*?marginTop: 14, padding: 12, gap: 8/);
  assert.match(sharedModal, /backgroundColor: colors\.accent, paddingHorizontal: 8, paddingVertical: 4/);
  assert.match(sharedModal, /promoPillText: \{ fontSize: 12/);
  assert.match(sharedModal, /promoText: \{ fontSize: 12\.5[\s\S]*?lineHeight: 18/);
  assert.match(sharedModal, /<Ionicons name="pricetags" size=\{12\}/);
});

test('las ofertas de todos los supermercados son compactas en cuadrícula', () => {
  assert.match(gridCard, /offerTag: \{[\s\S]*?maxWidth: '68%'/);
  assert.match(gridCard, /<Ionicons name="pricetag" size=\{8\}/);
  assert.match(gridCard, /offerTagText: \{[\s\S]*?fontSize: 8/);
  assert.doesNotMatch(gridCard, /offerTagWide|compactOfferTag/);
});

test('la ficha Lidl no repite una condición de oferta idéntica', () => {
  assert.match(sharedModal, /distinctPromotionText/);
  assert.match(sharedModal, /normalize\(text\) === normalize\(name\) \? null : text/);
});

test('la ficha Lidl identifica las condiciones y la vigencia de la oferta', () => {
  assert.match(sharedModal, /t\('product\.offerConditions'\)/);
  assert.match(sharedModal, /t\('product\.offerValidity'\)/);
  assert.match(sharedModal, /condition: distinctPromotionText\(product\.promoName, product\.promoText\)/);
  assert.doesNotMatch(sharedModal, /condition: distinctPromotionText\([^\n]+\) \?\? product\.promoName/);
  assert.match(sharedModal, /\{lidlPromotion\.condition \? \(/);
  assert.match(sharedModal, /offerValidityRange/);
  assert.match(sharedModal, /offerValidityFrom/);
  assert.match(sharedModal, /offerValidityUntil/);
});

test('la ficha Lidl identifica las ofertas exclusivas para Lidl Plus', () => {
  assert.match(sharedModal, /'isLidlPlusOffer' in product/);
  assert.match(sharedModal, /product\.isLidlPlusOffer/);
  assert.match(sharedModal, /t\('product\.offerRequirement'\)/);
  assert.match(sharedModal, /t\('product\.lidlPlusRequirement'\)/);
  assert.match(sharedModal, /`\$\{product\.promoName\} · Lidl Plus`/);
});

test('la ficha Lidl muestra el precio anterior tachado solo para una rebaja directa', () => {
  assert.match(sharedModal, /lidlPromoBasePrice > product\.unitPrice/);
  assert.match(sharedModal, /promotionPreviousPrice=\{promotionPreviousPrice\}/);
  assert.match(sharedModal, /priceTone=\{promotionPreviousPrice \? 'down' : 'default'\}/);
});

test('la ficha Lidl explica y lamenta que el proveedor no publique una imagen', () => {
  assert.match(sharedModal, /emptyMessage=\{store === 'lidl' \? t\('product\.lidlImageUnavailable'\) : undefined\}/);
  assert.match(detailImage, /const hasUsableImage = Boolean\(uri && productImageSource\(uri\)\)/);
  assert.match(detailImage, /<ProductImage uri=\{uri\}[\s\S]*?fallback=\{fallback\}/);
  assert.match(productImage, /failed && fallback \? fallback/);
});
