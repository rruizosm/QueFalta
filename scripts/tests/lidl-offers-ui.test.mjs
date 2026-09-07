import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const lidlModal = readFileSync(new URL('../../src/components/LidlProductModal.tsx', import.meta.url), 'utf8');
const sharedModal = readFileSync(new URL('../../src/components/AldiProductModal.tsx', import.meta.url), 'utf8');

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

test('la ficha Lidl muestra el precio anterior tachado solo para una rebaja directa', () => {
  assert.match(sharedModal, /lidlPromoBasePrice > product\.unitPrice/);
  assert.match(sharedModal, /promotionPreviousPrice=\{promotionPreviousPrice\}/);
  assert.match(sharedModal, /priceTone=\{promotionPreviousPrice \? 'down' : 'default'\}/);
});
