#!/usr/bin/env node
// Sincroniza el catálogo de bonÀrea → Supabase (catálogo + búsqueda), 1×/día.
// Sin dependencias npm. Usa `curl` (presente en Windows 10+ y en los runners de CI).
//
// bonÀrea NO está tras Cloudflare y expone una API JSON propia (no hace falta parsear
// HTML ni navegador headless). Endpoint clave:
//
//   POST /es/shop/ShoppingBody   body: reference=<idNivell>   (form-urlencoded)
//   → { articles:[ {identifier,description,priceToPay,image,unitPrice,itsOnStock,…} ],
//       nivells:[ árbol de categorías anidado completo (idNivell, descripcio, children, url) ],
//       nivellActual, parents, … }
//
// Estrategia (estilo Carrefour "recorrer hojas"):
//   1. GET /es/shop → cookies de sesión + variable JS `groupsShopping` (para arrancar).
//   2. 1 POST ShoppingBody con cualquier referencia → `nivells` trae TODO el árbol.
//   3. Recorrer el árbol: cada HOJA (sin children) lista sus productos.
//      Por cada hoja → POST ShoppingBody(idNivell) → articles. La membership de un
//      producto son las hojas que lo listan (un producto puede estar en varias).
//   4. Normalizar + upsert en Supabase (soft-delete de lo ausente vía markStale).
//
// Notas:
//  - Los ids usan asterisco internamente ("13*5304", "13*300*010"); la web los muestra
//    con guion bajo en las URLs ("13_5304"). Guardamos el asterisco (es lo que pide el
//    carrito: POST /es/shop/ModifGetCart {idArticle:"13*5304",actionUnits:"1"}).
//  - El prefijo "13" es el centro (Guissona, el por defecto). Catálogo de ese centro.
//  - Los nodos contenedores devuelven 0 (o un agregado) y las hojas su propio listado;
//    por eso se piden solo las hojas (partición limpia del catálogo).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      LOCALE=es|ca        (idioma de los nombres; por defecto es)
//      CONCURRENCY=5       (hojas procesadas en paralelo)
//      DRY_RUN=1           (no escribe en Supabase; imprime resumen)
//      MAX_CATEGORIES=N    (limita nº de hojas, para pruebas)
//      KEEP_N1=csv|all     (categorías N1 a incluir; por defecto solo comida y bebida)
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalPricePerUnit } from './lib/price.mjs';
import { markStale as markStaleBatched } from './lib/stale.mjs';
const execFileP = promisify(execFile);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
// La app es bilingüe (como Mercadona): guardamos los DOS idiomas y la app elige
// según el idioma activo. La ruta del endpoint fija el idioma: `/es/shop` (primario,
// castellano → display_name/name) y `/ca/shop` (2ª pasada → display_name_ca/name_ca).
// Los ids de categoría/producto son estables entre idiomas → se casan por id. El
// catálogo se recorre DOS veces (es y ca); bonÀrea es rápido (curl), ~2× tiempo.
const PRIMARY = (process.env.LOCALE || 'es').toLowerCase();
const CA = 'ca';
const CONCURRENCY = Number(process.env.CONCURRENCY || 5);
const MAX_CATEGORIES = process.env.MAX_CATEGORIES ? Number(process.env.MAX_CATEGORIES) : Infinity;

// Ficha de producto (DESCRIPCIÓN/INGREDIENTES/NUTRICIÓN/ORIGEN…). La ficha cambia poco
// frente al precio (diario), así que NO se baja la de todos cada día: solo la de los
// productos sin ficha o con detail_synced_at más viejo que DETAIL_TTL_DAYS; el resto
// arrastra la ficha ya guardada. Ver supabase/migrations/bonarea_product_detail.sql.
const SKIP_DETAIL = process.env.SKIP_DETAIL === '1';     // 1 = no tocar la ficha (preserva la existente)
const DETAIL_CONCURRENCY = Number(process.env.DETAIL_CONCURRENCY || 6);
const DETAIL_TTL_DAYS = Number(process.env.DETAIL_TTL_DAYS || 30);
const DETAIL_MAX = process.env.DETAIL_MAX ? Number(process.env.DETAIL_MAX) : Infinity; // tope de fichas/ejecución

