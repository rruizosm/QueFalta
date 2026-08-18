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
//   CONCURRENCY             opcional, subcategorías en paralelo por almacén (def 3).
//   MAX_CATEGORY_FAILURE_RATE opcional, máximo porcentaje de N2 fallidas antes de
//                           abortar sin escribir ni despublicar (def 3%).
//   DRY_RUN=1               no escribe en Supabase (solo cuenta e informa).
//
// Probar en local:  SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... DRY_RUN=1 MERCADONA_MAX_WHS=3 node scripts/sync-catalog.mjs

import { canonicalPricePerUnit } from './lib/price.mjs';
import { markStale as markStaleBatched } from './lib/stale.mjs';
import { PROVINCE_COMMUNITY } from './lib/province-community.mjs';
import { validGlobalGtin } from './lib/gtin.mjs';
import { recordCatalogSync } from './lib/sync-status.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const WHS_ENV = process.env.MERCADONA_WHS;
const MAX_WHS = process.env.MERCADONA_MAX_WHS ? Number(process.env.MERCADONA_MAX_WHS) : Infinity;
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const MAX_CATEGORY_FAILURE_RATE = Number(process.env.MAX_CATEGORY_FAILURE_RATE || 0.03);
const DRY = process.env.DRY_RUN === '1';
// Pasada de EAN: el código de barras solo está en el DETALLE por producto
// (/products/{id}/), no en los listados de categoría → pasada aparte, INCREMENTAL
// (el EAN es inmutable: solo se pide el de los productos que aún no lo tienen).
const SKIP_EAN = process.env.SKIP_EAN === '1';
const EAN_MAX = process.env.EAN_MAX ? Number(process.env.EAN_MAX) : Infinity; // tope de detalles/run (arranque en frío)
const EAN_CONCURRENCY = Number(process.env.EAN_CONCURRENCY || 6);

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
// Almacén de REFERENCIA: si un producto aparece aquí, se considera NACIONAL (está
// en el catálogo por defecto del cliente). Lo que NO está aquí es regional → se
// marca con la(s) CCAA donde sí aparece (ver computeRegions).
const REFERENCE_WH = 'mad1';
// Provincias forzadas de los almacenes de FORCED_WHS (no se resuelven por CP):
// mad1 sirve Madrid (28), bcn1 Barcelona (08). Las demás salen de resolvePostalCode.
const FORCED_WH_PROVINCES = { mad1: '28', bcn1: '08' };

