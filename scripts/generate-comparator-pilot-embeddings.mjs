#!/usr/bin/env node
// Genera los embeddings del corpus piloto con guardado reanudable por lotes.
// La API key solo se lee de .env.local o del entorno y nunca se imprime.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const input = new URL('../supabase/experiments/comparator-embedding-pilot.jsonl', import.meta.url);
const output = new URL('../supabase/experiments/comparator-embedding-pilot-vectors.jsonl', import.meta.url);
const summaryOutput = new URL('../supabase/experiments/comparator-embedding-pilot-vectors-summary.json', import.meta.url);
const temporaryOutput = new URL('../supabase/experiments/comparator-embedding-pilot-vectors.jsonl.tmp', import.meta.url);
const MODEL = 'text-embedding-3-small';
const DIMENSIONS = 512;
const BATCH_SIZE = Math.min(200, Math.max(1, Number(process.env.EMBEDDING_BATCH_SIZE || 100)));

function loadEnvLocal() {
  try {
    const values = {};
    for (const line of readFileSync(new URL('.env.local', ROOT), 'utf8').split(/\r?\n/)) {
      const text = line.trim();
      if (!text || text.startsWith('#')) continue;
      const separator = text.indexOf('=');
      if (separator < 1) continue;
      values[text.slice(0, separator).trim()] = text.slice(separator + 1).trim().replace(/^"(.*)"$/, '$1');
    }
    return values;
  } catch { return {}; }
}

const env = loadEnvLocal();
const apiKey = (process.env.OPENAI_API_KEY || env.OPENAI_API_KEY || '').trim();
if (!apiKey) throw new Error('Falta OPENAI_API_KEY en .env.local o en el entorno');

const parseJsonl = (url) => existsSync(url)
  ? readFileSync(url, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
  : [];
const corpus = parseJsonl(input);
const existing = new Map(parseJsonl(output).map((row) => [`${row.store}:${row.product_id}`, row]));
const validExisting = new Map([...existing].filter(([, row]) =>
  row.model === MODEL
  && row.dimensions === DIMENSIONS
  && Array.isArray(row.embedding)
  && row.embedding.length === DIMENSIONS
));
const pending = corpus.filter((row) => {
  const saved = validExisting.get(`${row.store}:${row.product_id}`);
  return !saved || saved.content_hash !== row.content_hash;
});

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function requestEmbeddings(batch) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        input: batch.map((row) => row.content),
        dimensions: DIMENSIONS,
        encoding_format: 'float',
      }),
    });
    if (response.ok) return response.json();
    const message = await response.text();
    let errorCode = '';
    try { errorCode = JSON.parse(message)?.error?.code || ''; } catch { /* respuesta no JSON */ }
    lastError = new Error(`OpenAI respondió ${response.status}: ${message.slice(0, 500)}`);
    if (['insufficient_quota', 'credit_balance_exhausted'].includes(errorCode)) throw lastError;
    if (response.status !== 429 && response.status < 500) throw lastError;
    await wait(1000 * (2 ** attempt));
  }
  throw lastError;
}

function persist(rows) {
  const sorted = [...rows.values()].sort((a, b) => `${a.store}:${a.product_id}`.localeCompare(`${b.store}:${b.product_id}`));
  writeFileSync(temporaryOutput, `${sorted.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  renameSync(temporaryOutput, output);
}

let requestCount = 0;
let inputTokens = 0;
for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
  const batch = pending.slice(offset, offset + BATCH_SIZE);
  const response = await requestEmbeddings(batch);
  if (!Array.isArray(response.data) || response.data.length !== batch.length) {
    throw new Error(`Respuesta incompleta: esperados ${batch.length}, recibidos ${response.data?.length ?? 0}`);
  }
  for (const item of response.data) {
    const product = batch[item.index];
    if (!product || !Array.isArray(item.embedding) || item.embedding.length !== DIMENSIONS) {
      throw new Error(`Embedding inválido en el lote que comienza en ${offset}`);
    }
    validExisting.set(`${product.store}:${product.product_id}`, {
      ...product,
      embedding: item.embedding,
      embedded_at: new Date().toISOString(),
    });
  }
  requestCount += 1;
  inputTokens += Number(response.usage?.prompt_tokens || response.usage?.total_tokens || 0);
  persist(validExisting);
  console.log(`Guardados ${Math.min(offset + batch.length, pending.length)}/${pending.length} embeddings pendientes`);
}

const finalRows = parseJsonl(output);
const summary = {
  generated_at: new Date().toISOString(),
  model: MODEL,
  dimensions: DIMENSIONS,
  corpus_products: corpus.length,
  embedded_products: finalRows.length,
  generated_this_run: pending.length,
  requests_this_run: requestCount,
  input_tokens_this_run: inputTokens,
  estimated_cost_usd_this_run: Number((inputTokens * 0.02 / 1_000_000).toFixed(6)),
  complete: finalRows.length === corpus.length,
};
writeFileSync(summaryOutput, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(summary, null, 2));
