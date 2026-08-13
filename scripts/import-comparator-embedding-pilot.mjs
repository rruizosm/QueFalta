import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const VECTOR_FILE = path.join(
  ROOT,
  'supabase',
  'experiments',
  'comparator-embedding-pilot-vectors.jsonl',
);
const EXPECTED_ROWS = 683;
const EXPECTED_DIMENSIONS = 512;
const EXPECTED_MODEL = 'text-embedding-3-small';
const EXPECTED_CONTENT_VERSION = 'catalog_embedding_content_v1';
const BATCH_SIZE = 20;

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
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}

function readAndValidateRows() {
  const lines = fs.readFileSync(VECTOR_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length !== EXPECTED_ROWS) {
    throw new Error(`El piloto debe contener ${EXPECTED_ROWS} filas; contiene ${lines.length}`);
  }

  const keys = new Set();
  return lines.map((line, index) => {
    const row = JSON.parse(line);
    const key = `${row.store}\u0000${row.product_id}`;
    if (keys.has(key)) throw new Error(`Producto duplicado en la fila ${index + 1}: ${key}`);
    keys.add(key);

    if (!row.store || !row.product_id || !row.display_name || !row.content) {
      throw new Error(`Identidad o contenido incompleto en la fila ${index + 1}`);
    }
    if (!/^[0-9a-f]{64}$/.test(row.content_hash || '')) {
      throw new Error(`content_hash inválido en la fila ${index + 1}`);
    }
    if (row.content_version !== EXPECTED_CONTENT_VERSION) {
      throw new Error(`content_version inesperada en la fila ${index + 1}`);
    }
    if (row.model !== EXPECTED_MODEL) {
      throw new Error(`Modelo inesperado en la fila ${index + 1}`);
    }
    if (
      row.dimensions !== EXPECTED_DIMENSIONS
      || !Array.isArray(row.embedding)
      || row.embedding.length !== EXPECTED_DIMENSIONS
      || row.embedding.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(`Vector inválido en la fila ${index + 1}`);
    }
    if (!row.embedded_at || Number.isNaN(Date.parse(row.embedded_at))) {
      throw new Error(`embedded_at inválido en la fila ${index + 1}`);
    }

    return {
      store: row.store,
      product_id: row.product_id,
      display_name: row.display_name,
      brand: row.brand ?? null,
      category: row.category ?? null,
      canonical_unit: row.canonical_unit ?? null,
      quantity_base: row.quantity_base ?? null,
      global_gtin: row.global_gtin ?? null,
      attributes: row.attributes ?? {},
      content: row.content,
      content_hash: row.content_hash,
      content_version: row.content_version,
      embedding: row.embedding,
      model: row.model,
      published: true,
      source_seen_at: new Date().toISOString(),
      embedded_at: row.embedded_at,
    };
  });
}

const env = loadEnvLocal();
const supabaseUrl = (
  process.env.SUPABASE_URL
  || env.SUPABASE_URL
  || env.EXPO_PUBLIC_SUPABASE_URL
  || ''
).trim();
const serviceRole = (
  process.env.SUPABASE_SERVICE_ROLE
  || env.SUPABASE_SERVICE_ROLE
  || env.SUPABASE_SERVICE_ROLE_KEY
  || ''
).trim();

if (!supabaseUrl || !serviceRole) {
  throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE');
}

const rows = readAndValidateRows();
if (process.env.DRY_RUN === '1') {
  console.log(JSON.stringify({ dry_run: true, validated_rows: rows.length }));
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
  const batch = rows.slice(offset, offset + BATCH_SIZE);
  const { error } = await supabase
    .from('catalog_product_embeddings')
    .upsert(batch, { onConflict: 'store,product_id' });
  if (error) {
    throw new Error(`Falló el lote ${offset + 1}-${offset + batch.length}: ${error.message}`);
  }
  console.log(`Importadas ${offset + batch.length}/${rows.length}`);
}

const { count, error: countError } = await supabase
  .from('catalog_product_embeddings')
  .select('*', { count: 'exact', head: true })
  .eq('content_version', EXPECTED_CONTENT_VERSION)
  .eq('model', EXPECTED_MODEL)
  .eq('published', true);

if (countError) throw new Error(`No se pudo verificar el piloto: ${countError.message}`);
if (count !== EXPECTED_ROWS) {
  throw new Error(`Verificación remota inesperada: ${count} filas en vez de ${EXPECTED_ROWS}`);
}

console.log(JSON.stringify({ imported_rows: rows.length, verified_rows: count }));
