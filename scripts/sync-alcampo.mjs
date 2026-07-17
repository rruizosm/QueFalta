#!/usr/bin/env node
// Sincroniza el catálogo de Alcampo (compraonline.alcampo.es) → Supabase
// (CATÁLOGO + BÚSQUEDA + FICHA), 1×/semana. 13º espejo. SOLO castellano
// (compraonline.alcampo.es sirve es-ES; retailerConfig.languages = ['es-ES']).
//
// Plataforma Ocado (osp.tech) con API REST propia bajo el proxy `/api/*` → `/core-api`.
// Durante ~1 mes (jun–jul 2026) estuvo tras un AWS-WAF que exigía token de bot y
// obligaba a navegador headless; el 2026-07-13 el WAF desapareció y la API volvió a
// responder a fetch puro (con una cookie de sesión anónima). Piezas:
//   - Árbol:  GET /api/webproductpagews/v1/categories?decoration=false&categoryDepth=6
//             → nodos con retailerCategoryId (OC####), name, productCount, childCategories.
//   - Listado: GET /api/webproductpagews/v6/product-pages?retailerCategoryId=OC####
//             &tag=web,category-item&maxPageSize=100&maxProductsToDecorate=100
//             → productGroups[].decoratedProducts[] (producto completo) + cursor
//             metadata.nextPageToken. La paginación por token EXIGE la cookie de
//             sesión (VISITORID) → se arranca una sesión y se reusa en todo el run.
//   - Ficha:  GET /products/x/{retailerProductId} (301 → slug canónico), HTML SSR con
//             secciones h2 Ingredientes / Datos nutricionales (tabla 100 g) /
//             Características (tabla clave-valor: operador, denominación, país de
//             origen, EAN) / Almacenamiento y uso / Preparación y uso / Detalles.
//
// Estrategia:
//   1. Sesión: GET del HTML de una categoría → cookie VISITORID/global_sid.
//   2. Árbol: quedarse con las 10 RAÍCES de alimentación (por nombre) y recorrer sus
//      subárboles → categorías HOJA a paginar + mapa rid → {N1, N2} (para navegación
//      de 2 niveles en la app, como Aldi/Dia) y product_count por categoría.
//   3. Paginar cada HOJA (sesión + pageToken), dedup por productId. Paginar la RAÍZ
//      solo devolvía ~60 % del subárbol; por hoja se cubre entero.
//   4. Ficha incremental (como Dia/bonÀrea): solo la de productos sin ficha o con
//      detail_synced_at caducado; el resto arrastra la guardada.
//   5. Normalizar + upsert + markStale (soft-delete de lo ausente).
//
// Notas:
//  - Precio del envase = price.amount. €/unidad = unitPrice.{price.amount, unit}
//    ("fop.price.per.litre"/"…kilo"/"…unit") → base canónica l/kg/ud vía lib/price.mjs.
//  - EAN presente solo en ~20 % de las fichas (Características); NULL en el resto → el
//    comparador casa por nombre igualmente (como Aldi/Eroski).
//  - CATÁLOGO NACIONAL ÚNICO (una sola pasada, sin barrido por código postal): a
//    diferencia de Dia (tiendas físicas locales → surtido por CP, ver sync-dia.mjs),
//    Alcampo es plataforma Ocado con centro central. La web pide un CP, pero solo
//    determina si HAY reparto (deliverability) y el grupo de reparto; NO cambia el
//    surtido ni los precios. VERIFICADO en vivo 2026-07-14: fijando la región de la
//    sesión (deliverability → temporary-delivery-destination → sessions/proposition,
//    con X-CSRF-TOKEN) a Madrid, Barcelona, Sevilla, A Coruña, Baleares y Canarias,
//    el product-pages devuelve EXACTAMENTE los mismos productos y precios (incl.
//    Canarias: mismos precios, tax=TAX_INCLUDED, sin IGIC diferenciado). Por eso el
//    sync no barre zonas: "los productos de Madrid" = los de toda España.
//  - GUARDARRAÍL: si el nº de productos únicos cae por debajo de MIN_PRODUCTS
//    (scrape parcial / bloqueo), se ABORTA sin escribir para que markStale no
//    despublique el catálogo vivo.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      CONCURRENCY=6        (hojas paginadas en paralelo)
//      DRY_RUN=1            (no escribe en Supabase; imprime resumen)
//      MAX_LEAVES=N         (limita nº de hojas, para pruebas)
//      MIN_PRODUCTS=8000    (suelo del guardarraíl)
//      SKIP_DETAIL=1        (no tocar la ficha; preserva la existente)
//      DETAIL_CONCURRENCY=4 · DETAIL_TTL_DAYS=30 · DETAIL_MAX=N (tope de fichas/run)
import { canonicalPricePerUnit } from './lib/price.mjs';
import { markStale as markStaleBatched } from './lib/stale.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const MAX_LEAVES = process.env.MAX_LEAVES ? Number(process.env.MAX_LEAVES) : Infinity;
const MIN_PRODUCTS = Number(process.env.MIN_PRODUCTS || 8000);

