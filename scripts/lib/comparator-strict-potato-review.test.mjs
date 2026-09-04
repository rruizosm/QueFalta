import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {datasetHash as hash} from './comparator-strict-dataset.mjs';
import {loadLabelCorpus, pointerValue} from './comparator-strict-corpus-labels.mjs';
import {POTATO_REVIEW_SPECS} from './comparator-strict-potato-review-specs.mjs';
import {buildPotatoReview, composePotatoPair, formatRelation, attributeRelation, REVIEW_ATTRIBUTES} from './comparator-strict-potato-review.mjs';
const input = loadLabelCorpus(), packet = buildPotatoReview(input);
const products = new Map(packet.products.map(p => [p.key, p]));
const product = key => products.get(key);
const pair = (a, b) => packet.annotations.find(p => p.left === a && p.right === b);
const single = grams => ({state: 'known', count: 1, each_mg: grams * 1000, total_mg: grams * 1000, nominal_mg: grams * 1000, evidence: []});
const partial = grams => ({state: 'unknown', count: null, each_mg: null, total_mg: null, nominal_mg: grams * 1000, evidence: []});

test('all 146 explicitly reviewed observations cover exactly 922 frozen-family sampling pairs', () => {
  assert.equal(packet.products.length, 146); assert.equal(packet.annotations.length, 922);
  assert.equal(POTATO_REVIEW_SPECS.frozen.length, 53);
  assert.equal(new Set(packet.products.map(p => p.key)).size, 146);
  assert.equal(new Set(packet.annotations.map(p => p.pair_id)).size, 922);
  assert.deepEqual(new Set(packet.annotations.map(p => p.pair_id)), new Set(input.pairs.filter(p => p.family === 'frozen_potatoes').map(p => hash([p.left,p.right]))));
});
test('citations bind original values, rows, observations and captures including taxonomy parents', () => {
  const originals = new Map(input.products.map(p => [p.key,p]));
  const files = new Map();
  for (const p of packet.products) {
    const o = originals.get(p.key);
    assert.equal(p.observation_id, o.observation_id); assert.equal(p.captured_at, o.captured_at);
    assert.deepEqual(p.source, o.source);
    for (const c of p.citations) {
      if (!files.has(c.source.file)) {
        const text = readFileSync(c.source.file, 'utf8');
        assert.equal(hash(text), c.source.sha256); files.set(c.source.file, JSON.parse(text));
      }
      assert.equal(c.product_key, p.key); assert.equal(c.observation_id, p.observation_id);
      const sourceRow = pointerValue(files.get(c.source.file), c.source.pointer);
      assert.deepEqual(c.value, c.kind === 'product_field' ? pointerValue(sourceRow,c.pointer) : sourceRow);
    }
    const {review_id, ...body} = p; assert.equal(hash(body), review_id);
  }
});
test('catalogue row mutation fails before fact reuse', () => {
  const changed = structuredClone(input);
  changed.products.find(p => p.key === 'mercadona:61405').raw.display_name = 'Another observation';
  assert.throws(() => buildPotatoReview(changed), /source_binding/);
});
test('no unreviewed extra product or missing spec is silently admitted', () => {
  const s = structuredClone(POTATO_REVIEW_SPECS); s.frozen.pop();
  assert.throws(() => buildPotatoReview(input,s), /exact_cohort_coverage/);
  const d = structuredClone(POTATO_REVIEW_SPECS); d.frozen[0].key = d.frozen[1].key;
  assert.throws(() => buildPotatoReview(input,d), /exact_cohort_coverage/);
});
test('manual nominal quantities must occur in the cited commercial fields', () => {
  const s = structuredClone(POTATO_REVIEW_SPECS); s.frozen[0].grams = 605;
  assert.throws(() => buildPotatoReview(input,s), /quantity_evidence/);
});
test('product-source review reuse rejects changed observations, edited facts or gold promotion', () => {
  const a = packet.annotations[0], l = product(a.left), r = product(a.right);
  for (const change of [p => {p.observation_id='new';}, p => {p.attributes.skin.value='without_skin';}, p => {p.gold_eligible=true;}]) {
    const bad = structuredClone(l); change(bad);
    assert.throws(() => composePotatoPair({left:a.left,right:a.right},bad,r,a.contexts[0].reference_clock), /review_reuse_binding/);
  }
});
test('wording in original denominations resolves title omissions, not other stores', () => {
  assert.equal(product('carrefour:768405799').attributes.cut_thickness.value, 'thin');
  assert.equal(product('carrefour:530014441').attributes.cut_thickness.value, 'thin');
  assert.equal(product('plusfresc:032787').attributes.cut_thickness.state, 'unknown');
  assert.equal(product('consum:844837').attributes.cut_thickness.state, 'unknown');
});
test('no invented correction of gueso/prefitas or automatic rustic/large thickness', () => {
  assert.equal(product('plusfresc:010985').attributes.cut_thickness.state, 'unknown');
  assert.equal(product('plusfresc:019865').attributes.preparation.state, 'unknown');
  assert.equal(product('carrefour:VC4AECOMM-615033').attributes.cut_thickness.state, 'unknown');
  assert.equal(product('carrefour:prod850177').attributes.cut_thickness.state, 'unknown');
});
test('explicit coating absence differs from omitted coating and from peanut-oil declaration', () => {
  assert.equal(product('plusfresc:032787').attributes.coating.value, 'absent_declared');
  assert.equal(product('plusfresc:032788').attributes.coating.state, 'unknown');
  assert.equal(product('plusfresc:019865').attributes.coating.state, 'unknown');
  assert.equal(product('plusfresc:032789').attributes.coating.value, 'present');
});
test('missing skin does not become without_skin and unmentioned claims remain unknown', () => {
  assert.equal(product('mercadona:61416').attributes.skin.state, 'unknown');
  assert.equal(product('carrefour:fprod1320006').attributes.skin.value, 'with_skin');
  assert.equal(product('carrefour:prod1161111').attributes.organic_claim.value, 'declared');
  assert.equal(product('carrefour:805525733').attributes.organic_claim.state, 'unknown');
});
test('both bravas references in Consum have different independently reviewed storage contexts', () => {
  assert.equal(product('consum:7393366').family, 'frozen_potatoes');
  assert.equal(product('consum:7443120').family, 'prepared_meal');
  assert.equal(product('consum:7443120').scope.state, 'incompatible');
});
test('frozen recipes with other ingredients are not admitted merely because they are frozen', () => {
  for (const key of ['carrefour:prod67219','carrefour:VC4AECOMM-560793','carrefour:VC4AECOMM-602198']) assert.equal(product(key).scope.state, 'incompatible');
});
test('shaped mash is distinct from cut potato; commercial nicknames remain unresolved', () => {
  assert.equal(product('carrefour:521033712').form, 'formed_potato');
  assert.equal(product('mercadona:61421').form, 'cut_potato');
  assert.equal(product('mercadona:19904').form, 'unknown');
  assert.equal(product('plusfresc:028522').form, 'unknown');
});
test('only eight explicitly evidenced single packages: no implicit count from bare mass', () => {
  assert.equal(packet.products.filter(p => p.format.state === 'known').length, 8);
  assert.equal(product('carrefour:530014441').format.count, null);
  assert.equal(product('consum:7057706').format.count, null);
  assert.equal(product('plusfresc:019865').format.count, 1);
  assert.equal(product('mercadona:61405').format.total_mg, 2000000);
});
test('one 2kg package rejects 1kg and 500g without multiplying purchases', () => {
  assert.equal(formatRelation(single(2000),partial(1000)).state, 'incompatible');
  assert.equal(formatRelation(single(2000),partial(500)).state, 'incompatible');
  assert.equal(formatRelation(partial(500),single(2000)).state, 'incompatible');
  assert.equal(pair('mercadona:61405','plusfresc:032789').product_labels.format.state, 'incompatible');
});
test('matching partial quantities and two role-ambiguous different quantities never prove complete format', () => {
  assert.equal(formatRelation(single(1000),partial(1000)).state, 'unknown');
  assert.equal(formatRelation(partial(1000),partial(1000)).state, 'unknown');
  assert.equal(formatRelation(partial(500),partial(1000)).state, 'unknown');
});
test('single package equality is exact and unsupported multipack use fails closed', () => {
  assert.equal(formatRelation(single(1000),single(1000)).state, 'compatible');
  assert.equal(formatRelation(single(1000),single(999)).state, 'incompatible');
  assert.throws(() => formatRelation({...single(1000),count:2},single(1000)), /single_format_contract/);
});
test('unknown and conflicting attributes remain independent of a negative on another attribute', () => {
  assert.equal(attributeRelation({state:'conflicting'},{state:'known',value:'x'}), 'conflicting');
  assert.equal(attributeRelation({state:'unknown'},{state:'known',value:'x'}), 'unknown');
  assert.equal(formatRelation({state:'conflicting',evidence:[]},single(1000)).state, 'conflicting');
  const a = pair('mercadona:61405','plusfresc:032789');
  assert.equal(a.product_labels.variants.state, 'unknown'); assert.equal(a.contexts[0].decision, 'rejected');
});
test('same EAN cannot override an evidenced format contradiction (synthetic contract)', () => {
  const l = structuredClone(product('mercadona:61405')), r = structuredClone(product('plusfresc:032789'));
  const value = l.citations.find(c => c.pointer === '/ean').value;
  r.citations.push({kind:'product_field',pointer:'/ean',value,id:'synthetic-same-ean-not-real'});
  delete r.review_id; r.review_id = hash(r);
  const a = composePotatoPair({left:l.key,right:r.key}, l,r,input.queries[0].reference_clock);
  assert.equal(a.product_labels.identity.state, 'conflicting'); assert.equal(a.contexts[0].decision, 'abstain');
});
test('all mandatory family attributes are retained even when unknown or gated outside scope', () => {
  for (const p of packet.products) {
    assert.deepEqual(Object.keys(p.attributes), REVIEW_ATTRIBUTES);
    assert.equal(p.full_product_equivalence_established, false);
    assert.ok(p.note.length > 40);
  }
  assert.equal(product('consum:7057706').inspected_fields.find(f => f.pointer === '/ingredients').presence, 'absent_in_projection');
  assert.equal(product('mercadona:61405').inspected_fields.find(f => f.pointer === '/ingredients').presence, 'null_in_projection');
});
test('commercial CP contexts stay unknown without TTL, new queries or approved savings', () => {
  for (const a of packet.annotations) {
    assert.deepEqual(a.contexts.map(c => c.postcode), ['08006','25001']);
    for (const c of a.contexts) for (const label of Object.values(c.labels)) assert.equal(label.state, 'unknown');
    assert.equal(a.gold_eligible, false); assert.equal(a.independent_review_completed, false);
    assert.equal(a.independent_pair_by_pair_review_completed, false);
  }
  assert.equal(packet.report.commercial_ttl_hours, null); assert.equal(packet.report.corpus_queries_unchanged, 1200);
  assert.equal(packet.report.eligible_savings, 0);
});
test('E09 is overlap not a new pair; no old drafts promoted and all tasks remain honestly open', () => {
  assert.equal(packet.report.union_first_annotated_corpus_pairs, 928);
  assert.equal(packet.report.corpus_pairs_pending_first_annotation, 5072);
  assert.equal(packet.report.overlapping_previous_annotations.length, 1);
  assert.deepEqual(packet.report.overlapping_previous_annotations[0].changed_product_dimensions, []);
  assert.equal(packet.report.overlapping_previous_annotations[0].decision_changed, false);
  for (const k of ['CE201_complete','CE202_complete','CE203_complete','G2_pass']) assert.equal(packet.report[k], false);
});