// Categorías raíz (N1) a incluir (whitelist). Por defecto solo comida y bebida:
// 13*300=Alimentació, 13*310=Cuinats, 13*320=Begudes. bonÀrea trae además bazar
// (Drogueria, Higiene, Perfumeria, Mascotes, Llar i jardí, Electrodomèstics, Roba,
// Informàtica, Joguines, Bricolatge, Automoció, Material ramader) que no interesa en
// una app de la compra → no se descarga. KEEP_N1='all' para todas, o CSV de ids.
const KEEP_N1_ENV = (process.env.KEEP_N1 ?? '13*300,13*310,13*320').trim();
const KEEP_N1 = KEEP_N1_ENV.toLowerCase() === 'all'
  ? null
  : new Set(KEEP_N1_ENV.split(',').map((s) => s.trim()).filter(Boolean));

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
  process.exit(1);
}

const HOME = 'https://www.bonarea-online.com';
const shopUrl = (locale) => `${HOME}/${locale}/shop`;
const IMG_BASE = 'https://images.bonarea.com';
const runStart = new Date().toISOString();
const JAR = join(mkdtempSync(join(tmpdir(), 'bonarea-')), 'cookies.txt');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ── HTTP vía curl (con cookie jar para mantener la sesión) ───────────────────
async function curlGet(url, { tries = 4 } = {}) {
  const args = ['-sSL', '--compressed', '--max-time', '30', '-A', UA, '-c', JAR, '-b', JAR, url];
  for (let t = 0; t < tries; t++) {
    try {
      const { stdout } = await execFileP('curl', args, { maxBuffer: 32 * 1024 * 1024 });
      if (stdout && stdout.length) return stdout;
    } catch (e) {
      console.warn(`[bonarea] GET ${url} falló: ${e.message.split('\n')[0]} (intento ${t + 1})`);
    }
    await sleep(700 * (t + 1));
  }
  throw new Error(`no se pudo GET ${url}`);
}

// POST form-urlencoded a ShoppingBody → JSON. `reference` puede llevar '*', que curl
// envía tal cual con --data-urlencode (sin que el shell lo expanda: execFile no usa shell).
async function shoppingBody(reference, locale = PRIMARY, { tries = 4 } = {}) {
  const args = [
    '-sS', '--compressed', '--max-time', '30', '-A', UA, '-c', JAR, '-b', JAR,
    '-H', 'X-Requested-With: XMLHttpRequest',
    '-H', 'Accept: application/json, text/javascript, */*; q=0.01',
    '--data-urlencode', `reference=${reference}`,
    `${shopUrl(locale)}/ShoppingBody`,
  ];
  for (let t = 0; t < tries; t++) {
    try {
      const { stdout } = await execFileP('curl', args, { maxBuffer: 64 * 1024 * 1024 });
      const body = stdout.replace(/^﻿/, '').trim();
      if (body.startsWith('{')) return JSON.parse(body);
      if (t === tries - 1) console.warn(`[bonarea] ShoppingBody ${reference}: respuesta no-JSON (${body.length}b)`);
    } catch (e) {
      console.warn(`[bonarea] ShoppingBody ${reference} falló: ${e.message.split('\n')[0]} (intento ${t + 1})`);
    }
    await sleep(700 * (t + 1));
  }
  throw new Error(`no se pudo ShoppingBody ${reference}`);
}

// ── Árbol de categorías ──────────────────────────────────────────────────────
// `groupsShopping=[...]` embebido en la página da una referencia válida para arrancar;
// luego `nivells` de cualquier respuesta de ShoppingBody trae el árbol anidado completo.
function jsonArrayAfter(html, varName) {
  const i = html.indexOf(varName);
  if (i < 0) return null;
  const s = html.indexOf('[', i);
  if (s < 0) return null;
  let depth = 0;
  for (let j = s; j < html.length; j++) {
    if (html[j] === '[') depth++;
    else if (html[j] === ']' && --depth === 0) {
      try { return JSON.parse(html.slice(s, j + 1)); } catch { return null; }
    }
  }
  return null;
}

