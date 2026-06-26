#!/usr/bin/env node
// Sincroniza el catálogo de Mercadona → Supabase (catálogo + búsqueda).
//
// MULTI-ALMACÉN: la API de Mercadona es POR ALMACÉN (`wh`); cada almacén tiene su
// propio catálogo. Para obtener TODOS los productos (incluidos los regionales, p.ej.
// aguas locales como "Font Agudes" que solo existen en Catalunya) este sync barre
// VARIOS almacenes —uno por provincia, resueltos dinámicamente por código postal—
// y une los productos por id (los ids son GLOBALES: un id = el mismo producto en
// toda España, o ausente). Guarda en `source_wh` un almacén que SÍ tiene cada
// producto para que el cliente pida su detalle sin 404.
//
// Pensado para correr 1×/semana (lunes, GitHub Action). Sin dependencias: fetch de Node 18+.
//
// Variables de entorno:
//   SUPABASE_URL            p.ej. https://xxxx.supabase.co            (obligatoria)
//   SUPABASE_SERVICE_ROLE   service_role key (¡secreta!)             (obligatoria)
//   MERCADONA_WHS           opcional, lista CSV de almacenes a barrer. Si se omite,
//                           se resuelven dinámicamente (1 CP por provincia).
//   MERCADONA_MAX_WHS       opcional, recorta la lista de almacenes (debug).
//   CONCURRENCY             opcional, subcategorías en paralelo por almacén (def 4).
//   DRY_RUN=1               no escribe en Supabase (solo cuenta e informa).
//
// Probar en local:  SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... DRY_RUN=1 MERCADONA_MAX_WHS=3 node scripts/sync-catalog.mjs

import { canonicalPricePerUnit } from './lib/price.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const WHS_ENV = process.env.MERCADONA_WHS;
const MAX_WHS = process.env.MERCADONA_MAX_WHS ? Number(process.env.MERCADONA_MAX_WHS) : Infinity;
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const DRY = process.env.DRY_RUN === '1';

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const MERCA = 'https://tienda.mercadona.es/api';
// mad1 PRIMERO: es el almacén por defecto del cliente, así los productos nacionales
// quedan con source_wh=mad1 y sus datos (precio) son los de Madrid. bcn1 para el
// catalán regional (ver pasada `ca`). El resto se resuelve por código postal.
const FORCED_WHS = ['mad1', 'bcn1'];
// Almacenes donde merece la pena la 2ª pasada en català (idioma regional).
const CA_WHS = ['mad1', 'bcn1'];

const runStart = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mercaHeaders = (lang) => ({
  Accept: 'application/json',
  'Accept-Language': lang === 'ca' ? 'ca-ES,ca;q=0.9,es;q=0.8' : 'es-ES,es;q=0.9',
  'User-Agent': 'Mozilla/5.0 (compatible; QueFaltaSync/1.0; +https://quefalta.es)',
});

async function merca(path, lang = 'es', wh = 'mad1') {
  const url = `${MERCA}${path}${path.includes('?') ? '&' : '?'}lang=${lang}&wh=${wh}`;
  // Reintentos con backoff: bajo carga (muchos almacenes) Mercadona devuelve 403/429
  // temporales. Esperar y reintentar recupera la inmensa mayoría.
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** attempt + Math.random() * 300);
    const res = await fetch(url, { headers: mercaHeaders(lang) });
    if (res.ok) return res.json();
    last = res.status;
    if (res.status !== 403 && res.status !== 429 && res.status < 500) break; // 404 etc.: no reintentar
  }
  throw new Error(`Mercadona ${last} en ${path} (wh=${wh})`);
}

// Pool sencillo: ejecuta `fn` sobre `items` con como mucho `n` en vuelo a la vez.
async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.max(1, n) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

// Resuelve el almacén (`wh`) de un código postal vía el endpoint de la web.
// El almacén viene en la cabecera de respuesta `x-customer-wh`.
async function resolvePostalCode(cp) {
  try {
    const res = await fetch(`${MERCA}/postal-codes/actions/change-pc/`, {
      method: 'POST',
      headers: { ...mercaHeaders('es'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_postal_code: cp }),
    });
    if (!res.ok) return null;
    return res.headers.get('x-customer-wh') || null;
  } catch {
    return null;
  }
}

// Lista de almacenes a barrer. Por defecto: mad1 + bcn1 (forzados) + uno por
// provincia (01..52), resuelto probando varios CP hasta que uno conteste.
async function resolveWarehouses() {
  if (WHS_ENV) {
    const list = WHS_ENV.split(',').map((s) => s.trim()).filter(Boolean);
    return [...new Set([...FORCED_WHS, ...list])].slice(0, MAX_WHS);
  }
  const found = new Set(FORCED_WHS);
  const suffixes = ['001', '002', '004', '080', '200', '500', '700'];
  for (let pp = 1; pp <= 52; pp++) {
    const prov = String(pp).padStart(2, '0');
    for (const suf of suffixes) {
      const wh = await resolvePostalCode(prov + suf);
      if (wh) { found.add(wh); break; }
      await sleep(40);
    }
  }
  return [...found].slice(0, MAX_WHS);
}

// upsert vía REST de Supabase (merge-duplicates = ON CONFLICT DO UPDATE por PK).
async function upsert(table, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`upsert ${table} ${res.status}: ${await res.text()}`);
  }
}

