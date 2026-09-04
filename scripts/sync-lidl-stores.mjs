#!/usr/bin/env node
// Sincroniza el directorio ligero de tiendas Lidl España. La clave de la API
// procede del cliente web publico de Lidl, pero se inyecta por entorno para no
// fijar credenciales rotables en el repositorio.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE, LIDL_STORES_API_KEY
//      DRY_RUN=1, PAGE_SIZE=250, MIN_STORES=700, MIN_OPEN_STORES=680
import {
  assertLidlStoreDirectory,
  buildLidlExactPostalCandidates,
  normalizeLidlStore,
} from './lib/lidl-stores.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE;
const API_KEY = process.env.LIDL_STORES_API_KEY;
const DRY_RUN = process.env.DRY_RUN === '1';
const PAGE_SIZE = Math.min(250, Math.max(20, Number(process.env.PAGE_SIZE || 250)));
const MIN_STORES = Math.max(1, Number(process.env.MIN_STORES || 700));
const MIN_OPEN_STORES = Math.max(1, Number(process.env.MIN_OPEN_STORES || 680));
const RUN_START = new Date().toISOString();
const DIRECTORY_URL = 'https://live.api.schwarz/odj/stores-api/v2/myapi/stores-frontend/stores';

if (!API_KEY) throw new Error('Falta LIDL_STORES_API_KEY');
if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_KEY)) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
}

const chunks = (rows, size) => Array.from(
  { length: Math.ceil(rows.length / size) },
  (_, index) => rows.slice(index * size, index * size + size),
);

async function fetchDirectoryPage(offset, tries = 4) {
  const url = new URL(DIRECTORY_URL);
  url.searchParams.set('limit', String(PAGE_SIZE));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('country_code', 'ES');
  let lastError;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'x-apikey': API_KEY },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return response.json();
      lastError = new Error(`directorio offset=${offset}: HTTP ${response.status} ${await response.text()}`);
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
  }
  throw lastError ?? new Error(`directorio offset=${offset}: respuesta vacia`);
}

async function fetchAllStores() {
  const stores = [];
  let total = null;
  for (let offset = 0; total == null || offset < total; offset += PAGE_SIZE) {
    const payload = await fetchDirectoryPage(offset);
    const items = Array.isArray(payload?.items) ? payload.items : null;
    const reportedTotal = Number(payload?.meta?.total);
    if (!items || !Number.isFinite(reportedTotal) || reportedTotal < 1) {
      throw new Error(`directorio Lidl invalido en offset=${offset}`);
    }
    if (total == null) total = reportedTotal;
    if (reportedTotal !== total) throw new Error(`el total de tiendas cambio durante la paginacion (${total} -> ${reportedTotal})`);
    stores.push(...items);
    console.log(`[lidl-stores] ${stores.length}/${total}`);
    if (items.length === 0 && offset < total) throw new Error(`pagina vacia en ${offset}/${total}`);
  }
  if (stores.length !== total) throw new Error(`se esperaban ${total} tiendas y llegaron ${stores.length}`);
  return stores;
}

async function upsert(table, rows) {
  for (const batch of chunks(rows, 250)) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (!response.ok) throw new Error(`upsert ${table}: HTTP ${response.status} ${await response.text()}`);
  }
}

async function patch(url, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${url}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`PATCH ${url}: HTTP ${response.status} ${await response.text()}`);
}

async function main() {
  console.log(`[lidl-stores] inicio ${RUN_START}${DRY_RUN ? ' (DRY RUN)' : ''}`);
  const sourceStores = await fetchAllStores();
  const stores = sourceStores.map((store) => normalizeLidlStore(store, RUN_START));
  if (stores.some((store) => store == null)) {
    throw new Error(`${stores.filter((store) => store == null).length} tiendas no cumplen el contrato esperado`);
  }
  assertLidlStoreDirectory(stores, { minStores: MIN_STORES, minOpenStores: MIN_OPEN_STORES });
  const postalCandidates = buildLidlExactPostalCandidates(stores, RUN_START);
  const open = stores.filter((store) => store.selectable).length;
  console.log(`[lidl-stores] ${stores.length} tiendas · ${open} abiertas · ${new Set(stores.map((store) => store.postal_code)).size} CP · ${postalCandidates.length} candidatos exactos`);
  if (DRY_RUN) return;

  await upsert('lidl_stores', stores);
  // Libera el indice parcial de un unico default antes de recalcular el orden.
  await patch('lidl_postal_stores?match_kind=eq.exact', {
    is_default: false,
    published: false,
  });
  await upsert('lidl_postal_stores', postalCandidates);
  await patch(`lidl_stores?synced_at=lt.${encodeURIComponent(RUN_START)}`, {
    published: false,
    selectable: false,
  });
  await patch(`lidl_postal_stores?match_kind=eq.exact&synced_at=lt.${encodeURIComponent(RUN_START)}`, {
    is_default: false,
    published: false,
  });
  console.log('[lidl-stores] OK');
}

main().catch((error) => {
  console.error('[lidl-stores] ERROR', error);
  process.exit(1);
});