async function bootstrapReference(locale = PRIMARY) {
  const html = await curlGet(shopUrl(locale));
  const gs = jsonArrayAfter(html, 'groupsShopping');
  const ref = gs?.[0]?.children?.[0]?.idNivell || gs?.[0]?.idNivell;
  if (!ref) throw new Error('no encuentro groupsShopping en /shop para arrancar');
  return ref;
}

// Recorre `nivells` (árbol anidado). Acumula filas de categoría y la lista de hojas.
function walkTree(nivells, parentId, catRows, leaves) {
  for (const n of nivells || []) {
    if (!n.identifier) continue;
    catRows.push({
      id: n.identifier, name: (n.descripcio || '').trim(), parent_id: parentId,
      url: n.url || null, product_count: null, published: true, synced_at: runStart,
    });
    const kids = Array.isArray(n.children) ? n.children : [];
    if (kids.length) walkTree(kids, n.identifier, catRows, leaves);
    else leaves.push({ id: n.identifier, name: (n.descripcio || '').trim() });
  }
}

// ── Normalización de un article ──────────────────────────────────────────────
const eurStr = (n) => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : null);

function normalize(a) {
  const img = Array.isArray(a.image) && a.image[0] ? `${IMG_BASE}/${a.image[0]}` : null;
  const price = typeof a.priceToPay === 'number' ? a.priceToPay : null;
  const unit = (a.euroUnit || '').trim(); // unidad del PRECIO DE VENTA: "€/u." | "€/kg" …
  // €/unidad canónico para comparar entre supers. La base real va en el sufijo de
  // a.unitPrice ("0,96 €/l" → "l"), NO en a.euroUnit: para un brik de 1 L (o un pollo
  // que se vende "por pieza") euroUnit dice "€/u." aunque unitPrice sea "€/kg"/"€/l".
  // unitPrice es el precio por unidad de MEDIDA regulado → la base honesta.
  const ppuBase = typeof a.unitPrice === 'string' ? a.unitPrice.split('/').pop() : null;
  const ppu = canonicalPricePerUnit(a.unitPrice, ppuBase);
  return {
    id: String(a.identifier),
    retailer_product_id: String(a.identifier),
    display_name: (a.description || '').trim(),
    thumbnail: img,
    ean13: null,
    unit_price: price,
    price_format: price != null ? `${eurStr(price)} ${unit}`.trim() : (a.unitPrice ?? null),
    price_per_unit: ppu?.value ?? null,
    price_per_unit_unit: ppu?.unit ?? null,
    available: a.itsOnStock !== false && a.isValid !== false,
    published: true,
    raw: a,
    synced_at: runStart,
  };
}

// ── Ficha de producto (HTML server-rendered) ─────────────────────────────────
// bonÀrea sirve la ficha en la página del producto (raw.urlFriendly), en el bloque
// .general-product-info como pares <strong>ETIQUETA</strong><p>valor</p> (con <br>
// dentro de los valores largos, p.ej. la tabla nutricional). Al final hay un párrafo
// de disclaimer legal ("*La información…") que se descarta.
const DETAIL_COLS = ['description', 'ingredients', 'allergens', 'nutrition', 'conservation', 'denomination', 'origin', 'operator'];

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&times;': '×' };
const decodeEntities = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);

