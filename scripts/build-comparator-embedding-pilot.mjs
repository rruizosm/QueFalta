#!/usr/bin/env node
// Prepara el corpus pequeño para evaluar embeddings sobre el gold set.
// No llama a APIs externas, no genera vectores y no modifica Supabase.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const input = new URL('../supabase/experiments/comparator-evaluation-pairs.csv', import.meta.url);
const output = new URL('../supabase/experiments/comparator-embedding-pilot.jsonl', import.meta.url);
const summaryOutput = new URL('../supabase/experiments/comparator-embedding-pilot-summary.json', import.meta.url);

const MODEL = 'text-embedding-3-small';
const DIMENSIONS = 512;
const CONTENT_VERSION = 'catalog_embedding_content_v1';
const ATTRIBUTE_RULES = [
  ['sin_lactosa', /\bsin lactosa\b/],
  ['vegetal', /\b(vegetal|avena|soja|almendra)\b/],
  ['bio', /\b(bio|ecologic[oa])\b/],
  ['infantil', /\b(infantil|bebe)\b/],
  ['sin_gluten', /\bsin gluten\b/],
  ['sin_azucar', /\bsin azucar\b/],
  ['proteina', /\b(proteina|proteico)\b/],
  ['desnatada', /\bdesnatad[oa]\b/],
  ['semidesnatada', /\bsemidesnatad[oa]\b/],
  ['entera', /\benter[oa]\b/],
  ['preparado', /\b(al horno|hornead[oa]|asad[oa]|cocid[oa]|frit[oa]|rebozad[oa]|empanad[oa]|a la romana)\b/],
];

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

const normalize = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\s+/g, ' ').trim();

function extractAttributes(name) {
  const normalized = normalize(name);
  return Object.fromEntries(ATTRIBUTE_RULES.map(([key, rule]) => [key, rule.test(normalized)]));
}

function quantityBase(quantity, canonicalUnit) {
  if (!quantity || !canonicalUnit) return null;
  const normalized = normalize(quantity).replace(',', '.');
  const multi = normalized.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|gr|ml|cl|l|ud|uds|u)\b/);
  const simple = normalized.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|ml|cl|l|ud|uds|u)\b/);
  const match = multi || simple;
  if (!match) return null;
  const count = multi ? Number(match[1]) : 1;
  const amount = Number(match[multi ? 2 : 1]);
  const unit = match[multi ? 3 : 2];
  const total = count * amount;
  if (canonicalUnit === 'kg') return ['g', 'gr'].includes(unit) ? total / 1000 : unit === 'kg' ? total : null;
  if (canonicalUnit === 'l') return unit === 'ml' ? total / 1000 : unit === 'cl' ? total / 100 : unit === 'l' ? total : null;
  if (canonicalUnit === 'ud') return ['ud', 'uds', 'u'].includes(unit) ? total : null;
  return null;
}

function makeProduct(row, side) {
  const name = row[`${side}_name`].trim();
  const brand = row[`${side}_brand`].trim() || null;
  const canonicalUnit = row[`${side}_unit`].trim() || null;
  const quantity = row[`${side}_quantity`].trim() || null;
  const attributes = extractAttributes(name);
  const activeAttributes = Object.entries(attributes).filter(([, value]) => value).map(([key]) => key);
  const content = [
    `nombre: ${name}`,
    brand ? `marca: ${brand}` : null,
    canonicalUnit ? `unidad: ${canonicalUnit}` : null,
    quantity ? `cantidad: ${quantity}` : null,
    activeAttributes.length ? `atributos: ${activeAttributes.join(', ')}` : 'atributos: estándar o no indicados',
  ].filter(Boolean).join('; ');
  return {
    store: row[`${side}_store`],
    product_id: row[`${side}_product_id`],
    display_name: name,
    brand,
    category: null,
    canonical_unit: canonicalUnit,
    quantity_base: quantityBase(quantity, canonicalUnit),
    global_gtin: row[`${side}_gtin`].trim() || null,
    attributes,
    content,
    content_hash: createHash('sha256').update(content).digest('hex'),
    content_version: CONTENT_VERSION,
    model: MODEL,
    dimensions: DIMENSIONS,
  };
}

const rows = parseCsv(readFileSync(input, 'utf8'));
const products = new Map();
for (const row of rows) {
  for (const side of ['source', 'target']) {
    const product = makeProduct(row, side);
    products.set(`${product.store}:${product.product_id}`, product);
  }
}
const corpus = [...products.values()].sort((a, b) => `${a.store}:${a.product_id}`.localeCompare(`${b.store}:${b.product_id}`));
writeFileSync(output, `${corpus.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
const summary = {
  generated_at: new Date().toISOString(),
  reviewed_pairs: rows.length,
  unique_products: corpus.length,
  model: MODEL,
  dimensions: DIMENSIONS,
  content_version: CONTENT_VERSION,
  missing_canonical_unit: corpus.filter((row) => !row.canonical_unit).length,
  missing_quantity_base: corpus.filter((row) => row.quantity_base == null).length,
  by_store: Object.fromEntries([...new Set(corpus.map((row) => row.store))].sort().map((store) => [store, corpus.filter((row) => row.store === store).length])),
};
writeFileSync(summaryOutput, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary, null, 2));
