import {test} from 'node:test';
import assert from 'node:assert/strict';
import {datasetHash} from './comparator-strict-dataset.mjs';
import {nominalQuantity, pointerValue, productLabelEvidence, buildCorpusLabelDrafts, validateCorpusDrafts, buildEditorialAnnotations} from './comparator-strict-corpus-labels.mjs';

const product = (key, raw) => ({key, store: key.split(':')[0], raw, captured_at: '2026-09-03T10:00:00Z', observation_id: datasetHash([key, raw]), source: {file: 'fixture.json', sha256: datasetHash('fixture'), pointer: '/rows/0', raw_sha256: datasetHash(raw)}, sampling: {family: 'yogurt'}});
const pack = (n, each, extra = {}) => ({display_name: `Yogur natural ${n} x ${each} g`, published: true, unit_price: 2, ...extra});
const inputOf = (a, b) => ({products: [a, b], pairs: [{left: a.key, right: b.key, cohort: 'confirmatory', family: 'yogurt', challenge_reason: null}], locations: [], queries: [{origin: a.key, reference_clock: '2026-09-03T10:45:00Z'}], manifest_sha256: datasetHash('fixture')});
const draft = (a, b) => buildCorpusLabelDrafts(inputOf(product('a:001', a), product('b:002', b))).annotations[0];
test('nominal quantities use exact decimal arithmetic and canonical units', () => {
  assert.deepEqual(nominalQuantity('0,125', 'kg'), nominalQuantity(125, 'g'));
  assert.deepEqual(nominalQuantity(1, 'l'), nominalQuantity(1000, 'ml'));
  assert.deepEqual(nominalQuantity(50, 'cl'), nominalQuantity(500, 'ml'));
  for (const n of [-1, 0, Infinity, 'NaN', '2e3', '1.0000001', '9007199254740992']) assert.equal(nominalQuantity(n, 'kg'), null);
});
test('JSON pointers preserve zero-prefixed keys and reject absent/inherited/invalid paths', () => {
  assert.equal(pointerValue({'001': {'a/b': 2}}, '/001/a~1b'), 2);
  assert.throws(() => pointerValue({}, '/toString'), /missing_pointer/);
  assert.throws(() => pointerValue({}, '/__proto__'), /missing_pointer/);
  assert.throws(() => pointerValue({}, '/bad~2'), /pointer_escape/);
});
test('bare total does not imply count one, and count+amount does not imply division', () => {
  const p = productLabelEvidence(product('a:1', {display_name: 'Yogur 750 g'})); assert.equal(p.format.state, 'unknown'); assert.equal(p.format.components, null);
  const q = productLabelEvidence(product('a:1', {display_name: 'Yogur 6 unidades 750 g'})); assert.equal(q.format.components.count, 6); assert.equal(q.format.components.each, null); assert.equal(q.format.components.total, null);
});
test('explicit pack 6×125 is only a positive format, never an equivalent or saving', () => {
  const a = draft(pack(6, 125), pack(6, '0,125', {display_name: 'Yogur natural 6 x 0,125 kg'}));
  assert.equal(a.product_labels.format.state, 'compatible'); assert.equal(a.product_labels.variants.state, 'unknown'); assert.equal(a.contexts[0].decision, 'abstain'); assert.equal(a.gold_eligible, false);
});
for (const [n, each] of [[3, 250], [4, 125], [6, 124], [6, 120]]) test(`6×125 differs from ${n}×${each} without tolerance`, () => {
  assert.equal(draft(pack(6, 125), pack(n, each)).product_labels.format.state, 'incompatible');
});
test('one 2kg bag and two 1kg bags differ despite same total', () => {
  assert.equal(draft({display_name: 'Patatas bolsa de 2 kg'}, {display_name: 'Patatas 2 x 1 kg'}).product_labels.format.state, 'incompatible');
});
test('same EAN cannot override a format mismatch', () => {
  const a = draft(pack(6, 125, {ean: '000123'}), pack(4, 125, {ean: '000123'})); assert.equal(a.product_labels.identity.state, 'conflicting'); assert.equal(a.contexts[0].decision, 'abstain');
});
test('unselected retailer service options keep format unknown', () => {
  const a = draft(pack(6, 125), pack(6, 125, {raw: {has_format: true, formats: [{options: [{id: 'unit'}, {id: 'pack'}]}]}})); assert.equal(a.product_labels.format.state, 'unknown');
});
test('unverified selling method is not automatically variable-weight exclusion', () => {
  const p = productLabelEvidence(product('a:1', {display_name: 'Yogur', raw: {price_instructions: {selling_method: 9, approx_size: false}}})); assert.equal(p.exclusion, null); assert.equal(p.format.state, 'unknown');
});
test('4 units 125g may mean per-unit, not a fabricated 125g total conflict', () => {
  const p = productLabelEvidence(product('a:1', {display_name: 'Yogur 4 unidades 125 g', description: 'Yogur 4x125g'})); assert.equal(p.format.state, 'known'); assert.equal(p.format.signature[3], 500000);
});
test('ambiguous 550g with 4×125 is unresolved rather than silently replaced', () => {
  const p = productLabelEvidence(product('a:1', {display_name: 'Yogur 4 uds. 550 g', description: 'Yogur 4x125g'})); assert.equal(p.format.state, 'unknown'); assert.ok(p.flags.includes('unresolved_quantity_role'));
});
test('dual mass/volume declarations are not declared contradictory without density', () => {
  const p = productLabelEvidence(product('a:1', {display_name: 'Yogur envase 940 ml', description: 'Yogur botella 750 g'})); assert.equal(p.format.state, 'unknown'); assert.ok(p.flags.includes('unresolved_mass_volume_evidence'));
  assert.equal(draft({display_name: 'Yogur bote 1 kg'}, {display_name: 'Yogur botella 1 l'}).product_labels.format.state, 'unknown');
});
test('different explicit counts in same product are conflicting', () => {
  const p = productLabelEvidence(product('a:1', {display_name: 'Yogur 6 unidades 600 g', description: 'Yogur 8x96ml'})); assert.equal(p.format.state, 'conflicting');
});
test('assorted packs require composition review even with equal nominal amounts', () => {
  assert.equal(draft({display_name: 'Yogur sabores variados 6x125g'}, pack(6, 125)).product_labels.format.state, 'unknown');
});
test('natural is not no-added-sugar and negation is preserved', () => {
  assert.equal(draft(pack(6, 125), pack(6, 125, {display_name: 'Yogur azucarado 6x125g'})).product_labels.variants.state, 'unknown');
  assert.equal(draft({display_name: 'Yogur sin azúcares añadidos 6x125g'}, {display_name: 'Yogur con azúcar de caña 6x125g'}).product_labels.variants.state, 'incompatible');
  assert.equal(productLabelEvidence(product('a:1', {display_name: 'Yogur sin azúcar'})).attributes.added_sugar.state, 'unknown');
});
test('yogur griego and griego yogur preserve the same literal subtype only', () => {
  const values = ['Yogur griego natural', 'Griego yogur natural'].map(display_name => productLabelEvidence(product('a:1', {display_name})).attributes.greek_style.value); assert.deepEqual(values, ['greek', 'greek']);
});
test('sweeteners, sugar and stock stay independent', () => {
  const p = productLabelEvidence(product('a:1', {display_name: 'Yogur edulcorado sin azúcares añadidos', published: true})); assert.equal(p.attributes.sweeteners.value, 'present_declared'); assert.equal(p.attributes.added_sugar.value, 'no_added_sugar_claim');
  const a = draft(pack(6, 125, {available: true, unit_price: 10}), pack(6, 125, {available: true, unit_price: 1})); for (const d of ['price', 'location', 'availability', 'catalog']) assert.equal(a.contexts[0].labels[d].state, 'unknown');
});
test('changed citations, dates, labels or gold flags cannot pass as reproducible draft', () => {
  const input = inputOf(product('a:1', pack(6, 125)), product('b:2', pack(4, 125)));
  const original = buildCorpusLabelDrafts(input); assert.equal(validateCorpusDrafts(original, input), true);
  for (const mutate of [p => { p.products[0].citations[0].value = 'forged'; }, p => { p.products[0].captured_at = '2030-01-01'; }, p => { p.annotations[0].gold_eligible = true; }, p => { p.annotations[0].contexts[0].decision = 'eligible_saving'; }]) { const copy = structuredClone(original); mutate(copy); assert.throws(() => validateCorpusDrafts(copy, input)); }
});
test('editorial specs are separate, source-bound and reject one-sided matches/duplicates', () => {
  const input = inputOf(product('a:1', pack(6, 125)), product('b:2', pack(6, 125)));
  const spec = {id: 'E1', products: ['a:1', 'b:2'], reason: 'Solo formato verificado; falta evidencia comercial y de variantes.', tags: ['format'], assertions: {format: {state: 'compatible', reason: 'Ambas fuentes declaran exactamente seis unidades de 125 gramos.', refs: [['a:1', '/display_name'], ['b:2', '/display_name']]}}, expected: 'abstain'};
  const [a] = buildEditorialAnnotations([spec], input); assert.equal(a.authorship, 'assistant_editorial_first_annotation'); assert.equal(a.gold_eligible, false);
  assert.throws(() => buildEditorialAnnotations([spec, spec], input), /duplicate/);
  const bad = structuredClone(spec); bad.assertions.format.refs.pop(); assert.throws(() => buildEditorialAnnotations([bad], input), /bilateral/);
});
