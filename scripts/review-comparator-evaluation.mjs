#!/usr/bin/env node
// Revisión interactiva de los candidatos del comparador.
// Guarda tras cada decisión y regenera el conjunto de referencia etiquetado.

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const CANDIDATES = new URL('../supabase/experiments/comparator-evaluation-candidates.csv', import.meta.url);
const GOLD = new URL('../supabase/experiments/comparator-evaluation-pairs.csv', import.meta.url);
const TEMP = new URL('../supabase/experiments/comparator-evaluation-candidates.csv.tmp', import.meta.url);
const LABELS = { i: 'identico', c: 'comparable', s: 'sustituto', n: 'no_relacionado' };

function parseCsv(text) {
  const records = [];
  let record = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { record.push(field); field = ''; }
    else if (char === '\n') { record.push(field.replace(/\r$/, '')); records.push(record); record = []; field = ''; }
    else field += char;
  }
  if (field || record.length) { record.push(field); records.push(record); }
  const [columns, ...rows] = records.filter((row) => row.some((value) => value !== ''));
  return { columns, rows: rows.map((row) => Object.fromEntries(columns.map((key, index) => [key, row[index] ?? '']))) };
}

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const serialize = (columns, rows) => `${columns.join(',')}\n${rows.map((row) => columns.map((key) => csvCell(row[key])).join(',')).join('\n')}${rows.length ? '\n' : ''}`;

function persist(columns, rows) {
  writeFileSync(TEMP, serialize(columns, rows), 'utf8');
  renameSync(TEMP, CANDIDATES);
  writeFileSync(GOLD, serialize(columns, rows.filter((row) => row.human_label)), 'utf8');
}

const { columns, rows } = parseCsv(readFileSync(CANDIDATES, 'utf8'));
const needsReview = (row) => !row.human_label
  || (row.same_global_gtin === 'true' && row.human_label !== 'identico');
const pending = rows.filter(needsReview);
if (!pending.length) {
  console.log(`Revisión completa: ${rows.length}/${rows.length} pares etiquetados.`);
  process.exit(0);
}

const rl = createInterface({ input, output });
const reviewer = (process.env.REVIEWER || await rl.question('Revisor: ')).trim();
if (!reviewer) { rl.close(); throw new Error('El nombre del revisor es obligatorio'); }

console.log(`Pendientes o conflictos: ${pending.length}. i=idéntico, c=comparable, s=sustituto, n=no relacionado, p=pasar, q=salir.`);
for (const row of pending) {
  console.log('\n────────────────────────────────────────────────────────');
  console.log(`[${row.candidate_bucket}] ${row.source_store} → ${row.target_store}`);
  console.log(`ORIGEN : ${row.source_name} | ${row.source_quantity || '?'} | ${row.source_unit || '?'} | GTIN ${row.source_gtin || '—'}`);
  console.log(`DESTINO: ${row.target_name} | ${row.target_quantity || '?'} | ${row.target_unit || '?'} | GTIN ${row.target_gtin || '—'}`);
  console.log(`Señales: lexical=${row.lexical_score}; unidad=${row.unit_compatible}; bloqueos=${row.blocking_attributes || '—'}`);
  console.log(`Sugerencia automática: ${row.automated_suggestion} — ${row.automated_reason}`);
  if (row.human_label) console.log(`Etiqueta actual en conflicto: ${row.human_label} — ${row.review_reason}`);

  const answer = (await rl.question('Etiqueta [i/c/s/n/p/q]: ')).trim().toLowerCase();
  if (answer === 'q') break;
  if (answer === 'p' || !LABELS[answer]) continue;
  const reason = (await rl.question('Motivo breve: ')).trim();
  if (!reason) { console.log('Sin motivo no se guarda la decisión.'); continue; }
  row.human_label = LABELS[answer];
  row.review_reason = reason;
  row.reviewer = reviewer;
  row.reviewed_at = new Date().toISOString();
  persist(columns, rows);
  console.log(`Guardado: ${row.human_label}`);
}
rl.close();

const reviewed = rows.filter((row) => row.human_label).length;
console.log(`Revisión guardada: ${reviewed}/${rows.length}.`);
