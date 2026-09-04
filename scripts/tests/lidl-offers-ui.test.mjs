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