// Lo que no apareció en esta pasada se marca como no publicado (soft-delete).
async function markStale(table) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?synced_at=lt.${encodeURIComponent(runStart)}&published=eq.true`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ published: false, synced_at: runStart }),
    },
  );
  if (!res.ok) throw new Error(`markStale ${table} ${res.status}: ${await res.text()}`);
}

async function main() {
  console.log(`[sync] inicio ${runStart}${DRY ? ' (DRY_RUN)' : ''}`);

  // 0) Almacenes a barrer.
  const whs = await resolveWarehouses();
  console.log(`[sync] ${whs.length} almacenes: ${whs.join(', ')}`);

  // 1) Categorías (árbol GLOBAL, igual en todos los almacenes) → tabla de
  //    categorías + lista de N2 que hay que recorrer en cada almacén.
  const cats = (await merca('/categories/', 'es', whs[0])).results;
  const catRows = [];
  const n2 = [];
  for (const n1 of cats) {
    catRows.push({ id: n1.id, name: n1.name, parent_id: null, sort_order: n1.order, published: true, synced_at: runStart });
    for (const sub of n1.categories ?? []) {
      catRows.push({ id: sub.id, name: sub.name, parent_id: n1.id, sort_order: sub.order, published: sub.published ?? true, synced_at: runStart });
      n2.push({ id: sub.id, name: sub.name });
    }
  }
  console.log(`[sync] ${cats.length} categorías N1, ${n2.length} subcategorías N2`);

  // 2) Recorrer cada almacén × cada N2 y UNIR productos por id. El primer almacén
  //    que aporta un producto fija su `source_wh` (mad1 va primero → los nacionales
  //    quedan con datos de Madrid; los regionales con su almacén de zona).
  const products = new Map();
  for (const wh of whs) {
    const before = products.size;
    await pool(n2, CONCURRENCY, async (sub) => {
      await sleep(40 + Math.random() * 80); // educado con la API
      try {
        const detail = await merca(`/categories/${sub.id}/`, 'es', wh);
        for (const group of detail.categories ?? []) {
          for (const p of group.products ?? []) {
            if (!p.published) continue;
            if (products.has(String(p.id))) continue; // ya lo aportó otro almacén
            const pi = p.price_instructions ?? {};
            const ppu = canonicalPricePerUnit(pi.reference_price, pi.reference_format);
            products.set(String(p.id), {
              id: String(p.id),
              display_name: p.display_name,
              slug: p.slug ?? null,
              packaging: p.packaging ?? null,
              thumbnail: p.thumbnail ?? null,
              category_id: sub.id,
              category_name: sub.name,
              unit_price: pi.unit_price != null ? Number(pi.unit_price) : null,
              price_per_unit: ppu?.value ?? null,
              price_per_unit_unit: ppu?.unit ?? null,
              published: true,
              source_wh: wh,
              raw: p,
              synced_at: runStart,
            });
          }
        }
      } catch (e) {
        console.warn(`[sync] ${wh} subcategoría ${sub.id} falló: ${e.message}`);
      }
    });
    console.log(`[sync] almacén ${wh}: +${products.size - before} nuevos (total ${products.size})`);
  }

  // 2b) Segunda pasada en CATALÁN (bilingüe): solo en los almacenes de CA_WHS
  //     (idioma regional). Mismos ids/precios, solo cambia el texto → columna
  //     display_name_ca. Si un producto no aparece aquí, cae al castellano.
  const caNames = new Map();
  for (const wh of CA_WHS.filter((w) => whs.includes(w))) {
    await pool(n2, CONCURRENCY, async (sub) => {
      await sleep(40 + Math.random() * 80); // educado con la API
      try {
        const detail = await merca(`/categories/${sub.id}/`, 'ca', wh);
        for (const group of detail.categories ?? []) {
          for (const p of group.products ?? []) {
            if (p.display_name && !caNames.has(String(p.id))) caNames.set(String(p.id), p.display_name);
          }
        }
      } catch (e) {
        console.warn(`[sync] ${wh} subcategoría ${sub.id} (ca) falló: ${e.message}`);
      }
    });
  }
  console.log(`[sync] ${caNames.size} nombres en català`);
  for (const row of products.values()) {
    row.display_name_ca = caNames.get(row.id) ?? null;
  }

  const rows = [...products.values()];
  console.log(`[sync] ${rows.length} productos únicos`);

  if (rows.length === 0) throw new Error('0 productos: la API no devolvió nada (¿IP bloqueada / wh inválido?)');

  if (DRY) {
    const sample = rows.filter((r) => /font agudes|fuente dehesa|font natura/i.test(r.display_name)).slice(0, 5);
    console.log('[sync] DRY_RUN — no se escribe. Muestra de productos regionales:');
    for (const r of sample) console.log(`         ${r.id}  ${r.display_name}  (source_wh=${r.source_wh})`);
    return;
  }

  // 3) Volcar a Supabase y marcar lo que ya no existe.
  await upsert('mercadona_categories', catRows);
  await upsert('mercadona_products', rows);
  await markStale('mercadona_products');
  await markStale('mercadona_categories');

  console.log('[sync] OK');
}

main().catch((e) => {
  console.error('[sync] ERROR', e);
  process.exit(1);
});
