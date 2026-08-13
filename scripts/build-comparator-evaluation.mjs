#!/usr/bin/env node
// Genera candidatos reproducibles para evaluar el comparador.
// Solo lee metadatos publicados de Supabase; no modifica datos remotos.
// La sugerencia automática NO sustituye human_label.

import { readFileSync, writeFileSync } from 'node:fs';
import { validGlobalGtin } from './lib/gtin.mjs';

const ROOT = new URL('../', import.meta.url);
const OUTPUT = new URL('../supabase/experiments/comparator-evaluation-candidates.csv', import.meta.url);
const SUMMARY = new URL('../supabase/experiments/comparator-evaluation-summary.json', import.meta.url);
const PAGE_SIZE = Math.min(1000, Math.max(100, Number(process.env.PAGE_SIZE || 1000)));
const SOURCES_PER_STORE = Math.max(1, Number(process.env.SOURCES_PER_STORE || 12));
const MAX_PAIRS = Math.max(100, Number(process.env.MAX_PAIRS || 400));

const STORES = [
  ['mercadona', 'mercadona_products', ['id', 'display_name', 'display_name_ca', 'packaging', 'ean', 'category_name', 'price_per_unit', 'price_per_unit_unit']],
  ['esclat', 'bonpreu_products', ['id', 'display_name', 'display_name_ca', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit', 'price_per_unit_unit']],
  ['carrefour', 'carrefour_products', ['id', 'display_name', 'ean', 'category_name', 'price_per_unit', 'price_per_unit_unit']],
  ['bonarea', 'bonarea_products', ['id', 'display_name', 'display_name_ca', 'ean', 'category_name', 'price_per_unit', 'price_per_unit_unit']],
  ['consum', 'consum_products', ['id', 'display_name', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit', 'price_per_unit_unit']],
  ['dia', 'dia_products', ['id', 'display_name', 'brand', 'ean', 'category_name', 'price_per_unit', 'price_per_unit_unit']],
  ['sorli', 'sorli_products', ['id', 'display_name', 'display_name_ca', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit', 'price_per_unit_unit']],
  ['eroski', 'eroski_products', ['id', 'display_name', 'brand', 'ean', 'category_name', 'price_per_unit', 'price_per_unit_unit']],
  ['caprabo', 'caprabo_products', ['id', 'display_name', 'brand', 'ean', 'category_name', 'price_per_unit', 'price_per_unit_unit']],
  ['condis', 'condis_products', ['id', 'display_name', 'display_name_ca', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit', 'price_per_unit_unit']],
  ['ametller', 'ametller_products', ['id', 'display_name', 'display_name_ca', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit', 'price_per_unit_unit']],
  ['aldi', 'aldi_products', ['id', 'display_name', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit', 'price_per_unit_unit']],
  ['hiperdino', 'hiperdino_products', ['id', 'display_name', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit', 'price_per_unit_unit']],
  ['alcampo', 'alcampo_products', ['id', 'display_name', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit', 'price_per_unit_unit']],
  ['plusfresc', 'plusfresc_products', ['id', 'display_name', 'display_name_ca', 'brand', 'category_name', 'price_per_unit', 'price_per_unit_unit']],
];

const STOP_WORDS = new Set(['con', 'sin', 'para', 'por', 'del', 'las', 'los', 'una', 'uno', 'pack', 'producto']);
const STORE_WORDS = /\b(hacendado|bonpreu|bonarea|carrefour|consum|dia|deliplus|aliada|eroski|caprabo|sorli|ametller|alcampo|auchan|plusfresc)\b/g;
const PACKAGING_WORDS = /\b(brik|brick|carton|botella|garrafa|lata|tarro|bote|bolsa|paquete|bandeja|envase|granel)\b/g;
const ATTRIBUTE_RULES = [
  ['sin_lactosa', /\bsin lactosa\b/], ['vegetal', /\b(vegetal|avena|soja|almendra)\b/],
  ['bio', /\b(bio|ecologic[oa])\b/], ['infantil', /\b(infantil|bebe)\b/],
  ['sin_gluten', /\bsin gluten\b/], ['sin_azucar', /\bsin azucar\b/],
  ['proteina', /\b(proteina|proteico)\b/], ['desnatada', /\bdesnatad[oa]\b/],
  ['semidesnatada', /\bsemidesnatad[oa]\b/], ['entera', /\benter[oa]\b/],
];

function loadEnvLocal() {
  try {
    const out = {};
    for (const line of readFileSync(new URL('.env.local', ROOT), 'utf8').split(/\r?\n/)) {
      const text = line.trim();
      if (!text || text.startsWith('#')) continue;
      const separator = text.indexOf('=');
      if (separator < 1) continue;
      out[text.slice(0, separator).trim()] = text.slice(separator + 1).trim().replace(/^"(.*)"$/, '$1');
    }
    return out;
  } catch { return {}; }
}

const env = loadEnvLocal();
const SUPABASE_URL = (process.env.SUPABASE_URL || env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const SERVICE_ROLE = (process.env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE || '').trim();
if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE');

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function semanticText(name) {
  return normalize(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|ml|cl|l|ud|uds|u)\b/g, ' ')
    .replace(STORE_WORDS, ' ').replace(PACKAGING_WORDS, ' ')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokens(name) {
  return [...new Set(semanticText(name).split(' ').filter((w) => w.length >= 3 && !STOP_WORDS.has(w)))];
}
function attributes(name) {
  const text = normalize(name);
  return new Set(ATTRIBUTE_RULES.filter(([, re]) => re.test(text)).map(([key]) => key));
}
function blockers(a, b) {
  const blocked = [];
  for (const [key] of ATTRIBUTE_RULES) if (a.attrs.has(key) !== b.attrs.has(key)) blocked.push(key);
  return blocked;
}
function dice(a, b) {
  if (!a.length || !b.length) return 0;
  const right = new Set(b);
  return (2 * a.filter((x) => right.has(x)).length) / (a.length + b.length);
}
function trigrams(value) {
  const text = `  ${value}  `;
  return Array.from({ length: Math.max(0, text.length - 2) }, (_, i) => text.slice(i, i + 3));
}
function stableHash(value) {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function quantity(value) {
  const text = normalize(value);
  const multi = text.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|cl|l|ud|uds|u)\b/);
  const simple = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|cl|l|ud|uds|u)\b/);
  const match = multi || simple;
  if (!match) return '';
  const count = multi ? Number(match[1]) : 1;
  const amount = Number(String(match[multi ? 2 : 1]).replace(',', '.'));
  const unit = match[multi ? 3 : 2];
  return `${count * amount} ${unit}`;
}

async function fetchTable(store, table, fields) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
    url.searchParams.set('select', fields.join(','));
    url.searchParams.set('published', 'eq.true');
    url.searchParams.set('order', 'id.asc');
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(PAGE_SIZE));
    const response = await fetch(url, { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } });
    if (!response.ok) throw new Error(`${table}: HTTP ${response.status} ${await response.text()}`);
    const page = await response.json();
    for (const row of page) {
      const name = row.display_name || row.display_name_ca || '';
      const gtin = validGlobalGtin(row.ean);
      rows.push({
        store, id: String(row.id), name, brand: row.brand || '', gtin: gtin || '',
        price: row.price_per_unit == null ? '' : Number(row.price_per_unit),
        unit: row.price_per_unit_unit || '', category: row.category_name || '',
        quantity: quantity(`${name} ${row.packaging || ''}`), clean: semanticText(name),
        tokens: tokens(name), attrs: attributes(name),
      });
    }
    if (page.length < PAGE_SIZE) break;
  }
  console.log(`${store}: ${rows.length}`);
  return rows;
}

function scorePair(source, target) {
  const tokenScore = dice(source.tokens, target.tokens);
  const trigramScore = dice(trigrams(source.clean), trigrams(target.clean));
  const lexicalScore = 0.65 * tokenScore + 0.35 * trigramScore;
  const sameGtin = !!source.gtin && source.gtin === target.gtin;
  const unitCompatible = !!source.unit && source.unit === target.unit;
  const blocked = blockers(source, target);
  return { tokenScore, trigramScore, lexicalScore, sameGtin, unitCompatible, blocked };
}

function candidateRow(source, target, bucket, scores) {
  const suggestion = scores.sameGtin ? 'identico'
    : scores.blocked.length || (source.unit && target.unit && !scores.unitCompatible) ? 'no_relacionado'
      : scores.lexicalScore >= 0.55 && scores.unitCompatible ? 'comparable' : 'revisar';
  const reason = scores.sameGtin ? 'GTIN global coincidente'
    : scores.blocked.length ? `Atributos incompatibles: ${scores.blocked.join('|')}`
      : !scores.unitCompatible ? 'Unidad canónica ausente o incompatible'
        : 'Candidato léxico con unidad compatible';
  return {
    source_store: source.store, source_product_id: source.id, source_name: source.name,
    source_brand: source.brand, source_gtin: source.gtin, source_price_per_unit: source.price,
    source_unit: source.unit, source_quantity: source.quantity,
    target_store: target.store, target_product_id: target.id, target_name: target.name,
    target_brand: target.brand, target_gtin: target.gtin, target_price_per_unit: target.price,
    target_unit: target.unit, target_quantity: target.quantity, candidate_bucket: bucket,
    lexical_score: scores.lexicalScore.toFixed(6), token_score: scores.tokenScore.toFixed(6),
    trigram_score: scores.trigramScore.toFixed(6), same_global_gtin: scores.sameGtin,
    unit_compatible: scores.unitCompatible, blocking_attributes: scores.blocked.join('|'),
    automated_suggestion: suggestion, automated_reason: reason,
    human_label: '', review_reason: '', reviewer: '', reviewed_at: '', match_version: 'baseline_candidates_v1',
  };
}

const products = (await Promise.all(STORES.map((args) => fetchTable(...args)))).flat();
const tokenIndex = new Map();
const gtinIndex = new Map();
for (const product of products) {
  for (const token of product.tokens) {
    const list = tokenIndex.get(token) || [];
    list.push(product); tokenIndex.set(token, list);
  }
  if (product.gtin) {
    const list = gtinIndex.get(product.gtin) || [];
    list.push(product); gtinIndex.set(product.gtin, list);
  }
}

const pairs = [];
const seen = new Set();
const add = (source, target, bucket, scores = scorePair(source, target)) => {
  const key = `${source.store}:${source.id}>${target.store}:${target.id}`;
  if (source.store === target.store || seen.has(key)) return;
  seen.add(key); pairs.push(candidateRow(source, target, bucket, scores));
};

// Coincidencias exactas primero: son el control positivo del conjunto.
for (const group of [...gtinIndex.values()].filter((g) => new Set(g.map((p) => p.store)).size > 1)) {
  const sorted = group.sort((a, b) => `${a.store}:${a.id}`.localeCompare(`${b.store}:${b.id}`));
  for (let i = 0; i < sorted.length - 1; i += 1) add(sorted[i], sorted[i + 1], 'exact_gtin');
}

for (const [store] of STORES) {
  const sources = products.filter((p) => p.store === store && p.tokens.length)
    .sort((a, b) => stableHash(`${a.store}:${a.id}`) - stableHash(`${b.store}:${b.id}`))
    .slice(0, SOURCES_PER_STORE);
  for (const source of sources) {
    const pool = new Map();
    for (const token of source.tokens.slice(0, 5)) {
      for (const target of tokenIndex.get(token) || []) if (target.store !== source.store) pool.set(`${target.store}:${target.id}`, target);
    }
    const ranked = [...pool.values()].map((target) => ({ target, scores: scorePair(source, target) }))
      .filter((x) => x.scores.lexicalScore >= 0.28)
      .sort((a, b) => b.scores.lexicalScore - a.scores.lexicalScore || `${a.target.store}:${a.target.id}`.localeCompare(`${b.target.store}:${b.target.id}`));
    const compatible = ranked.find((x) => x.scores.unitCompatible && x.scores.blocked.length === 0);
    const hardNegative = ranked.find((x) => x.scores.blocked.length > 0 || (source.unit && x.target.unit && !x.scores.unitCompatible));
    if (compatible) add(source, compatible.target, 'lexical_compatible', compatible.scores);
    if (hardNegative) add(source, hardNegative.target, 'hard_negative', hardNegative.scores);
  }
}

const pairHash = (row) => stableHash(`${row.source_store}:${row.source_product_id}>${row.target_store}:${row.target_product_id}`);
const shuffled = [...pairs].sort((a, b) => pairHash(a) - pairHash(b));
const quotas = {
  exact_gtin: Math.round(MAX_PAIRS * 0.20),
  lexical_compatible: Math.round(MAX_PAIRS * 0.45),
  hard_negative: Math.round(MAX_PAIRS * 0.35),
};
const selected = [];
const selectedKeys = new Set();
for (const [bucket, limit] of Object.entries(quotas)) {
  for (const row of shuffled.filter((pair) => pair.candidate_bucket === bucket).slice(0, limit)) {
    selected.push(row); selectedKeys.add(`${row.source_store}:${row.source_product_id}>${row.target_store}:${row.target_product_id}`);
  }
}
for (const row of shuffled) {
  if (selected.length >= MAX_PAIRS) break;
  const key = `${row.source_store}:${row.source_product_id}>${row.target_store}:${row.target_product_id}`;
  if (!selectedKeys.has(key)) { selected.push(row); selectedKeys.add(key); }
}

const columns = Object.keys(selected[0] || candidateRow(products[0], products[1], 'empty', scorePair(products[0], products[1])));
const csv = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
writeFileSync(OUTPUT, `${columns.join(',')}\n${selected.map((row) => columns.map((key) => csv(row[key])).join(',')).join('\n')}\n`, 'utf8');

const countBy = (field) => Object.fromEntries([...new Set(selected.map((row) => row[field]))].sort()
  .map((value) => [value, selected.filter((row) => row[field] === value).length]));
const summary = {
  generated_at: new Date().toISOString(), catalog_products: products.length,
  candidate_pairs: selected.length, human_labels: selected.filter((r) => r.human_label).length,
  by_bucket: countBy('candidate_bucket'), by_source_store: countBy('source_store'),
  by_automated_suggestion: countBy('automated_suggestion'),
};
writeFileSync(SUMMARY, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary, null, 2));
