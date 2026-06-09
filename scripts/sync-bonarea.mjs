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
const execFileP = promisify(execFile);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const LOCALE = (process.env.LOCALE || 'es').toLowerCase();
const CONCURRENCY = Number(process.env.CONCURRENCY || 5);
const MAX_CATEGORIES = process.env.MAX_CATEGORIES ? Number(process.env.MAX_CATEGORIES) : Infinity;

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
const SHOP = `${HOME}/${LOCALE}/shop`;
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
async function shoppingBody(reference, { tries = 4 } = {}) {
  const args = [
    '-sS', '--compressed', '--max-time', '30', '-A', UA, '-c', JAR, '-b', JAR,
    '-H', 'X-Requested-With: XMLHttpRequest',
    '-H', 'Accept: application/json, text/javascript, */*; q=0.01',
    '--data-urlencode', `reference=${reference}`,
    `${SHOP}/ShoppingBody`,
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

async function bootstrapReference() {
  const html = await curlGet(SHOP);
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
  const unit = (a.euroUnit || '').trim(); // "€/u." | "€/kg" …
  // €/unidad canónico: a.unitPrice ("1,17 €/l") da el valor; a.euroUnit, la base.
  const ppu = canonicalPricePerUnit(a.unitPrice, a.euroUnit);
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
async function markStale(table) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?synced_at=lt.${encodeURIComponent(runStart)}&published=eq.true`,
    { method: 'PATCH', headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ published: false, synced_at: runStart }) },
  );
  if (!res.ok) throw new Error(`markStale ${table} ${res.status}: ${await res.text()}`);
}

// ── Procesar una hoja: pedir sus productos ───────────────────────────────────
async function processLeaf(leaf, products, membership) {
  const resp = await shoppingBody(leaf.id);
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
  console.log(`[bonarea] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} locale=${LOCALE} conc=${CONCURRENCY}`);

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
    return;
  }
  if (rows.length === 0) throw new Error('0 productos (¿cambió la API / referencia inválida?)');

  await upsert('bonarea_categories', catRows);
  await upsert('bonarea_products', rows);
  await markStale('bonarea_products');
  await markStale('bonarea_categories');
  console.log('[bonarea] OK');
}

main().catch((e) => { console.error('[bonarea] ERROR', e); process.exit(1); });
