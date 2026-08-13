#!/usr/bin/env node
// Prototipo offline: reglas duras + GTIN + señales léxicas.
// No lee ni escribe Supabase y no modifica las etiquetas humanas.

import { readFileSync, writeFileSync } from 'node:fs';

const input = new URL('../supabase/experiments/comparator-evaluation-candidates.csv', import.meta.url);
const output = new URL('../supabase/experiments/comparator-hybrid-prototype-metrics.json', import.meta.url);

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

const rows = parseCsv(readFileSync(input, 'utf8')).filter((row) => row.human_label);
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function predict(row, threshold) {
  if (row.same_global_gtin === 'true') return 'identico';
  if (row.blocking_attributes.trim() || row.unit_compatible !== 'true') return 'no_relacionado';
  const lexical = Math.max(num(row.lexical_score), num(row.token_score), num(row.trigram_score));
  return lexical >= threshold ? 'comparable' : 'no_relacionado';
}

function metrics(threshold) {
  const predicted = rows.map((row) => ({ row, prediction: predict(row, threshold) }));
  const correct = predicted.filter(({ row, prediction }) => prediction === row.human_label).length;
  const comparable = predicted.filter(({ prediction }) => prediction === 'comparable');
  const noRelated = predicted.filter(({ prediction }) => prediction === 'no_relacionado');
  const exact = predicted.filter(({ row }) => row.same_global_gtin === 'true');
  const precision = (subset, label) => subset.length ? Number((subset.filter(({ row }) => row.human_label === label).length / subset.length).toFixed(4)) : null;
  return {
    threshold,
    accuracy: Number((correct / rows.length).toFixed(4)),
    comparable_precision: precision(comparable, 'comparable'),
    no_related_precision: precision(noRelated, 'no_relacionado'),
    exact_gtin_precision: precision(exact, 'identico'),
    predicted_comparable: comparable.length,
    predicted_no_related: noRelated.length,
  };
}

const thresholds = Array.from({ length: 15 }, (_, index) => Number((0.35 + index * 0.025).toFixed(3)));
const sweep = thresholds.map(metrics);
// La precisión de "no relacionado" no es una puerta de salida: el contrato
// permite falsos negativos, pero no equivalencias engañosas. Sí exigimos la
// precisión mínima de comparables y GTIN exacto.
const eligible = sweep.filter((item) => item.comparable_precision >= 0.98 && item.exact_gtin_precision === 1);
const best = [...eligible].sort((a, b) => b.accuracy - a.accuracy)[0] ?? null;
const report = {
  generated_at: new Date().toISOString(),
  version: 'hybrid_rules_lexical_v1',
  reviewed_rows: rows.length,
  gates: { complete_review: rows.length >= 300, exact_gtin_precision_100: sweep.every((item) => item.exact_gtin_precision === 1) },
  selected: best,
  threshold_sweep: sweep,
};
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
