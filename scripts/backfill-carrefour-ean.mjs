#!/usr/bin/env node
// Backfill reanudable de EAN para Carrefour → carrefour_products.ean.
// Lee solo productos publicados sin EAN, descarga su PDP (raw.url), localiza el
// producto por el `id` almacenado y guarda exclusivamente los EAN válidos.
//
// Carrefour no incluye siempre el EAN en los listados de categoría, pero sí en
// window.__INITIAL_STATE__ de la ficha. Cada página de la BD se confirma antes de
// pasar a la siguiente: si se interrumpe, basta relanzarlo (ean IS NULL).
//
// Env: SUPABASE_URL / SUPABASE_SERVICE_ROLE (o se leen de ../.env.local).
//      CONCURRENCY=3  PDPs en paralelo (conservador para Cloudflare)
//      PAGE_SIZE=200  filas de BD por página (máx. 1000)
//      LIMIT=N        tope de productos para prueba o para repartir el trabajo
//      PRODUCT_ID=ID  limita la prueba a un producto concreto (acepta R-<id>)
//      DRY_RUN=1      consulta y muestra resultados, sin escribir en Supabase
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

function loadEnvLocal() {
  try {
    const out = {};
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
      const text = line.trim();
      if (!text || text.startsWith('#')) continue;
      const separator = text.indexOf('=');
      if (separator < 1) continue;
      out[text.slice(0, separator).trim()] = text.slice(separator + 1).trim().replace(/^"(.*)"$/, '$1');
    }
    return out;
  } catch {
    return {};
  }
}

const env = loadEnvLocal();
const SUPABASE_URL = (process.env.SUPABASE_URL || env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const SERVICE_ROLE = (process.env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE || '').trim();
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const PAGE_SIZE = Math.min(1000, Math.max(1, Number(process.env.PAGE_SIZE || 200)));
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const DRY_RUN = process.env.DRY_RUN === '1';
const PRODUCT_ID = (process.env.PRODUCT_ID || '').trim().replace(/^R-/, '');

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE');
  process.exit(1);
}
if (!Number.isFinite(CONCURRENCY) || CONCURRENCY < 1 || !Number.isFinite(PAGE_SIZE) || PAGE_SIZE < 1 || LIMIT < 1) {
  console.error('CONCURRENCY, PAGE_SIZE y LIMIT deben ser números positivos');
  process.exit(1);
}

const HOME = 'https://www.carrefour.es';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const BROWSER_HEADERS = [
  '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  '-H', 'Accept-Language: es-ES,es;q=0.9',
  '-H', 'Cache-Control: no-cache',
  '-H', 'Pragma: no-cache',
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pool(items, size, fn) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.max(1, size) }, async () => {
    for (;;) {
      const item = items[index++];
      if (!item) break;
      await fn(item);
    }
  }));
}

