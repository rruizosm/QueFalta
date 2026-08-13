#!/usr/bin/env node
// Mide recuperación, paridad de scores y latencia del piloto desplegado en Supabase.

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const PAIRS_FILE = path.join(ROOT, 'supabase', 'experiments', 'comparator-evaluation-pairs.csv');
const VECTORS_FILE = path.join(ROOT, 'supabase', 'experiments', 'comparator-embedding-pilot-vectors.jsonl');
const RPC_NAME = process.env.COMPARATOR_CANDIDATES_RPC || 'catalog_embedding_candidates_v2';
const OUTPUT_FILE = path.resolve(
  ROOT,
  process.env.COMPARATOR_BENCHMARK_OUTPUT || 'supabase/experiments/comparator-embedding-remote-benchmark.json',
);
const RESULTS_FILE = path.resolve(
  ROOT,
  process.env.COMPARATOR_BENCHMARK_RESULTS || 'supabase/experiments/comparator-embedding-remote-results.json',
);

function numberFromEnv(name, fallback, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} debe ser un número${integer ? ' entero' : ''} entre ${min} y ${max}`);
  }
  return value;
}

const VECTOR_WEIGHT = numberFromEnv('COMPARATOR_VECTOR_WEIGHT', 0.5, { min: 0, max: 1 });
const LEXICAL_WEIGHT = 1 - VECTOR_WEIGHT;
const THRESHOLD = numberFromEnv('COMPARATOR_THRESHOLD', 0.58, { min: 0, max: 1 });
const MATCH_COUNT = numberFromEnv('COMPARATOR_MATCH_COUNT', 100, { min: 1, max: 500, integer: true });
const MIN_VECTOR_SCORE = numberFromEnv('COMPARATOR_MIN_VECTOR_SCORE', -1, { min: -1, max: 1 });
const STOP_WORDS = new Set(['con', 'sin', 'para', 'por', 'del', 'las', 'los', 'una', 'uno', 'pack', 'producto']);
const STORE_WORDS = /\b(hacendado|bonpreu|bonarea|carrefour|consum|dia|deliplus|aliada|eroski|caprabo|sorli|ametller|alcampo|auchan|plusfresc)\b/g;
const PACKAGING_WORDS = /\b(brik|brick|carton|botella|garrafa|lata|tarro|bote|bolsa|paquete|bandeja|envase|granel)\b/g;

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
  return rows.map((row) => Object.fromEntries(columns.map((key, index) => [key, row[index] ?? ''])));
}

function cosine(left, right) {
  let dot = 0; let leftNorm = 0; let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function semanticText(name) {
  return normalize(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|ml|cl|l|ud|uds|u)\b/g, ' ')
    .replace(STORE_WORDS, ' ').replace(PACKAGING_WORDS, ' ')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokens(name) {
  return [...new Set(semanticText(name).split(' ').filter((word) => word.length >= 3 && !STOP_WORDS.has(word)))];
}
function dice(left, right) {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  return (2 * left.filter((value) => rightSet.has(value)).length) / (left.length + right.length);
}
function trigrams(value) {
  const text = `  ${value}  `;
  return Array.from({ length: Math.max(0, text.length - 2) }, (_, index) => text.slice(index, index + 3));
}
function validatedLexicalScore(left, right) {
  return 0.65 * dice(tokens(left), tokens(right)) + 0.35 * dice(trigrams(semanticText(left)), trigrams(semanticText(right)));
}
const PREPARATION_RULE = /\b(al horno|hornead[oa]|asad[oa]|cocid[oa]|frit[oa]|rebozad[oa]|empanad[oa]|a la romana)\b/;
const preparationMismatch = (row) => PREPARATION_RULE.test(normalize(row.source_name)) !== PREPARATION_RULE.test(normalize(row.target_name));

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

const env = loadEnvLocal();
const supabaseUrl = (process.env.SUPABASE_URL || env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const serviceRole = (process.env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!supabaseUrl || !serviceRole) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE');

const pairs = parseCsv(fs.readFileSync(PAIRS_FILE, 'utf8'));
if (pairs.length !== 400) throw new Error(`Se esperaban 400 pares y se encontraron ${pairs.length}`);
const vectors = new Map(fs.readFileSync(VECTORS_FILE, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
  const row = JSON.parse(line);
  return [`${row.store}:${row.product_id}`, row.embedding];
}));

const supabase = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const results = [];

for (let index = 0; index < pairs.length; index += 1) {
  const row = pairs[index];
  const startedAt = performance.now();
  const { data, error } = await supabase.rpc(RPC_NAME, {
    p_source_store: row.source_store,
    p_source_product_id: row.source_product_id,
    p_target_stores: [row.target_store],
    p_match_count: MATCH_COUNT,
    p_min_vector_score: MIN_VECTOR_SCORE,
  });
  const elapsedMs = performance.now() - startedAt;
  if (error) throw new Error(`RPC ${index + 1}/400: ${error.message}`);

  const candidates = data ?? [];
  const targetIndex = candidates.findIndex((candidate) => String(candidate.target_product_id) === row.target_product_id);
  const target = targetIndex >= 0 ? candidates[targetIndex] : null;
  const sourceVector = vectors.get(`${row.source_store}:${row.source_product_id}`);
  const targetVector = vectors.get(`${row.target_store}:${row.target_product_id}`);
  if (!sourceVector || !targetVector) throw new Error(`Falta un vector local en el par ${index + 1}`);
  const offlineVectorScore = cosine(sourceVector, targetVector);
  const offlineLexicalScore = Number(row.lexical_score || 0);
  const remoteVectorScore = target ? Number(target.vector_score) : null;
  const postgresLexicalScore = target ? Number(target.trigram_score ?? target.lexical_score) : null;
  const remoteLexicalScore = target ? validatedLexicalScore(row.source_name, target.target_name) : null;

  let prediction = 'no_relacionado';
  if (row.same_global_gtin === 'true') prediction = 'identico';
  else if (target && !preparationMismatch(row)) {
    const hybridScore = VECTOR_WEIGHT * remoteVectorScore + LEXICAL_WEIGHT * remoteLexicalScore;
    if (hybridScore >= THRESHOLD) prediction = 'comparable';
  }

  results.push({
    source: `${row.source_store}:${row.source_product_id}`,
    target: `${row.target_store}:${row.target_product_id}`,
    source_name: row.source_name,
    target_name: row.target_name,
    human_label: row.human_label,
    same_global_gtin: row.same_global_gtin === 'true',
    prediction,
    retrieved: Boolean(target),
    preparation_mismatch: preparationMismatch(row),
    rank: target ? targetIndex + 1 : null,
    returned_candidates: candidates.length,
    vector_score: remoteVectorScore,
    lexical_score: remoteLexicalScore,
    postgres_lexical_score: postgresLexicalScore,
    offline_vector_score: offlineVectorScore,
    offline_lexical_score: offlineLexicalScore,
    latency_ms: elapsedMs,
  });

  if ((index + 1) % 50 === 0 || index + 1 === pairs.length) console.log(`Evaluados ${index + 1}/${pairs.length}`);
}

const comparablePredictions = results.filter((row) => row.prediction === 'comparable');
const trueComparablePredictions = comparablePredictions.filter((row) => row.human_label === 'comparable');
const humanComparables = results.filter((row) => row.human_label === 'comparable');
const retrieved = results.filter((row) => row.retrieved);
const latencies = results.map((row) => row.latency_ms);
const parityRows = retrieved.map((row) => ({
  vector: Math.abs(row.vector_score - row.offline_vector_score),
  lexical: Math.abs(row.lexical_score - row.offline_lexical_score),
}));
const correct = results.filter((row) => row.prediction === row.human_label).length;

function evaluateConfiguration(vectorWeight, threshold) {
  const predictions = results.map((row) => {
    let prediction = 'no_relacionado';
    if (row.same_global_gtin) {
      prediction = 'identico';
    } else if (row.retrieved && !row.preparation_mismatch) {
      const score = vectorWeight * row.vector_score + (1 - vectorWeight) * row.lexical_score;
      if (score >= threshold) prediction = 'comparable';
    }
    return { row, prediction };
  });
  const comparable = predictions.filter((item) => item.prediction === 'comparable');
  const trueComparable = comparable.filter((item) => item.row.human_label === 'comparable').length;
  return {
    vector_weight: vectorWeight,
    lexical_weight: 1 - vectorWeight,
    threshold,
    accuracy: Number((predictions.filter((item) => item.prediction === item.row.human_label).length / predictions.length).toFixed(4)),
    comparable_precision: comparable.length ? Number((trueComparable / comparable.length).toFixed(4)) : null,
    comparable_recall: Number((trueComparable / humanComparables.length).toFixed(4)),
    predicted_comparable: comparable.length,
    false_positive_count: comparable.length - trueComparable,
  };
}

const configurations = [];
for (const vectorWeight of [0.25, 0.5, 0.75, 1]) {
  for (let threshold = 0.3; threshold <= 0.95; threshold += 0.01) {
    configurations.push(evaluateConfiguration(vectorWeight, Number(threshold.toFixed(2))));
  }
}
const byCoverageThenAccuracy = (left, right) => right.predicted_comparable - left.predicted_comparable || right.accuracy - left.accuracy || left.vector_weight - right.vector_weight;
const selectedRemote = [...configurations].filter((item) => item.comparable_precision >= 0.98).sort(byCoverageThenAccuracy)[0] ?? null;
const baselinePrecisionRemote = [...configurations].filter((item) => item.comparable_precision >= 0.992).sort(byCoverageThenAccuracy)[0] ?? null;
const conservativeRemote = [...configurations].filter((item) => item.comparable_precision === 1).sort(byCoverageThenAccuracy)[0] ?? null;

const report = {
  generated_at: new Date().toISOString(),
  project_url: supabaseUrl,
  evaluated_pairs: results.length,
  configuration: {
    vector_weight: VECTOR_WEIGHT,
    lexical_weight: LEXICAL_WEIGHT,
    threshold: THRESHOLD,
    match_count: MATCH_COUNT,
    min_vector_score: MIN_VECTOR_SCORE,
    rpc: RPC_NAME,
  },
  quality: {
    accuracy: Number((correct / results.length).toFixed(4)),
    comparable_precision: comparablePredictions.length ? Number((trueComparablePredictions.length / comparablePredictions.length).toFixed(4)) : null,
    comparable_recall: Number((trueComparablePredictions.length / humanComparables.length).toFixed(4)),
    predicted_comparable: comparablePredictions.length,
    false_positive_count: comparablePredictions.length - trueComparablePredictions.length,
    selected_remote: selectedRemote,
    at_baseline_precision_remote: baselinePrecisionRemote,
    conservative_remote: conservativeRemote,
  },
  retrieval: {
    retrieved_pairs: retrieved.length,
    comparable_top_1: humanComparables.filter((row) => row.rank === 1).length,
    comparable_top_5: humanComparables.filter((row) => row.rank && row.rank <= 5).length,
    comparable_top_20: humanComparables.filter((row) => row.rank && row.rank <= 20).length,
    comparable_within_returned_candidates: humanComparables.filter((row) => row.retrieved).length,
    comparable_total: humanComparables.length,
    not_retrieved_by_label: Object.fromEntries(['identico', 'comparable', 'no_relacionado'].map((label) => [
      label,
      results.filter((row) => row.human_label === label && !row.retrieved).length,
    ])),
  },
  score_parity: {
    compared_pairs: parityRows.length,
    max_vector_absolute_difference: parityRows.length ? Math.max(...parityRows.map((row) => row.vector)) : null,
    max_lexical_absolute_difference: parityRows.length ? Math.max(...parityRows.map((row) => row.lexical)) : null,
  },
  latency_ms: {
    first: Number(latencies[0].toFixed(2)),
    mean: Number((latencies.reduce((sum, value) => sum + value, 0) / latencies.length).toFixed(2)),
    p50: Number(percentile(latencies, 0.5).toFixed(2)),
    p95: Number(percentile(latencies, 0.95).toFixed(2)),
    max: Number(Math.max(...latencies).toFixed(2)),
  },
  false_positives: comparablePredictions.filter((row) => row.human_label !== 'comparable').map((row) => ({
    source: row.source,
    source_name: row.source_name,
    target: row.target,
    target_name: row.target_name,
    human_label: row.human_label,
    vector_score: row.vector_score,
    lexical_score: row.lexical_score,
  })),
};

fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(RESULTS_FILE, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
