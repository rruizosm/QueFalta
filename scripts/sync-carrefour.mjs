#!/usr/bin/env node
// Sincroniza el catálogo de Carrefour → Supabase (catálogo + búsqueda), 1×/día.
// Sin dependencias npm. NO necesita Playwright (sí `curl`, ver más abajo).
//
// Carrefour sirve las páginas de categoría (/supermercado/<slug>/catXXX/c) por HTTP
// plano, SIN Cloudflare, con los productos + el árbol de categorías embebidos en el
// SSR (JSON con "/" escapado como /). Estrategia (estilo Mercadona, "recorrer N2"):
//   1. GET /supermercado            → firstLevelCategories.items = N1 (10 categorías).
//   2. Por cada N1: GET su página   → secondLevelCategories.items = sus N2.
//   3. Por cada N2: paginar ?offset=0,24,…  hasta total_results, extraer productos
//      del SSR. Los productos listados por una N2 son sus productos → membership.
//   4. Normalizar + upsert en Supabase (soft-delete de lo ausente).
//
// (El buscador api.empathy.co da búsqueda en vivo, pero NO permite enumerar una
//  categoría por comodín — de ahí que el catálogo se construya por SSR.)
//
// La descarga usa `curl` (no el fetch de Node): Cloudflare devuelve 403 intermitente
// al fingerprint TLS de undici, mientras que curl pasa siempre. curl está presente
// en los runners ubuntu de GitHub y en Windows 10+.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      CONCURRENCY=4       (N2 procesadas en paralelo)
//      DRY_RUN=1           (no escribe en Supabase; imprime resumen)
//      MAX_CATEGORIES=N    (limita nº de N2, para pruebas)
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);
const MAX_CATEGORIES = process.env.MAX_CATEGORIES ? Number(process.env.MAX_CATEGORIES) : Infinity;

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
  process.exit(1);
}

const HOME = 'https://www.carrefour.es';
const PAGE_SIZE = 24;
const SKIP_N1 = new Set(['cat20968591']); // "Ofertas": no es taxonomía, duplica productos ya capturados en su N2 real.
const runStart = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Descarga una página de categoría con curl. Reintenta ante bloqueos transitorios
// (Cloudflare puede colar un 403/challenge esporádico). Una página buena pesa
// cientos de KB y contiene "product_id"/"firstLevelCategories".
// Cabeceras de navegador real: ayudan a pasar el scoring de bots de Cloudflare.
const BROWSER_HEADERS = [
  '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  '-H', 'Accept-Language: es-ES,es;q=0.9',
  '-H', 'Upgrade-Insecure-Requests: 1',
  '-H', 'Sec-Fetch-Dest: document',
  '-H', 'Sec-Fetch-Mode: navigate',
  '-H', 'Sec-Fetch-Site: none',
  '-H', 'Sec-Fetch-User: ?1',
];

async function fetchHtml(path, { tries = 5 } = {}) {
  // Algunas urls del SSR vienen absolutas (https://…) y otras relativas (/supermercado/…).
  const url = path.startsWith('http') ? path : `${HOME}${path}`;
  // -L: ?offset=0 hace 302 a la URL canónica (offset 0 es el default); offset>0 se respeta.
  // -w añade el código HTTP al final del stdout para diagnóstico.
  const args = ['-sSL', '--compressed', '--max-time', '30', '-A', UA, ...BROWSER_HEADERS, '-w', '\n__HTTP__%{http_code}', url];
  for (let t = 0; t < tries; t++) {
    try {
      const { stdout } = await execFileP('curl', args, { maxBuffer: 32 * 1024 * 1024 });
      const mi = stdout.lastIndexOf('\n__HTTP__');
      const status = mi >= 0 ? stdout.slice(mi + 9).trim() : '?';
      const html = mi >= 0 ? stdout.slice(0, mi) : stdout;
      if (html.includes('"product_id"') || html.includes('firstLevelCategories')) return html;
      if (t === tries - 1) console.warn(`[carrefour] ${path}: HTTP ${status}, ${html.length}b · ${html.replace(/\s+/g, ' ').trim().slice(0, 200)}`);
    } catch (e) {
      console.warn(`[carrefour] curl ${path} falló: ${e.message.split('\n')[0]} (intento ${t + 1})`);
    }
    await sleep(800 * (t + 1));
  }
  throw new Error(`no se pudo descargar ${path}`);
}