// HTML → texto: <br>/<\/p> a salto de línea, resto de tags fuera, entidades, espacios.
function htmlToText(html) {
  const t = decodeEntities(
    String(html)
      // Fuera enlaces de navegación ("+ Receta: …") y su texto: no son info de producto.
      .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return t || null;
}
const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const stripDisclaimer = (s) => (s ? s.split(/\*\s*La informaci[oó]/i)[0].trim() || null : s);
const labelKey = (s) => {
  const t = htmlToText(s);
  // Fuera dos-puntos, asteriscos ("INGREDIENTES*:"), el punt volat ("AL·LÈRGENS") y el
  // apóstrofe ("NOM I ADREÇA DE L'OPERADOR" → "...LOPERADOR").
  return t ? stripAccents(t).toUpperCase().replace(/[:*·'’]/g, '').replace(/\s+/g, ' ').trim() : '';
};

// Parsea el bloque .general-product-info → { ETIQUETA_NORMALIZADA: valor }.
function parseDetailHtml(html) {
  const i = html.indexOf('general-product-info');
  if (i < 0) return {};
  // El bloque termina antes del modal de trazabilidad / footer.
  const end1 = html.indexOf('modal-trace', i);
  const end2 = html.indexOf('main-container__footer', i);
  const end = Math.min(end1 < 0 ? Infinity : end1, end2 < 0 ? Infinity : end2);
  // Fuera los encabezados de sección (<h4>CARACTERÍSTICAS</h4>, <h4>+ INFORMACIÓN</h4>):
  // van entre bloques y, si no, su texto se cuela al final del valor anterior.
  const block = html.slice(i, Number.isFinite(end) ? end : i + 8000).replace(/<h4[\s\S]*?<\/h4>/gi, '');
  const out = {};
  const re = /<strong>([\s\S]*?)<\/strong>([\s\S]*?)(?=<strong>|$)/gi;
  let m;
  while ((m = re.exec(block))) {
    const key = labelKey(m[1]);
    if (!key) continue;
    const val = stripDisclaimer(htmlToText(m[2]));
    if (val && !out[key]) out[key] = val;
  }
  return out;
}

// Mapea las etiquetas (es/ca) a las columnas de la ficha.
function detailToColumns(d) {
  const pick = (...keys) => { for (const k of keys) if (d[k]) return d[k]; return null; };
  return {
    description:  pick('DESCRIPCION', 'DESCRIPCIO'),
    ingredients:  pick('INGREDIENTES', 'INGREDIENTS'),
    allergens:    pick('ALERGENOS', 'ALLERGENS'),
    nutrition:    pick('INFORMACION NUTRICIONAL', 'INFORMACIO NUTRICIONAL', 'VALORES NUTRICIONALES', 'VALOR NUTRICIONAL'),
    conservation: pick('CONSERVACION', 'CONSERVACIO'),
    denomination: pick('DENOMINACION', 'DENOMINACIO'),
    origin:       pick('ORIGEN', 'PAIS DE ORIGEN', 'PAIS DORIGEN'),
    operator:     pick('NOMBRE I DIRECCION DEL OPERADOR', 'NOMBRE Y DIRECCION DEL OPERADOR', 'NOM I ADRECA DE LOPERADOR', 'OPERADOR'),
  };
}

// Descarga la página del producto y devuelve sus columnas de ficha (todas null si no hay).
async function fetchDetail(urlFriendly) {
  const html = await curlGet(urlFriendly);
  return detailToColumns(parseDetailHtml(html));
}

// Variantes catalanas de las columnas de ficha (description_ca, ingredients_ca…).
const DETAIL_COLS_CA = DETAIL_COLS.map((c) => `${c}_ca`);

// Lee la ficha ya guardada (id → fila con detail_synced_at + columnas) para decidir
// qué refrescar y arrastrar la del resto. Paginado por Range (PostgREST corta a 1000).
async function fetchExistingDetail() {
  const map = new Map();
  const cols = ['id', 'detail_synced_at', ...DETAIL_COLS, ...DETAIL_COLS_CA].join(',');
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bonarea_products?select=${cols}`, {
      headers: {
        apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`,
        Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items',
      },
    });
    if (!res.ok) throw new Error(`read detail ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    for (const r of batch) map.set(r.id, r);
    if (batch.length < PAGE) break;
  }
  return map;
}

// Rellena la ficha de `rows` IN-PLACE en castellano Y català: reutiliza la guardada si
// está al día, y descarga (con tope DETAIL_MAX) la de los que faltan/caducaron. La ficha
// catalana va por una urlFriendly distinta (/online/producte/…), que viene de la 2ª pasada
// (`urlCaById`). Garantiza que TODAS las filas llevan las MISMAS claves (PostgREST pone
// null en las ausentes del upsert).
async function fillDetail(rows, urlCaById = new Map()) {
  const existing = await fetchExistingDetail();
  const ttlMs = DETAIL_TTL_DAYS * 86400000;
  const now = Date.now();
  const ALL_COLS = [...DETAIL_COLS, ...DETAIL_COLS_CA];
  // Punto de partida: todas las filas con la ficha a null (claves uniformes).
  for (const r of rows) { for (const c of ALL_COLS) r[c] = null; r.detail_synced_at = null; }
  const stale = [];
  for (const r of rows) {
    const prev = existing.get(r.id);
    const fresh = prev?.detail_synced_at && now - new Date(prev.detail_synced_at).getTime() < ttlMs;
    if (prev) { for (const c of ALL_COLS) r[c] = prev[c] ?? null; r.detail_synced_at = prev.detail_synced_at ?? null; }
    if (!fresh) stale.push(r);
  }
  const batch = stale.slice(0, DETAIL_MAX);
  console.log(`[bonarea] ficha: ${batch.length} a descargar · ${rows.length - batch.length} al día/arrastradas`);
  const queue = [...batch];
  let done = 0;
  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, async () => {
    for (;;) {
      const r = queue.shift();
      if (!r) break;
      try {
        // Castellano (urlFriendly del artículo primario).
        const urlEs = r.raw?.urlFriendly;
        if (urlEs) {
          const d = await fetchDetail(urlEs);
          const got = DETAIL_COLS.some((c) => d[c]);
          const had = DETAIL_COLS.some((c) => r[c]); // r aún tiene lo previo arrastrado
          // Si el parseo no saca nada PERO ya había ficha, NO la pisamos (probable cambio
          // de HTML de bonÀrea): se conserva y se reintenta otro día. Si nunca tuvo, se
          // marca rastreada igualmente (no reintentar a diario un producto sin ficha).
          if (got || !had) { for (const c of DETAIL_COLS) r[c] = d[c]; r.detail_synced_at = runStart; }
        }
        // Català (urlFriendly de la 2ª pasada). Mismo guard, sobre las columnas _ca.
        const urlCa = urlCaById.get(r.id);
        if (urlCa) {
          const d = await fetchDetail(urlCa);
          const got = DETAIL_COLS.some((c) => d[c]);
          const had = DETAIL_COLS.some((c) => r[`${c}_ca`]);
          if (got || !had) for (const c of DETAIL_COLS) r[`${c}_ca`] = d[c];
        }
      } catch (e) { console.warn(`[bonarea] ficha ${r.id} falló: ${e.message.split('\n')[0]}`); }
      if (++done % 100 === 0) console.log(`[bonarea] ficha ${done}/${batch.length}`);
      await sleep(60);
    }
  }));
}

// ── Supabase REST ────────────────────────────────────────────────────────────
async function upsert(table, rows) {
  for (const c of chunk(rows, 500)) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(c),
    });
    if (!res.ok) throw new Error(`upsert ${table} ${res.status}: ${await res.text()}`);
  }
}
// Soft-delete por lotes con reintentos (lib/stale.mjs): el UPDATE único de toda
// la tabla moría por statement_timeout (57014) cuando la BD iba cargada.
const markStale = (table) => markStaleBatched({ url: SUPABASE_URL, key: SERVICE_ROLE, table, runStart });

// ── Procesar una hoja: pedir sus productos ───────────────────────────────────
async function processLeaf(leaf, products, membership, locale = PRIMARY) {
  const resp = await shoppingBody(leaf.id, locale);
  const arts = Array.isArray(resp.articles) ? resp.articles : [];
  for (const a of arts) {
    if (!a.identifier) continue;
    const id = String(a.identifier);
    if (!products.has(id)) {
      const norm = normalize(a);
      if (norm.display_name) products.set(id, norm);
    }
    let set = membership.get(id);
    if (!set) membership.set(id, (set = new Set()));
    set.add(leaf.id);
  }
}

async function main() {
  console.log(`[bonarea] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} locale=${PRIMARY}(+${CA}) conc=${CONCURRENCY}`);

  const ref = await bootstrapReference();
  const root = await shoppingBody(ref);
  const topLevel = (root.nivells || []).filter((n) => !KEEP_N1 || KEEP_N1.has(n.identifier));
  console.log(`[bonarea] N1 incluidas: ${topLevel.map((n) => n.descripcio).join(', ') || '(ninguna)'}`);
  const catRows = [], leaves = [];
  walkTree(topLevel, null, catRows, leaves);
  const todo = leaves.slice(0, MAX_CATEGORIES);
  console.log(`[bonarea] ${catRows.length} categorías · ${leaves.length} hojas (proceso ${todo.length})`);

  const catName = new Map(catRows.map((c) => [c.id, c.name]));
  const products = new Map();   // identifier → producto normalizado
  const membership = new Map(); // identifier → Set<idNivell hoja>

  const queue = [...todo];
  let done = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const leaf = queue.shift();
      if (!leaf) break;
      try { await processLeaf(leaf, products, membership); }
      catch (e) { console.warn(`[bonarea] hoja ${leaf.name} (${leaf.id}) falló: ${e.message}`); }
      if (++done % 25 === 0) console.log(`[bonarea] ${done}/${todo.length} hojas · ${products.size} productos`);
      await sleep(80);
    }
  }));

  // 2ª pasada (catalán): nombres de categoría (name_ca) y producto (display_name_ca),
  // casados por id (estable entre idiomas). El árbol completo viene en una respuesta
  // ShoppingBody; los productos se recorren por las MISMAS hojas que el primario.
  let catNameCa = new Map(), prodNameCa = new Map(), prodUrlCa = new Map();
  if (!DRY_RUN) {
    console.log(`[bonarea] 2ª pasada en /${CA}/ (nombres en català)…`);
    try {
      const refCa = await bootstrapReference(CA);
      const rootCa = await shoppingBody(refCa, CA);
      (function walk(nivells) {
        for (const n of nivells || []) {
          if (n.identifier) catNameCa.set(n.identifier, (n.descripcio || '').trim());
          if (Array.isArray(n.children)) walk(n.children);
        }
      })(rootCa.nivells || []);
      const prodsCa = new Map(), memCa = new Map();
      const queueCa = [...todo];
      let doneCa = 0;
      await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        for (;;) {
          const leaf = queueCa.shift();
          if (!leaf) break;
          try { await processLeaf(leaf, prodsCa, memCa, CA); }
          catch (e) { console.warn(`[bonarea:ca] hoja ${leaf.name} (${leaf.id}) falló: ${e.message}`); }
          if (++doneCa % 25 === 0) console.log(`[bonarea:ca] ${doneCa}/${todo.length} hojas · ${prodsCa.size} productos`);
          await sleep(80);
        }
      }));
      prodNameCa = new Map([...prodsCa].map(([id, p]) => [id, p.display_name]).filter(([, n]) => n));
      // urlFriendly catalana (/online/producte/…) por id → para bajar la ficha en català.
      prodUrlCa = new Map([...prodsCa].map(([id, p]) => [id, p.raw?.urlFriendly]).filter(([, u]) => u));
      console.log(`[bonarea] ${catNameCa.size} cat + ${prodNameCa.size} prod en català`);
    } catch (e) { console.warn(`[bonarea] 2ª pasada ${CA} falló: ${e.message}`); }
  }
  for (const c of catRows) c.name_ca = catNameCa.get(c.id) ?? null;

  // category_ids = hoja + TODOS sus ancestros. La app muestra un árbol de 2 niveles
  // (N1→N2, como Bonpreu/Carrefour) y consulta productos por el id de la N2; al incluir
  // los ancestros, un producto de "…*010*010*010" también responde a la N2 "…*010" y a
  // la N1 "13*300". product_count se cuenta por categoría sobre esa pertenencia expandida.
  const parentOf = new Map(catRows.map((c) => [c.id, c.parent_id]));
  const ancestorsOf = (leafId) => {
    const chain = [];
    for (let cur = leafId; cur; cur = parentOf.get(cur) ?? null) chain.push(cur);
    return chain;
  };
  const catCount = new Map();
  const rows = [];
  for (const [id, det] of products) {
    const leavesOf = [...(membership.get(id) ?? [])];
    const expanded = new Set();
    for (const leaf of leavesOf) for (const a of ancestorsOf(leaf)) expanded.add(a);
    const primary = leavesOf[0] ?? null; // la hoja más específica como categoría "primaria"
    rows.push({
      ...det,
      display_name_ca: prodNameCa.get(id) ?? null,
      category_ids: [...expanded],
      category_id: primary,
      category_name: primary ? catName.get(primary) ?? null : null,
    });
    for (const c of expanded) catCount.set(c, (catCount.get(c) ?? 0) + 1);
  }
  for (const c of catRows) c.product_count = catCount.get(c.id) ?? 0;
  console.log(`[bonarea] ${rows.length} productos únicos`);

  if (DRY_RUN) {
    console.log('muestra (5):');
    for (const r of rows.slice(0, 5)) console.log(`  ${r.id}  ${r.display_name}  ${r.price_format}  ${r.thumbnail ? '🖼' : '—'}`);
    if (rows[0]) console.log('category_ids[0] (hoja + ancestros):', rows[0].category_ids.join(', '));
    console.log('nulos →', {
      sin_precio: rows.filter((r) => r.unit_price == null).length,
      sin_ppu: rows.filter((r) => r.price_per_unit == null).length,
      sin_img: rows.filter((r) => !r.thumbnail).length,
      sin_categoria: rows.filter((r) => r.category_ids.length === 0).length,
    });
    // Muestra de ficha: descarga la de los primeros productos para verificar el parseo.
    if (!SKIP_DETAIL) {
      for (const r of rows.slice(0, 3)) {
        const url = r.raw?.urlFriendly;
        if (!url) continue;
        try {
          const d = await fetchDetail(url);
          console.log(`\nficha ${r.id} — ${r.display_name}`);
          for (const c of DETAIL_COLS) if (d[c]) console.log(`  ${c}: ${d[c].replace(/\n/g, ' / ').slice(0, 140)}`);
        } catch (e) { console.warn(`  ficha falló: ${e.message.split('\n')[0]}`); }
      }
    }
    return;
  }
  if (rows.length === 0) throw new Error('0 productos (¿cambió la API / referencia inválida?)');

  // Catálogo (precios/nombres/categorías) PRIMERO. La ficha es la parte lenta (baja la
  // página HTML de cada producto, ×2 idiomas) y puede agotar el tiempo del runner; antes
  // corría ANTES de este upsert, así que un timeout en la ficha tiraba el run ENTERO sin
  // guardar ni los precios. Persistimos ya el catálogo; la ficha va después en su propio
  // upsert: si su pasada se queda a medias, precios y productos nuevos siguen en BD.
  await upsert('bonarea_categories', catRows);
  await upsert('bonarea_products', rows);
  await markStale('bonarea_products');
  await markStale('bonarea_categories');

  // Ficha (DESCRIPCIÓN/INGREDIENTES/NUTRICIÓN/ORIGEN…): solo la de productos nuevos o
  // caducados; el resto arrastra la guardada. SKIP_DETAIL=1 la deja intacta. fillDetail
  // rellena las columnas de ficha IN-PLACE con claves uniformes → segundo upsert SOLO de
  // esas columnas (+ id, para resolver el conflicto): ligero y sin reenviar `raw`. Como las
  // filas ya existen (upsert anterior), este es siempre UPDATE; no toca synced_at/published.
  if (!SKIP_DETAIL) {
    try {
      await fillDetail(rows, prodUrlCa);
      const ALL_DETAIL = [...DETAIL_COLS, ...DETAIL_COLS_CA];
      const detailRows = rows.map((r) => {
        const o = { id: r.id, detail_synced_at: r.detail_synced_at ?? null };
        for (const c of ALL_DETAIL) o[c] = r[c] ?? null;
        return o;
      });
      await upsert('bonarea_products', detailRows);
    } catch (e) { console.warn(`[bonarea] ficha: pasada omitida (${e.message.split('\n')[0]})`); }
  }
  console.log('[bonarea] OK');
}

// Ejecuta main() solo al invocar el fichero como script (no al importarlo en tests).
import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error('[bonarea] ERROR', e); process.exit(1); });
}

export { parseDetailHtml, detailToColumns, htmlToText };
