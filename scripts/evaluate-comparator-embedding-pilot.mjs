#!/usr/bin/env node
// Evalúa scores vectoriales e híbridos contra las 400 etiquetas humanas.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const pairsInput = new URL('../supabase/experiments/comparator-evaluation-pairs.csv', import.meta.url);
const vectorsInput = new URL('../supabase/experiments/comparator-embedding-pilot-vectors.jsonl', import.meta.url);
const output = new URL('../supabase/experiments/comparator-embedding-pilot-metrics.json', import.meta.url);

function parseCsv(text) {
  const records = []; let record = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false; else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { record.push(field); field = ''; }
    else if (char === '\n') { record.push(field.replace(/\r$/, '')); records.push(record); record = []; field = ''; }
    else field += char;
  }
  if (field || record.length) { record.push(field); records.push(record); }
  const [columns, ...rows] = records.filter((row) => row.some((value) => value !== ''));
  return rows.map((row) => Object.fromEntries(columns.map((key, index) => [key, row[index] ?? ''])));
}

function cosine(left, right) {
  let dot = 0; let leftNorm = 0; let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i]; leftNorm += left[i] ** 2; rightNorm += right[i] ** 2;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const PREPARATION_RULE = /\b(al horno|hornead[oa]|asad[oa]|cocid[oa]|frit[oa]|rebozad[oa]|empanad[oa]|a la romana)\b/;
const preparationMismatch = (row) => PREPARATION_RULE.test(normalize(row.source_name)) !== PREPARATION_RULE.test(normalize(row.target_name));

if (!existsSync(vectorsInput)) throw new Error('Falta comparator-embedding-pilot-vectors.jsonl');
const pairs = parseCsv(readFileSync(pairsInput, 'utf8'));
const vectors = new Map(readFileSync(vectorsInput, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
  const row = JSON.parse(line); return [`${row.store}:${row.product_id}`, row.embedding];
}));
const scored = pairs.map((row) => {
  const source = vectors.get(`${row.source_store}:${row.source_product_id}`);
  const target = vectors.get(`${row.target_store}:${row.target_product_id}`);
  if (!source || !target) throw new Error(`Falta vector para ${row.source_store}:${row.source_product_id} o ${row.target_store}:${row.target_product_id}`);
  return { row, vectorScore: cosine(source, target), lexicalScore: Number(row.lexical_score || 0) };
});

function predict(item, vectorWeight, threshold, lexicalFloor = 0) {
  const { row, vectorScore, lexicalScore } = item;
  if (row.same_global_gtin === 'true') return 'identico';
  if (row.unit_compatible !== 'true' || row.blocking_attributes.trim() || preparationMismatch(row)) return 'no_relacionado';
  if (lexicalScore < lexicalFloor) return 'no_relacionado';
  const hybridScore = vectorWeight * vectorScore + (1 - vectorWeight) * lexicalScore;
  return hybridScore >= threshold ? 'comparable' : 'no_relacionado';
}

const candidates = [];
for (const vectorWeight of [0.25, 0.5, 0.75, 1]) {
  for (const lexicalFloor of [0, 0.45, 0.5, 0.55]) {
    for (let threshold = 0.3; threshold <= 0.95; threshold += 0.01) {
      const roundedThreshold = Number(threshold.toFixed(2));
      const predictions = scored.map((item) => ({ item, prediction: predict(item, vectorWeight, roundedThreshold, lexicalFloor) }));
      const comparable = predictions.filter(({ prediction }) => prediction === 'comparable');
      const trueComparable = comparable.filter(({ item }) => item.row.human_label === 'comparable').length;
      const totalHumanComparable = scored.filter(({ row }) => row.human_label === 'comparable').length;
      const correct = predictions.filter(({ item, prediction }) => item.row.human_label === prediction).length;
      candidates.push({
        vector_weight: vectorWeight,
        lexical_weight: 1 - vectorWeight,
        lexical_floor: lexicalFloor,
        threshold: roundedThreshold,
        accuracy: Number((correct / scored.length).toFixed(4)),
        comparable_precision: comparable.length ? Number((trueComparable / comparable.length).toFixed(4)) : null,
        comparable_recall: Number((trueComparable / totalHumanComparable).toFixed(4)),
        predicted_comparable: comparable.length,
      });
    }
  }
}
const eligible = candidates.filter((item) => item.comparable_precision >= 0.98);
const byCoverageThenAccuracy = (a, b) =>
  b.predicted_comparable - a.predicted_comparable || b.accuracy - a.accuracy || a.vector_weight - b.vector_weight
;
const selected = [...eligible].sort(byCoverageThenAccuracy)[0] ?? null;
const atBaselinePrecision = [...candidates].filter((item) => item.comparable_precision >= 0.992).sort(byCoverageThenAccuracy)[0] ?? null;
const conservative = [...candidates].filter((item) => item.comparable_precision === 1).sort(byCoverageThenAccuracy)[0] ?? null;

function errorRows(config) {
  if (!config) return [];
  return scored.map((item) => ({ item, prediction: predict(item, config.vector_weight, config.threshold, config.lexical_floor) }))
    .filter(({ item, prediction }) => prediction === 'comparable' && item.row.human_label !== 'comparable')
    .map(({ item }) => ({
      source: `${item.row.source_store}:${item.row.source_product_id}`,
      source_name: item.row.source_name,
      target: `${item.row.target_store}:${item.row.target_product_id}`,
      target_name: item.row.target_name,
      human_label: item.row.human_label,
      vector_score: Number(item.vectorScore.toFixed(4)),
      lexical_score: Number(item.lexicalScore.toFixed(4)),
      review_reason: item.row.review_reason,
    }));
}
const byLabel = {};
for (const label of ['identico', 'comparable', 'no_relacionado']) {
  const subset = scored.filter(({ row }) => row.human_label === label).map(({ vectorScore }) => vectorScore).sort((a, b) => a - b);
  byLabel[label] = {
    count: subset.length,
    min: Number(subset[0].toFixed(4)),
    median: Number(subset[Math.floor(subset.length / 2)].toFixed(4)),
    max: Number(subset.at(-1).toFixed(4)),
  };
}
const report = {
  generated_at: new Date().toISOString(),
  evaluated_pairs: scored.length,
  vector_dimensions: vectors.values().next().value?.length ?? null,
  selected,
  at_baseline_precision: atBaselinePrecision,
  conservative,
  recommended: conservative,
  baseline_reference: { comparable_precision: 0.992, predicted_comparable: 125, accuracy: 0.8625 },
  improves_coverage_at_quality_gate: Boolean(selected && selected.predicted_comparable > 125),
  improves_coverage_at_baseline_precision: Boolean(atBaselinePrecision && atBaselinePrecision.predicted_comparable > 125),
  improves_coverage_at_100_precision: Boolean(conservative && conservative.predicted_comparable > 125),
  selected_false_positives: errorRows(selected),
  baseline_precision_false_positives: errorRows(atBaselinePrecision),
  conservative_false_positives: errorRows(conservative),
  vector_score_by_human_label: byLabel,
  eligible_configurations: eligible.length,
};
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
