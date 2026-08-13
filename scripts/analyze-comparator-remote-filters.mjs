#!/usr/bin/env node
// Explica con los datos remotos actuales qué filtro excluye cada par gold.

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const PAIRS_FILE = path.join(ROOT, 'supabase', 'experiments', 'comparator-evaluation-pairs.csv');
const RESULTS_FILE = path.resolve(
  ROOT,
  process.env.COMPARATOR_BENCHMARK_RESULTS || 'supabase/experiments/comparator-embedding-remote-results-v3-production.json',
);

function loadEnvLocal() {
  const result = {};
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return result;
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function parseCsv(text) {
  const records = []; let record = []; let field = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { record.push(field); field = ''; }
    else if (char === '\n') { record.push(field.replace(/\r$/, '')); records.push(record); record = []; field = ''; }
    else field += char;
  }
  if (field || record.length) { record.push(field); records.push(record); }
  const [columns, ...rows] = records.filter((row) => row.some((value) => value !== ''));
  return rows.map((row) => Object.fromEntries(columns.map((key, index) => [key, row[index] ?? ''])));
}

function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function attributeConflicts(left, right) {
  return Object.keys(left.attributes ?? {}).filter((key) => (
    typeof left.attributes[key] === 'boolean'
    && typeof right.attributes?.[key] === 'boolean'
    && left.attributes[key] !== right.attributes[key]
  ));
}

function rejection(source, target) {
  if (!source || !target) return { reason: 'missing_product', conflicts: [] };
  if (!source.published || !target.published) return { reason: 'not_published', conflicts: [] };
  if (source.global_gtin && source.global_gtin === target.global_gtin) return { reason: 'exact_gtin', conflicts: [] };
  if (source.model !== target.model || source.content_version !== target.content_version) {
    return { reason: 'embedding_version_mismatch', conflicts: [] };
  }
  if (!source.canonical_unit) return { reason: 'source_unit_missing', conflicts: [] };
  if (target.canonical_unit !== source.canonical_unit) return { reason: 'unit_missing_or_mismatch', conflicts: [] };
  const conflicts = attributeConflicts(source, target);
  if (conflicts.length) return { reason: 'attribute_conflict', conflicts };
  if (source.quantity_base != null && target.quantity_base != null) {
    const ratio = Number(target.quantity_base) / Number(source.quantity_base);
    if (ratio < 1 / 12 || ratio > 12) return { reason: 'quantity_ratio', conflicts: [], ratio };
  }
  return { reason: 'passes_hard_filters', conflicts: [] };
}

const env = loadEnvLocal();
const supabaseUrl = (process.env.SUPABASE_URL || env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const serviceRole = (process.env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!supabaseUrl || !serviceRole) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE');

const pairs = parseCsv(fs.readFileSync(PAIRS_FILE, 'utf8'));
const remoteResults = fs.existsSync(RESULTS_FILE)
  ? new Map(JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')).map((row) => [`${row.source}|${row.target}`, row]))
  : new Map();
const requestedByStore = new Map();
for (const row of pairs) {
  for (const [store, productId] of [[row.source_store, row.source_product_id], [row.target_store, row.target_product_id]]) {
    if (!requestedByStore.has(store)) requestedByStore.set(store, new Set());
    requestedByStore.get(store).add(productId);
  }
}

const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const products = new Map();
for (const [store, productIds] of requestedByStore) {
  for (const batch of chunks([...productIds], 100)) {
    const { data, error } = await supabase
      .from('catalog_product_embeddings')
      .select('store,product_id,display_name,canonical_unit,quantity_base,global_gtin,attributes,model,content_version,published')
      .eq('store', store)
      .in('product_id', batch);
    if (error) throw new Error(`${store}: ${error.message}`);
    for (const product of data ?? []) products.set(`${product.store}:${product.product_id}`, product);
  }
}

const analyzed = pairs.map((row) => {
  const sourceKey = `${row.source_store}:${row.source_product_id}`;
  const targetKey = `${row.target_store}:${row.target_product_id}`;
  return {
    row,
    remote: remoteResults.get(`${sourceKey}|${targetKey}`) ?? null,
    ...rejection(products.get(sourceKey), products.get(targetKey)),
  };
});
const labels = ['identico', 'comparable', 'no_relacionado'];
const reasons = [...new Set(analyzed.map((item) => item.reason))];
const byLabel = Object.fromEntries(labels.map((label) => [label, Object.fromEntries(reasons.map((reason) => [
  reason,
  analyzed.filter((item) => item.row.human_label === label && item.reason === reason).length,
]))]));
const missingComparableByReason = Object.fromEntries(reasons.map((reason) => [
  reason,
  analyzed.filter((item) => item.row.human_label === 'comparable' && !item.remote?.retrieved && item.reason === reason).length,
]));
const comparableAttributeConflicts = {};
for (const item of analyzed.filter((entry) => entry.row.human_label === 'comparable' && entry.reason === 'attribute_conflict')) {
  for (const conflict of item.conflicts) comparableAttributeConflicts[conflict] = (comparableAttributeConflicts[conflict] ?? 0) + 1;
}

console.log(JSON.stringify({
  evaluated_pairs: analyzed.length,
  remote_products_found: products.size,
  by_label: byLabel,
  missing_comparable_by_reason: missingComparableByReason,
  comparable_attribute_conflicts: comparableAttributeConflicts,
  missing_comparable_examples: analyzed
    .filter((item) => item.row.human_label === 'comparable' && !item.remote?.retrieved)
    .slice(0, 20)
    .map((item) => ({
      source: `${item.row.source_store}:${item.row.source_product_id}`,
      source_name: item.row.source_name,
      target: `${item.row.target_store}:${item.row.target_product_id}`,
      target_name: item.row.target_name,
      reason: item.reason,
      conflicts: item.conflicts,
      ratio: item.ratio ?? null,
    })),
}, null, 2));