// ── Parseo del SSR ───────────────────────────────────────────────────────────
const unesc = (h) => h.replace(/\\u002F/g, '/');

// Objeto JSON balanceado que sigue a la clave "key": (p.ej. firstLevelCategories → {items:[…]}).
function jsonBlock(html, key) {
  const i = html.indexOf(`"${key}"`);
  if (i < 0) return null;
  const s = html.indexOf('{', i);
  if (s < 0) return null;
  let depth = 0;
  for (let j = s; j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}' && --depth === 0) {
      try { return JSON.parse(html.slice(s, j + 1)); } catch { return null; }
    }
  }
  return null;
}

// items de firstLevelCategories / secondLevelCategories que son categorías reales
// (url tipo /supermercado/.../catXXX/c). Descarta "Mis productos" (catmasterlist) y similares.
function categoryItems(html, key) {
  const block = jsonBlock(unesc(html), key);
  return (block?.items ?? []).filter((it) => it.id && /cat\d+\/c$/.test(it.url || ''));
}

function pagination(html) {
  // El SSR trae "pagination":{"offset":0,"page_size":24,"total_results":N}.
  const m = unesc(html).match(/"pagination":\{[^{}]*"total_results":(\d+)[^{}]*\}/);
  return { total: m ? Number(m[1]) : null };
}

// Productos del SSR: el objeto balanceado más pequeño que contiene product_id + sku_id.
// (Los productos son objetos planos salvo el sub-objeto "images"; exigir un único
//  product_id descarta contenedores que agrupan varios.)
function extractProducts(html) {
  const h = unesc(html);
  const out = new Map();
  const stack = [];
  for (let i = 0; i < h.length; i++) {
    const c = h[i];
    if (c === '{') stack.push(i);
    else if (c === '}') {
      const s = stack.pop();
      if (s == null) continue;
      const seg = h.slice(s, i + 1);
      if (seg.length < 4000 && seg.includes('"product_id"') && seg.includes('"sku_id"') &&
          (seg.match(/"product_id"/g) || []).length === 1) {
        try { const p = JSON.parse(seg); if (p.product_id && !out.has(p.product_id)) out.set(p.product_id, p); } catch {}
      }
    }
  }
  return [...out.values()];
}