const runStart = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mercaHeaders = (lang) => ({
  Accept: 'application/json',
  'Accept-Language': lang === 'ca' ? 'ca-ES,ca;q=0.9,es;q=0.8' : 'es-ES,es;q=0.9',
  'User-Agent': 'Mozilla/5.0 (compatible; QueFaltaSync/1.0; +https://quefalta.es)',
  'x-version': 'v9317',
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

// Lista de almacenes a barrer + el mapa almacén→provincias que sirve (para deducir
// las CCAA de los productos regionales). Por defecto: mad1 + bcn1 (forzados, con
// provincia conocida) + uno por provincia (01..52), resuelto probando varios CP
// hasta que uno conteste. Varias provincias pueden compartir almacén (un almacén
// sirve una zona), así que `whProvinces` es almacén → Set de provincias.
async function resolveWarehouses() {
  const whProvinces = new Map(); // wh -> Set(provincia '01'..'52')
  const note = (wh, prov) => {
    if (!wh) return;
    if (!whProvinces.has(wh)) whProvinces.set(wh, new Set());
    if (prov) whProvinces.get(wh).add(prov);
  };
  for (const [wh, prov] of Object.entries(FORCED_WH_PROVINCES)) note(wh, prov);

  if (WHS_ENV) {
    const list = WHS_ENV.split(',').map((s) => s.trim()).filter(Boolean);
    for (const wh of list) note(wh, null);
    const whs = [...new Set([...FORCED_WHS, ...list])].slice(0, MAX_WHS);
    return { whs, whProvinces };
  }

  const suffixes = ['001', '002', '004', '080', '200', '500', '700'];
  for (let pp = 1; pp <= 52; pp++) {
    const prov = String(pp).padStart(2, '0');
    for (const suf of suffixes) {
      const wh = await resolvePostalCode(prov + suf);
      if (wh) { note(wh, prov); break; }
      await sleep(40);
    }
  }
  const whs = [...new Set([...FORCED_WHS, ...whProvinces.keys()])].slice(0, MAX_WHS);
  return { whs, whProvinces };
}

// Almacén → comunidades que cubre (unión de las CCAA de sus provincias).
function buildWhCommunities(whProvinces) {
  const whCommunities = new Map(); // wh -> Set(CCAA)
  for (const [wh, provs] of whProvinces) {
    const set = new Set();
    for (const prov of provs) {
      const c = PROVINCE_COMMUNITY[prov];
      if (c) set.add(c);
    }
    whCommunities.set(wh, set);
  }
  return whCommunities;
}

// Dado el conjunto de almacenes donde aparece un producto, devuelve la lista de
// CCAA si es REGIONAL (no está en el almacén de referencia), o null si es nacional
// (está en mad1) o no se pudo atribuir a ninguna comunidad (fallback seguro: sin
// insignia ante la duda).
function computeRegions(whSet, whCommunities) {
  if (whSet.has(REFERENCE_WH)) return null; // nacional
  const communities = new Set();
  for (const wh of whSet) for (const c of whCommunities.get(wh) ?? []) communities.add(c);
  return communities.size ? [...communities].sort((a, b) => a.localeCompare(b, 'es')) : null;
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
// Por lotes con reintentos (lib/stale.mjs): el UPDATE único de toda la tabla
// moría por statement_timeout (57014) cuando la BD iba cargada.
const markStale = (table) => markStaleBatched({ url: SUPABASE_URL, key: SERVICE_ROLE, table, runStart });

async function fetchIdsWhere(filter, label) {
  const ids = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/mercadona_products?select=id&${filter}`, {
      headers: {
        apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`,
        Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items',
      },
    });
    if (!res.ok) throw new Error(`read ${label} ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    for (const r of batch) ids.add(String(r.id));
    if (batch.length < PAGE) break;
  }
  return ids;
}

async function main() {
  console.log(`[sync] inicio ${runStart}${DRY ? ' (DRY_RUN)' : ''}`);

  // 0) Almacenes a barrer (+ qué provincias sirve cada uno, para deducir las CCAA).
  const { whs, whProvinces } = await resolveWarehouses();
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
  let categoryRequests = 0;
  let categoryFailures = 0;
  // id → Set de almacenes donde aparece (para la exclusividad regional). Se acumula
  // aunque los DATOS del producto ya los aportara un almacén anterior.
  const whsOfProduct = new Map();
  for (const wh of whs) {
    const before = products.size;
    await pool(n2, CONCURRENCY, async (sub) => {
      await sleep(40 + Math.random() * 80); // educado con la API
      try {
        categoryRequests++;
        const detail = await merca(`/categories/${sub.id}/`, 'es', wh);
        for (const group of detail.categories ?? []) {
          for (const p of group.products ?? []) {
            if (!p.published) continue;
            const id = String(p.id);
            let whSet = whsOfProduct.get(id);
            if (!whSet) { whSet = new Set(); whsOfProduct.set(id, whSet); }
            whSet.add(wh);
            if (products.has(id)) continue; // los datos ya los aportó otro almacén
            const pi = p.price_instructions ?? {};
            const ppu = canonicalPricePerUnit(pi.reference_price, pi.reference_format);
            products.set(id, {
              id,
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
        categoryFailures++;
        console.warn(`[sync] ${wh} subcategoría ${sub.id} falló: ${e.message}`);
      }
    });
    console.log(`[sync] almacén ${wh}: +${products.size - before} nuevos (total ${products.size})`);
  }

  const categoryFailureRate = categoryRequests ? categoryFailures / categoryRequests : 1;
  console.log(`[sync] categorías: ${categoryRequests - categoryFailures}/${categoryRequests} correctas (${categoryFailures} fallidas)`);
  if (categoryFailureRate > MAX_CATEGORY_FAILURE_RATE) {
    throw new Error(`Demasiadas subcategorías fallidas (${categoryFailures}/${categoryRequests}, ${(categoryFailureRate * 100).toFixed(1)}%); se aborta antes de escribir o despublicar`);
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

  // 2c) Exclusividad regional: de los almacenes donde aparece cada producto. Si no
  //     está en el almacén de referencia (mad1) es regional → CCAA donde sí está.
  const whCommunities = buildWhCommunities(whProvinces);
  let regionalCount = 0;
  for (const row of products.values()) {
    row.regions = computeRegions(whsOfProduct.get(row.id) ?? new Set([row.source_wh]), whCommunities);
    if (row.regions) regionalCount++;
  }
  console.log(`[sync] ${regionalCount} productos exclusivos de alguna CCAA`);

  const rows = [...products.values()];
  console.log(`[sync] ${rows.length} productos únicos`);

  if (rows.length === 0) throw new Error('0 productos: la API no devolvió nada (¿IP bloqueada / wh inválido?)');

  if (DRY) {
    const regional = rows.filter((r) => r.regions?.length);
    console.log(`[sync] DRY_RUN — no se escribe. ${regional.length} productos regionales. Muestra:`);
    for (const r of regional.slice(0, 12)) {
      console.log(`         ${r.id}  ${r.display_name}  → ${r.regions.join(', ')} (source_wh=${r.source_wh})`);
    }
    return;
  }

  // 3) Volcar a Supabase y marcar lo que ya no existe.
  await upsert('mercadona_categories', catRows);
  await upsert('mercadona_products', rows);
  await markStale('mercadona_products');
  await markStale('mercadona_categories');

  // 4) EAN (para el enriquecimiento nutricional vía OpenFoodFacts por EAN). Solo está
  //    en el detalle por producto (/products/{id}/), que se pide con el source_wh del
  //    producto (los regionales dan 404 en mad1). INCREMENTAL: solo los que aún no lo
  //    tienen (backfill único + novedades semanales). La nutrición de Mercadona se
  //    extrae en su workflow específico desde la foto de etiqueta: NO usar su ausencia
  //    para reencolar miles de fichas en este sync. Va DESPUÉS del upsert de catálogo
  //    para que un fallo/timeout aquí no tire precios; su upsert reenvía display_name+raw
  //    (NOT NULL sin default) y NO unit_price (no disparar el trigger de precios).
  //    SKIP_EAN=1 la salta; EAN_MAX acota el arranque en frío para caber en el timeout.
  if (!SKIP_EAN) {
    try {
      const withEan = await fetchIdsWhere('ean=not.is.null', 'ean');
      const pending = rows.filter((r) => !withEan.has(r.id));
      const batch = pending.slice(0, EAN_MAX);
      console.log(`[sync] detalle EAN: ${withEan.size} con ean · ${pending.length} pendientes · ${batch.length} a pedir`);
      const eanRows = [];
      let done = 0;
      await pool(batch, EAN_CONCURRENCY, async (r) => {
        await sleep(30 + Math.random() * 50); // educado con la API
        try {
          const d = await merca(`/products/${r.id}/`, 'es', r.source_wh);
          const ean = validGlobalGtin(d?.ean);
          if (ean && !withEan.has(r.id)) eanRows.push({ id: r.id, display_name: r.display_name, raw: r.raw, ean });
        } catch { /* 404 puntual (producto retirado entre pasadas): se reintenta otro run */ }
        if (++done % 500 === 0) console.log(`[sync] detalle EAN ${done}/${batch.length} · ${eanRows.length} escritos`);
      });
      if (eanRows.length) await upsert('mercadona_products', eanRows);
      console.log(`[sync] detalle EAN: ${eanRows.length} escritos (${pending.length - batch.length} quedan para el próximo run)`);
    } catch (e) { console.warn(`[sync] detalle: pasada omitida (${e.message.split('\n')[0]})`); }
  }

  await recordCatalogSync({ url: SUPABASE_URL, key: SERVICE_ROLE, store: 'mercadona' });
  console.log('[sync] OK');
}

main().catch((e) => {
  console.error('[sync] ERROR', e);
  process.exit(1);
});