// Extrae window.__INITIAL_STATE__ = {…}; sin depender de que Carrefour cambie el
// orden, el tamaño o los escapes del resto del HTML.
function extractInitialState(html) {
  const marker = html.indexOf('window.__INITIAL_STATE__');
  if (marker < 0) return null;
  const start = html.indexOf('{', marker);
  if (start < 0) return null;
  let depth = 0;
  for (let index = start; index < html.length; index++) {
    if (html[index] === '{') depth++;
    else if (html[index] === '}' && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, index + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function findProduct(state, id) {
  const target = String(id).replace(/^R-/, '');
  const visited = new Set();
  const walk = (value, depth) => {
    if (!value || typeof value !== 'object' || depth > 12 || visited.has(value)) return null;
    visited.add(value);
    if (String(value.product_id ?? '') === target) return value;
    for (const child of Object.values(value)) {
      const found = walk(child, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(state, 0);
}

function validEan(value) {
  const ean = String(value ?? '').trim();
  return /^\d{8,14}$/.test(ean) ? ean : null;
}

async function fetchPdpEan(row) {
  const path = row.raw?.url;
  if (typeof path !== 'string' || !path) return { ean: null, reason: 'sin URL de ficha' };
  const url = path.startsWith('http') ? path : `${HOME}${path}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { stdout } = await execFileP('curl', [
        '-sSL', '--compressed', '--max-time', '30', '-A', UA, ...BROWSER_HEADERS,
        '-w', '\n__HTTP__%{http_code}', url,
      ], { maxBuffer: 32 * 1024 * 1024 });
      const marker = stdout.lastIndexOf('\n__HTTP__');
      const html = marker >= 0 ? stdout.slice(0, marker) : stdout;
      const status = marker >= 0 ? Number(stdout.slice(marker + 9).trim()) : 0;
      if (status === 200 && html.includes('window.__INITIAL_STATE__')) {
        const product = findProduct(extractInitialState(html), row.id);
        const ean = validEan(product?.ean);
        return ean ? { ean } : { ean: null, reason: product ? 'PDP sin EAN válido' : 'producto no encontrado en PDP' };
      }
      if (status && status < 500 && status !== 429) return { ean: null, reason: `HTTP ${status}` };
    } catch (error) {
      if (attempt === 3) return { ean: null, reason: error.message.split('\n')[0] };
    }
    await sleep(800 * (attempt + 1));
  }
  return { ean: null, reason: 'sin respuesta válida tras reintentos' };
}

async function fetchPending(afterId, limit) {
  const query = new URLSearchParams({
    select: 'id,display_name,raw',
    published: 'eq.true',
    ean: 'is.null',
    order: 'id.asc',
    limit: String(limit),
  });
  if (PRODUCT_ID) query.set('id', `eq.${PRODUCT_ID}`);
  else if (afterId) query.set('id', `gt.${afterId}`);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/carrefour_products?${query}`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  if (!res.ok) throw new Error(`lectura de pendientes ${res.status}: ${await res.text()}`);
  return res.json();
}

async function upsert(rows) {
  if (DRY_RUN || rows.length === 0) return;
  for (let start = 0; start < rows.length; start += 500) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/carrefour_products`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows.slice(start, start + 500)),
    });
    if (!res.ok) throw new Error(`escritura de EAN ${res.status}: ${await res.text()}`);
  }
}

async function main() {
  console.log(`[carrefour-ean] inicio ${new Date().toISOString()}${DRY_RUN ? ' (DRY RUN)' : ''} · conc=${CONCURRENCY}`);
  let afterId = '';
  let remaining = LIMIT;
  let requested = 0, found = 0, withoutEan = 0, withoutUrl = 0;

  while (remaining > 0) {
    const size = Math.min(PAGE_SIZE, remaining);
    const rows = await fetchPending(afterId, size);
    if (rows.length === 0) break;
    afterId = rows.at(-1).id; // keyset: los updates no hacen que se salten filas pendientes.
    remaining -= rows.length;
    const updates = [];

    await pool(rows, CONCURRENCY, async (row) => {
      const result = await fetchPdpEan(row);
      requested++;
      if (result.ean) {
        updates.push({ id: row.id, display_name: row.display_name, raw: row.raw, ean: result.ean });
        found++;
      } else if (result.reason === 'sin URL de ficha') {
        withoutUrl++;
      } else {
        withoutEan++;
      }
      if (requested % 100 === 0) console.log(`[carrefour-ean] ${requested} PDP · ${found} EAN encontrados`);
      await sleep(120);
    });

    await upsert(updates);
    console.log(`[carrefour-ean] página ${rows.length} · +${updates.length} EAN${DRY_RUN ? ' (sin escribir)' : ''}`);
    if (PRODUCT_ID || rows.length < size) break;
  }

  console.log(`[carrefour-ean] FIN · ${requested} PDP · ${found} EAN · ${withoutEan} sin EAN/error · ${withoutUrl} sin URL`);
}

main().catch((error) => {
  console.error('[carrefour-ean] ERROR', error.message);
  process.exit(1);
});
