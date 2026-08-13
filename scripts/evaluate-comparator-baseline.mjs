#!/usr/bin/env node
// Calcula métricas del baseline sobre las filas con human_label.
// No rellena ni corrige etiquetas; señala conflictos de contrato.

import { readFileSync, writeFileSync } from 'node:fs';

const input = new URL('../supabase/experiments/comparator-evaluation-candidates.csv', import.meta.url);
const output = new URL('../supabase/experiments/comparator-baseline-metrics.json', import.meta.url);

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

const rows = parseCsv(readFileSync(input, 'utf8'));
const reviewed = rows.filter((row) => row.human_label);
const pending = rows.filter((row) => !row.human_label);
const labels = ['identico', 'comparable', 'sustituto', 'no_relacionado'];
const invalid = reviewed.filter((row) => !labels.includes(row.human_label));
const gtinConflicts = reviewed.filter((row) => row.same_global_gtin === 'true' && row.human_label !== 'identico');
const comparableRows = reviewed.filter((row) => row.automated_suggestion === 'comparable');
const noRelatedRows = reviewed.filter((row) => row.automated_suggestion === 'no_relacionado');
const exactRows = reviewed.filter((row) => row.same_global_gtin === 'true');
const correct = reviewed.filter((row) => row.automated_suggestion === row.human_label).length;
const precision = (subset, label) => subset.length ? Number((subset.filter((row) => row.human_label === label).length / subset.length).toFixed(4)) : null;
const countBy = (field) => Object.fromEntries([...new Set(reviewed.map((row) => row[field] || ''))].sort().map((value) => [value, reviewed.filter((row) => (row[field] || '') === value).length]));
const confusion = {};
for (const row of reviewed) {
  const key = `${row.automated_suggestion || 'sin_sugerencia'} -> ${row.human_label}`;
  confusion[key] = (confusion[key] || 0) + 1;
}

const report = {
  generated_at: new Date().toISOString(), total_rows: rows.length,
  reviewed_rows: reviewed.length, pending_rows: pending.length,
  invalid_labels: invalid.length, contract_conflicts_same_gtin: gtinConflicts.length,
  automated_accuracy: reviewed.length ? Number((correct / reviewed.length).toFixed(4)) : null,
  precision: {
    exact_gtin_as_identico: precision(exactRows, 'identico'),
    automated_comparable: precision(comparableRows, 'comparable'),
    automated_no_relacionado: precision(noRelatedRows, 'no_relacionado'),
  },
  by_human_label: countBy('human_label'), confusion,
  gates: {
    enough_rows: reviewed.length >= 300,
    complete_review: pending.length === 0,
    no_invalid_labels: invalid.length === 0,
    no_gtin_conflicts: gtinConflicts.length === 0,
    exact_gtin_precision_100: exactRows.length > 0 && exactRows.every((row) => row.human_label === 'identico'),
  },
  conflict_keys: gtinConflicts.map((row) => ({
    source: `${row.source_store}:${row.source_product_id}`,
    target: `${row.target_store}:${row.target_product_id}`,
    human_label: row.human_label,
    review_reason: row.review_reason,
  })),
};
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