// Ficha incremental (igual que Dia/bonÀrea): la ficha cambia poco frente al precio,
// así que solo se baja la de productos sin ficha o con detail_synced_at caducado.
const SKIP_DETAIL = process.env.SKIP_DETAIL === '1';
const DETAIL_CONCURRENCY = Number(process.env.DETAIL_CONCURRENCY || 4);
const DETAIL_TTL_DAYS = Number(process.env.DETAIL_TTL_DAYS || 30);
const DETAIL_MAX = process.env.DETAIL_MAX ? Number(process.env.DETAIL_MAX) : Infinity;

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
  process.exit(1);
}

const BASE = 'https://www.compraonline.alcampo.es';
const API = `${BASE}/api/webproductpagews`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const runStart = new Date().toISOString();

// Raíces de ALIMENTACIÓN (por nombre exacto del árbol). Se excluye bazar
// (Electrodomésticos, Tecnología, Hogar, Juguetes…) y promo (Folletos, Campañas).
const FOOD_ROOTS = new Set([
  'Frescos',
  'Leche, Huevos, Lácteos, Yogures y Bebidas vegetales',
  'Alimentación',
  'Desayuno y Merienda',
  'Congelados',
  'Comida Preparada',
  'Supermercado Ecológico',
  'Bebidas',
  'Sin Gluten / Sin Lactosa, Nutrición deportiva y Funcional',
  'Veganos',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const eurStr = (n) => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : null);

// ── Sesión ───────────────────────────────────────────────────────────────────
// La paginación por pageToken exige la cookie de sesión anónima. Se arranca con un
// GET del HTML de una categoría y se reusa la cookie en todas las peticiones.
let COOKIE = '';
async function seedSession() {
  const res = await fetch(`${BASE}/categories/x/alimentacion/OCC10`, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(30000),
  });
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  COOKIE = set.map((c) => c.split(';')[0]).join('; ');
  if (!COOKIE) console.warn('[alcampo] no se recibió cookie de sesión (¿WAF de vuelta?)');
}