// ── Normalización ────────────────────────────────────────────────────────────
// "15,40 €" / "1.234,56 €" → 15.4 / 1234.56
const eurNum = (s) => {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[\s€]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function normalize(p) {
  return {
    id: String(p.product_id),
    retailer_product_id: p.sku_id ?? null,
    display_name: (p.name || '').trim(),
    thumbnail: p.images?.desktop || p.images?.mobile || null,
    ean13: p.ean13 ?? null,
    unit_price: eurNum(p.price ?? p.app_price),
    price_format: p.price ?? p.app_price ?? null,
    available: p.units_in_stock == null ? true : Number(p.units_in_stock) > 0,
    published: true,
    raw: p,
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

// ── Árbol de categorías (N1 → N2) ────────────────────────────────────────────
async function fetchCategoryTree() {
  const home = await fetchHtml('/supermercado');
  const n1s = categoryItems(home, 'firstLevelCategories').filter((it) => !SKIP_N1.has(it.id));
  const catRows = [], n2s = [];
  for (const n1 of n1s) {
    catRows.push({ id: n1.id, name: n1.display_name, parent_id: null, url: n1.url, product_count: null, published: true, synced_at: runStart });
    const page = await fetchHtml(n1.url);
    for (const n2 of categoryItems(page, 'secondLevelCategories')) {
      if (n2s.some((x) => x.id === n2.id)) continue; // una N2 puede colgar de varios N1
      catRows.push({ id: n2.id, name: n2.display_name, parent_id: n1.id, url: n2.url, product_count: null, published: true, synced_at: runStart });
      n2s.push({ id: n2.id, name: n2.display_name, url: n2.url });
    }
    await sleep(120);
  }
  return { catRows, n2s };
}

// ── Procesar una N2: paginar por offset y recoger productos ──────────────────
async function processCategory(cat, products, membership, counts) {
  const seen = new Set();
  let total = Infinity;
  for (let offset = 0; offset < total; offset += PAGE_SIZE) {
    const html = await fetchHtml(`${cat.url}?offset=${offset}`);
    if (offset === 0) { const t = pagination(html).total; if (t != null) total = t; }
    const prods = extractProducts(html);
    let fresh = 0;
    for (const p of prods) {
      if (seen.has(p.product_id)) continue;
      seen.add(p.product_id);
      fresh++;
      if (!products.has(p.product_id)) {
        const n = normalize(p);
        if (n.display_name) products.set(p.product_id, n);
      }
      let set = membership.get(p.product_id);
      if (!set) membership.set(p.product_id, (set = new Set()));
      set.add(cat.id);
    }
    // Salir si la página no aporta nada nuevo (sólo se repiten promocionados) o vino vacía.
    if (prods.length === 0 || fresh === 0) break;
    await sleep(120);
  }
  counts.set(cat.id, seen.size);
}

async function main() {
  console.log(`[carrefour] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} conc=${CONCURRENCY}`);
  const { catRows, n2s } = await fetchCategoryTree();
  const cats = n2s.slice(0, MAX_CATEGORIES);
  console.log(`[carrefour] ${catRows.length} categorías (${n2s.length} N2; proceso ${cats.length})`);

  const catName = new Map(n2s.map((c) => [c.id, c.name]));
  const products = new Map();    // product_id → detalles normalizados
  const membership = new Map();   // product_id → Set<categoryId>
  const counts = new Map();       // categoryId → nº productos

  const queue = [...cats];
  let done = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const cat = queue.shift();
      if (!cat) break;
      try { await processCategory(cat, products, membership, counts); }
      catch (e) { console.warn(`[carrefour] ${cat.name} falló: ${e.message}`); }
      if (++done % 10 === 0) console.log(`[carrefour] ${done}/${cats.length} categorías · ${products.size} productos`);
    }
  }));

  // Adjuntar a cada producto sus categorías reales (las N2 que lo listan).
  const rows = [];
  for (const [id, det] of products) {
    const mem = [...(membership.get(id) ?? [])];
    rows.push({ ...det, category_ids: mem, category_id: mem[0] ?? null, category_name: mem[0] ? catName.get(mem[0]) ?? null : null });
  }
  // product_count por categoría (lo observado al paginar).
  for (const c of catRows) if (counts.has(c.id)) c.product_count = counts.get(c.id);
  console.log(`[carrefour] ${rows.length} productos únicos`);

  if (DRY_RUN) {
    console.log('productos por categoría:');
    for (const c of cats) console.log(`  ${c.name}: ${counts.get(c.id) ?? 0}`);
    console.log('nulos →', {
      sin_precio: rows.filter((r) => r.unit_price == null).length,
      sin_img: rows.filter((r) => !r.thumbnail).length,
      sin_categoria: rows.filter((r) => r.category_ids.length === 0).length,
    });
    return;
  }
  if (rows.length === 0) throw new Error('0 productos (¿bloqueo / cambio de SSR?)');

  await upsert('carrefour_categories', catRows);
  await upsert('carrefour_products', rows);
  await markStale('carrefour_products');
  await markStale('carrefour_categories');
  console.log('[carrefour] OK');
}

main().catch((e) => { console.error('[carrefour] ERROR', e); process.exit(1); });