async function getJson(path, { tries = 4 } = {}) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(`${API}${path}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json', ...(COOKIE ? { Cookie: COOKIE } : {}) },
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return await res.json();
      if ((res.status === 429 || res.status >= 500) && t < tries - 1) { await sleep(800 * (t + 1)); continue; }
      return null;
    } catch (e) {
      if (t < tries - 1) { await sleep(700 * (t + 1)); continue; }
      console.warn(`[alcampo] ${path} falló: ${e.message}`);
    }
  }
  return null;
}

// ── Árbol de categorías ──────────────────────────────────────────────────────
// Recorre las 10 raíces de alimentación y devuelve:
//   leaves: [{ rid, n1, n2 }]  hojas a paginar, con su raíz (N1) y su hijo-de-raíz (N2)
//   catName: rid → nombre visible          (para N1 y N2; el resto no se expone)
//   catParent: N2 rid → N1 rid
async function buildFoodTree() {
  const roots = await getJson('/v1/categories?decoration=false&categoryDepth=6');
  if (!Array.isArray(roots)) throw new Error('no se pudo leer el árbol de categorías');

  const foodRoots = [];
  const findRoots = (node) => {
    if (FOOD_ROOTS.has(node.name) && node.retailerCategoryId) foodRoots.push(node);
    else for (const c of node.childCategories || []) findRoots(c);
  };
  for (const n of roots) findRoots(n);

  const catName = new Map();
  const catParent = new Map();
  const leaves = [];

  for (const root of foodRoots) {
    const n1 = root.retailerCategoryId;
    catName.set(n1, root.name);
    // Cada hijo directo del root es un "N2" (el 2º nivel que ve la app). Se
    // recorre su subárbol; toda hoja hereda ese N2 (y el N1).
    for (const child of root.childCategories || []) {
      const n2 = child.retailerCategoryId;
      if (!n2) continue;
      catName.set(n2, child.name);
      catParent.set(n2, n1);
      walkLeaves(child, n1, n2, leaves);
    }
    // Un root sin hijos, o productos colgando directo del root: el propio root es hoja.
    if (!(root.childCategories || []).length) leaves.push({ rid: n1, n1, n2: n1 });
  }
  return { catName, catParent, leaves: leaves.slice(0, MAX_LEAVES) };
}

function walkLeaves(node, n1, n2, out) {
  const kids = node.childCategories || [];
  if (!kids.length) {
    if (node.retailerCategoryId) out.push({ rid: node.retailerCategoryId, n1, n2 });
    return;
  }
  for (const k of kids) walkLeaves(k, n1, n2, out);
}

// ── Paginación de una hoja ───────────────────────────────────────────────────
// Devuelve los decoratedProducts de TODA la hoja (siguiendo nextPageToken).
async function fetchLeafProducts(rid) {
  const products = [];
  let token = null;
  for (let page = 0; page < 60; page++) {
    const qs = `/v6/product-pages?retailerCategoryId=${encodeURIComponent(rid)}`
      + '&tag=web,category-item&maxPageSize=100&maxProductsToDecorate=100'
      + (token ? `&pageToken=${token}` : '');
    const j = await getJson(qs);
    if (!j) break;
    for (const g of j.productGroups || []) {
      for (const p of g.decoratedProducts || []) products.push(p);
    }
    token = j.metadata?.nextPageToken || null;
    if (!token) break;
    await sleep(40);
  }
  return products;
}

// ── Normalización de un producto decorado ────────────────────────────────────
const imageOf = (p) => p.image?.src || (p.images && p.images[0]?.src) || null;

function normalize(p, { n1, n2 }, catName) {
  const price = num(p.price?.amount);
  const ppu = p.unitPrice?.price?.amount != null
    ? canonicalPricePerUnit(p.unitPrice.price.amount, p.unitPrice.unit)
    : null;
  return {
    id: String(p.productId),                       // UUID estable del producto
    retailer_product_id: p.retailerProductId ?? null, // id corto (OC####) → PDP y ficha
    display_name: (p.name || '').trim(),
    brand: (p.brand || '').trim() || null,
    packaging: (p.packSizeDescription || '').trim() || null, // "9000ml", "10x41.5g"
    thumbnail: imageOf(p),
    category_id: n2 ?? n1,
    category_name: catName.get(n1) ?? null,        // N1 (para la zona de la lista)
    category_ids: [...new Set([n1, n2].filter(Boolean))],
    unit_price: price,
    price_format: price != null ? `${eurStr(price)} €` : null,
    price_per_unit: ppu?.value ?? null,
    price_per_unit_unit: ppu?.unit ?? null,
    available: p.available !== false,
    published: true,
    raw: p,
    synced_at: runStart,
  };
}

// ── Ficha (PDP HTML) ─────────────────────────────────────────────────────────
const DETAIL_COLS = ['description', 'ingredients', 'nutrition', 'conservation', 'preparation', 'denomination', 'operator', 'origin', 'ean'];

const decode = (s) => (s ?? '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&aacute;/g, 'á');
const strip = (s) => decode((s ?? '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<\/(p|div|tr|li|h\d|br)>/gi, '\n')
  .replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();

// Contenido de una sección h2 por título: todo lo que hay entre su </h2> y el
// siguiente <h2 (las secciones de la ficha son cajas <div _box_> hermanas, con
// divs anidados dentro → capturar "hasta el próximo h2" es robusto a esa anidación).
function sectionHtml(html, title) {
  const re = new RegExp(`<h2[^>]*>\\s*${title}\\s*</h2>([\\s\\S]*?)(?=<h2[\\s>]|<\\/main|$)`, 'i');
  const m = html.match(re);
  return m ? m[1] : null;
}

// Tabla clave→valor de "Características" (<tr><td>clave</td><td>valor</td></tr>).
function tablePairs(sectionHtmlStr) {
  const pairs = new Map();
  if (!sectionHtmlStr) return pairs;
  for (const row of sectionHtmlStr.matchAll(/<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)) {
    const k = strip(row[1]).replace(/\s+/g, ' ').trim();
    const v = strip(row[2]).trim();
    if (k && v) pairs.set(k, v);
  }
  return pairs;
}

function parseFicha(html) {
  const out = Object.fromEntries(DETAIL_COLS.map((c) => [c, null]));
  out.description = strip(sectionHtml(html, 'Detalles del producto')) || null;
  // La sección arranca con un <h4>Ingredientes:</h4> redundante → se quita.
  out.ingredients = (strip(sectionHtml(html, 'Ingredientes')) || '')
    .replace(/^\s*ingredientes:?\s*\n?/i, '').trim() || null;
  out.nutrition = strip(sectionHtml(html, 'Datos nutricionales')) || null;
  out.conservation = strip(sectionHtml(html, 'Almacenamiento y uso')) || null;
  out.preparation = strip(sectionHtml(html, 'Preparaci[oó]n y uso')) || null;

  const car = tablePairs(sectionHtml(html, 'Caracter[ií]sticas'));
  const opName = car.get('Nombre operador / Importador');
  const opAddr = car.get('Dirección operador / Importador');
  out.operator = [opName, opAddr].filter(Boolean).join('\n') || null;
  out.denomination = car.get('Denominación legal del alimento') || null;
  out.origin = car.get('País de origen') || null;
  const ean = car.get('EAN');
  out.ean = ean && /^\d{8,14}$/.test(ean.replace(/\s/g, '')) ? ean.replace(/\s/g, '') : null;
  return out;
}

// Descarga la ficha de un producto por su retailerProductId (PDP redirige al slug).
async function fetchDetail(rid, { tries = 3 } = {}) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(`${BASE}/products/x/${encodeURIComponent(rid)}`, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES', ...(COOKIE ? { Cookie: COOKIE } : {}) },
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return parseFicha(await res.text());
      if ((res.status === 429 || res.status >= 500) && t < tries - 1) { await sleep(700 * (t + 1)); continue; }
      return null;
    } catch (e) {
      if (t < tries - 1) { await sleep(600 * (t + 1)); continue; }
      console.warn(`[alcampo] ficha ${rid} falló: ${e.message.split('\n')[0]}`);
    }
  }
  return null;
}

// Lee la ficha ya guardada (id → fila) para decidir qué refrescar y arrastrar la del resto.
async function fetchExistingDetail() {
  const map = new Map();
  const cols = ['id', 'detail_synced_at', ...DETAIL_COLS].join(',');
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/alcampo_products?select=${cols}`, {
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

// Rellena la ficha de `rows` IN-PLACE: reutiliza la guardada si está al día y descarga
// (con tope DETAIL_MAX) la de los que faltan/caducaron. Garantiza claves uniformes.
async function fillDetail(rows) {
  const existing = DRY_RUN ? new Map() : await fetchExistingDetail();
  const ttlMs = DETAIL_TTL_DAYS * 86400000;
  const now = Date.now();
  for (const r of rows) { for (const c of DETAIL_COLS) r[c] = null; r.detail_synced_at = null; }
  const stale = [];
  for (const r of rows) {
    const prev = existing.get(r.id);
    const fresh = prev?.detail_synced_at && now - new Date(prev.detail_synced_at).getTime() < ttlMs;
    if (prev) { for (const c of DETAIL_COLS) r[c] = prev[c] ?? null; r.detail_synced_at = prev.detail_synced_at ?? null; }
    if (!fresh) stale.push(r);
  }
  const batch = stale.slice(0, DETAIL_MAX);
  console.log(`[alcampo] ficha: ${batch.length} a descargar · ${rows.length - batch.length} al día/arrastradas`);
  const queue = [...batch];
  let done = 0;
  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, async () => {
    for (;;) {
      const r = queue.shift();
      if (!r) break;
      const rid = r.retailer_product_id;
      if (rid) {
        const d = await fetchDetail(rid);
        if (d) {
          const got = DETAIL_COLS.some((c) => d[c]);
          const had = DETAIL_COLS.some((c) => r[c]);
          // Si el parseo no saca nada PERO ya había ficha, no se pisa (probable cambio del
          // SSR): se conserva y se reintenta otro día. Si nunca tuvo, se marca rastreada.
          if (got || !had) { Object.assign(r, d); r.detail_synced_at = runStart; }
        }
      }
      if (++done % 100 === 0) console.log(`[alcampo] ficha ${done}/${batch.length}`);
      await sleep(80);
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
const markStale = (table) => markStaleBatched({ url: SUPABASE_URL, key: SERVICE_ROLE, table, runStart });

async function main() {
  console.log(`[alcampo] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} conc=${CONCURRENCY}`);

  await seedSession();

  // 1-2) Árbol de alimentación → hojas + mapa de categorías.
  const { catName, catParent, leaves } = await buildFoodTree();
  console.log(`[alcampo] ${catName.size} categorías (N1+N2) · ${leaves.length} hojas de comida`);

  // 3) Paginar cada hoja (concurrencia) y acumular productos únicos por productId.
  const products = new Map();   // productId → fila normalizada
  const catCount = new Map();   // rid → nº de productos
  const q = [...leaves];
  let done = 0, emptyLeaves = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const leaf = q.shift();
      if (!leaf) break;
      const prods = await fetchLeafProducts(leaf.rid);
      if (!prods.length) emptyLeaves++;
      for (const p of prods) {
        if (p?.productId == null || !p.name) continue;
        const id = String(p.productId);
        if (!products.has(id)) {
          products.set(id, normalize(p, leaf, catName));
          for (const c of [leaf.n1, leaf.n2]) if (c) catCount.set(c, (catCount.get(c) ?? 0) + 1);
        }
      }
      if (++done % 50 === 0) console.log(`[alcampo] ${done}/${leaves.length} hojas · ${products.size} productos`);
      await sleep(25);
    }
  }));

  const rows = [...products.values()];

  // 4) Ficha incremental (salvo SKIP_DETAIL).
  if (!SKIP_DETAIL) await fillDetail(rows);
  else for (const r of rows) { for (const c of DETAIL_COLS) r[c] = undefined; }

  // 5) Filas de categorías (N1 + N2), con product_count.
  const catRows = [...catName.keys()].map((rid) => ({
    id: rid,
    name: catName.get(rid),
    parent_id: catParent.get(rid) ?? null, // null en N1
    product_count: catCount.get(rid) ?? 0,
    published: true,
    synced_at: runStart,
  }));

  console.log(`[alcampo] ${rows.length} productos únicos · ${catRows.length} categorías · ${emptyLeaves} hojas vacías`);

  if (DRY_RUN) {
    console.log('muestra (6):');
    for (const r of rows.slice(0, 6)) {
      console.log(`  ${r.display_name}  [${r.brand ?? '—'}]  ${r.price_format}  ${r.price_per_unit != null ? r.price_per_unit + ' €/' + r.price_per_unit_unit : '—'}  cat=${r.category_name ?? '—'}`);
    }
    const withFicha = rows.filter((r) => DETAIL_COLS.some((c) => r[c]));
    console.log('nulos →', {
      sin_precio: rows.filter((r) => r.unit_price == null).length,
      sin_ppu: rows.filter((r) => r.price_per_unit == null).length,
      sin_img: rows.filter((r) => !r.thumbnail).length,
      sin_categoria: rows.filter((r) => !r.category_ids.length).length,
      con_ficha: withFicha.length,
      con_ean: rows.filter((r) => r.ean).length,
    });
    return;
  }

  // GUARDARRAÍL: scrape parcial → NO escribir (markStale borraría el catálogo vivo).
  if (rows.length < MIN_PRODUCTS) {
    throw new Error(`solo ${rows.length} productos (< ${MIN_PRODUCTS}); posible scrape parcial → abortado sin escribir`);
  }

  await upsert('alcampo_categories', catRows);
  await upsert('alcampo_products', rows);
  await markStale('alcampo_products');
  await markStale('alcampo_categories');
  console.log('[alcampo] OK');
}

main().catch((e) => { console.error('[alcampo] ERROR', e); process.exit(1); });
