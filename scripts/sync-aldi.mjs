#!/usr/bin/env node
// Sincroniza el catálogo de Aldi España → Supabase (catálogo + búsqueda),
// 1×/semana. 12º espejo. SOLO castellano (aldi.es no es bilingüe).
//
// Aldi NO vende con reparto a domicilio en España, pero SÍ publica su surtido
// permanente con precios online. La web es Next.js y usa Algolia como buscador:
// cada página de categoría HOJA (`/productos/{n1}/{n2}.html`) trae los productos
// YA RENDERIZADOS EN EL SERVIDOR, embebidos en <script id="__NEXT_DATA__"> →
// props.pageProps.algoliaState.initialResults[<indexName>].results[0].hits, con
// hitsPerPage 1000 (una hoja entera en un solo fetch). Las páginas de categoría
// N1 (`/productos/{n1}.html`) NO embeben productos (solo mosaicos de subcategoría)
// → hay que recorrer las HOJAS. Es fetch puro, sin cookies ni navegador (patrón
// Carrefour/Dia); no hacen falta las credenciales de Algolia (van embebidas en el
// SSR ya resuelto).
//
// Estrategia:
//   1. GET /productos.html → slugs de N1 (del __NEXT_DATA__).
//   2. Por cada N1: GET /productos/{n1}.html → slugs de sus hojas (N2).
//   3. Por cada hoja: GET /productos/{n1}/{n2}.html → hits de Algolia embebidos.
//      Dedup por objectID; un producto puede estar en varias hojas (categoryIDs
//      es un array) → se acumulan todas sus categorías.
//   4. Árbol de categorías desde hierarchicalCategories (lvl0 = N1, lvl1 = N1 > N2).
//   5. Normalizar + upsert en Supabase (soft-delete de lo ausente vía markStale).
//
// Notas:
//  - Precio del envase = currentPrice.priceValue. €/unidad = currentPrice.
//    basePrice[0].{basePriceValue, basePriceScale} → canonicalPricePerUnit.
//  - SIN EAN: productReferences solo trae el nº de artículo interno de Aldi
//    (KVArticleNumber), no el código de barras → el comparador casa por nombre.
//  - Imagen: assets[primary].url es una URL de Scene7 sin extensión; se le añade
//    ?wid=400&fmt=webp para una miniatura ligera.
//  - Precios nacionales de península (Aldi avisa aparte de Canarias en el texto).
//  - GUARDARRAÍL: si el nº de productos únicos cae por debajo de MIN_PRODUCTS
//    (scrape parcial / soft-block), se ABORTA sin escribir para que markStale no
//    despublique el catálogo vivo.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      CONCURRENCY=6       (hojas descargadas en paralelo)
//      DRY_RUN=1           (no escribe en Supabase; imprime resumen)
//      MAX_LEAVES=N        (limita nº de hojas, para pruebas)
//      MIN_PRODUCTS=800    (suelo del guardarraíl)
import { canonicalPricePerUnit } from './lib/price.mjs';
import { markStale as markStaleBatched } from './lib/stale.mjs';
import { recordCatalogSync } from './lib/sync-status.mjs';
import { assertAldiSyncIntegrity } from './lib/aldi-sync-integrity.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const MAX_LEAVES = process.env.MAX_LEAVES ? Number(process.env.MAX_LEAVES) : Infinity;
const MIN_PRODUCTS = Number(process.env.MIN_PRODUCTS || 800);

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
  process.exit(1);
}

const BASE = 'https://www.aldi.es';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const runStart = new Date().toISOString();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ── Descarga + parseo del __NEXT_DATA__ de una página ────────────────────────
// Aldi devuelve ocasionalmente un HTML 200 intermedio (WAF, despliegue o página
// de error) que no contiene la hidratación de Next. No es una categoría vacía:
// reintentamos esos 200 igual que un 5xx y dejamos un diagnóstico útil si se
// agotan los intentos.
const nextDataFailures = [];
const NEXT_DATA_RE = /<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i;

async function getNextData(path, { tries = 4 } = {}) {
  let lastReason = 'respuesta sin datos';
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const html = await res.text();
        const m = html.match(NEXT_DATA_RE);
        if (m) {
          try { return JSON.parse(m[1]); } catch { lastReason = 'JSON de __NEXT_DATA__ inválido'; }
        } else {
          lastReason = `HTTP 200 sin __NEXT_DATA__ (${html.length} bytes)`;
        }
        // Un 200 sin hidratación no es una hoja vacía. Puede ser una respuesta
        // transitoria del WAF o una página a medio desplegar.
        if (t < tries - 1) { await sleep(800 * (t + 1)); continue; }
        break;
      }
      if ((res.status === 429 || res.status >= 500) && t < tries - 1) { await sleep(800 * (t + 1)); continue; }
      lastReason = `HTTP ${res.status}`;
      break;
    } catch (e) {
      lastReason = e.message;
      if (t < tries - 1) { await sleep(700 * (t + 1)); continue; }
    }
  }
  // El CMS referencia fragmentos como /productos/carousel.html que no son
  // categorías reales; sus 404 son esperados y no deben ensuciar el informe.
  if (lastReason !== 'HTTP 404' || path === '/productos.html') {
    nextDataFailures.push({ path, reason: lastReason });
  }
  return null;
}

// Extrae los hits de Algolia embebidos (initialResults del índice de la página).
function hitsOf(nextData) {
  const pp = nextData?.props?.pageProps;
  const idx = pp?.algoliaConfig?.indexName;
  const results = idx && pp?.algoliaState?.initialResults?.[idx]?.results?.[0];
  return Array.isArray(results?.hits) ? results.hits : null;
}

const categorySlug = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ROOT_LABELS = {
  'lacteos-y-huevos': 'Lácteos y huevos',
  'platos-preparados-y-pizza': 'Platos preparados y pizzas',
  'cafe-cacao-e-infusiones': 'Café, cacao e infusiones',
  'bebe-e-infantil': 'Bebé e infantil',
  'panaderia-y-bolleria': 'Panadería y bollería',
  'charcuteria': 'Charcutería',
  'limpieza-y-hogar': 'Limpieza y hogar',
};
const LEAF_LABELS = {
  'yogures-y-postres-lacteos': 'Yogures y postres lácteos',
  'sidra-sangria-y-tinto-de-verano': 'Sidra, sangría y tinto de verano',
  'salsas-dips-y-untables': 'Salsas, dips y untables',
  'papel-higienico-y-celulosa': 'Papel higiénico y celulosa',
  'el-horno': 'El Horno',
  'la-tabla': 'La Tabla',
  'lacura-nature': 'Lacura Nature',
  'moser-roth': 'Moser Roth',
};
const labelFromSlug = (slug) => slug.split('-').map((word, index) =>
  index ? word : word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

function categoryLabels(h, n1, n2) {
  const lvl0 = h.hierarchicalCategories?.lvl0 ?? [];
  const lvl1 = h.hierarchicalCategories?.lvl1 ?? [];
  const root = lvl0.find((name) => categorySlug(name) === n1);
  const leaf = lvl1.find((path) => {
    const parts = path.split('>').map((part) => part.trim());
    return categorySlug(parts[0]) === n1 && categorySlug(parts.at(-1)) === n2;
  });
  return {
    root: ROOT_LABELS[n1] ?? root ?? labelFromSlug(n1),
    leaf: LEAF_LABELS[n2] ?? leaf?.split('>').at(-1)?.trim() ?? labelFromSlug(n2),
  };
}

// ── Enumeración de categorías hoja ───────────────────────────────────────────
// Los slugs de categoría salen de las URLs /productos/{n1}[/{n2}] embebidas en el
// __NEXT_DATA__ (menú + contenido). N1 = 2 barras, hoja = 3 barras.
const N1_RE = /\/productos\/[a-z0-9-]+(?![\/a-z0-9-])/g;
const LEAF_RE = /\/productos\/[a-z0-9-]+\/[a-z0-9-]+(?![\/a-z0-9-])/g;
const CMS_FRAGMENTS = new Set(['open', 'text', 'banner', 'live', 'headline']);
const STALE_LINKS = new Set(['/productos/bebe-e-infantil/cuidados-e-higiene']);

async function enumerateLeaves() {
  const root = await getNextData('/productos.html');
  if (!root) throw new Error(`no se pudo leer /productos.html (${nextDataFailures.at(-1)?.reason ?? 'sin detalle'})`);
  const n1s = [...new Set([...JSON.stringify(root).matchAll(N1_RE)].map((x) => x[0]))]
    .filter((p) => (p.match(/\//g) || []).length === 2
      && !CMS_FRAGMENTS.has(p.split('/').at(-1))
      && p !== '/productos/carousel'
      && p !== '/productos/marcas-propias');
  const leaves = new Set();
  for (const n1 of n1s) {
    const d = await getNextData(`${n1}.html`);
    if (!d) nextDataFailures.push({ path: `${n1}.html`, reason: 'categoría inaccesible' });
    if (d) {
      const found = [...JSON.stringify(d).matchAll(LEAF_RE)].map((x) => x[0])
        .filter((l) => l.split('/')[2] === n1.split('/')[2]
          && !CMS_FRAGMENTS.has(l.split('/').at(-1)) && !STALE_LINKS.has(l));
      if (!found.length) nextDataFailures.push({ path: `${n1}.html`, reason: 'sin subcategorías' });
      for (const l of found) leaves.add(l);
    }
    await sleep(40);
  }
  return { n1s, leaves: [...leaves].slice(0, MAX_LEAVES) };
}

// ── Normalización de un hit de Algolia ───────────────────────────────────────
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const eurStr = (n) => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : null);

const imageOf = (h) => {
  const a = (h.assets || []).find((x) => x.type === 'primary') || (h.assets || [])[0];
  return a?.url ? `${a.url}?wid=400&fmt=webp` : null;
};

function normalize(h) {
  const currentPrice = h.currentPrice ?? {};
  const price = num(currentPrice.priceValue);
  const strikePrice = num(currentPrice.strikePrice?.strikePriceValue);
  const promoBasePrice = strikePrice != null && price != null && strikePrice > price
    ? strikePrice
    : null;
  const promo = (h.promotionPrices ?? []).find((p) => num(p?.strikePrice?.strikePriceValue) != null)
    ?? h.promotionPrices?.[0]
    ?? null;
  const promoName = [currentPrice.priceTagLabels?.promoText1, currentPrice.priceTagLabels?.promoText2]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' · ') || (promoBasePrice != null ? 'Oferta' : null);
  const unixEnd = Number(promo?.validUntil ?? currentPrice.validUntil);
  const promoEnd = promo?.validUntilLocalDate
    ?? (Number.isFinite(unixEnd) && unixEnd > 0 ? new Date(unixEnd * 1000).toISOString().slice(0, 10) : null);
  const bp = currentPrice.basePrice?.[0];
  const ppu = bp ? canonicalPricePerUnit(bp.basePriceValue, bp.basePriceScale) : null;
  return {
    id: String(h.objectID),
    retailer_product_id: h.productReferences?.[0]?.value ?? null, // nº de artículo Aldi (no EAN)
    display_name: (h.name || '').trim(),
    brand: (h.brandName || '').trim() || null,
    packaging: (h.salesUnit || '').trim() || null, // "1 l unidad", "140 g unidad"
    thumbnail: imageOf(h),
    unit_price: price,
    price_format: price != null ? `${eurStr(price)} €` : null,
    promo_name: promoBasePrice != null ? promoName : null,
    promo_base_price: promoBasePrice,
    promo_end: promoBasePrice != null ? promoEnd : null,
    price_per_unit: ppu?.value ?? null,
    price_per_unit_unit: ppu?.unit ?? null,
    available: h.isAvailable !== false,
    published: true,
    raw: h,
    synced_at: runStart,
    _cats: Array.isArray(h.categoryIDs) ? h.categoryIDs.map(String) : [],
    _hier: h.hierarchicalCategories || null,
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
async function countRows(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id${query}`, {
    method: 'HEAD',
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`recuento previo ${table}: HTTP ${res.status}`);
  const count = Number(res.headers.get('content-range')?.split('/').at(-1));
  if (!Number.isFinite(count)) throw new Error(`recuento previo ${table} sin Content-Range válido`);
  return count;
}
const markStale = (table) => markStaleBatched({ url: SUPABASE_URL, key: SERVICE_ROLE, table, runStart });

async function main() {
  console.log(`[aldi] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} conc=${CONCURRENCY}`);

  // 1-2) Enumerar hojas.
  const { n1s, leaves } = await enumerateLeaves();
  console.log(`[aldi] ${n1s.length} N1 · ${leaves.length} hojas`);

  // 3) Recorrer hojas (concurrencia) y acumular productos + categorías.
  const products = new Map();     // objectID → normalizado
  const catName = new Map();      // slug → nombre visible
  const catParent = new Map();    // slug hoja → slug N1
  const n1Slug = (leafPath) => leafPath.split('/')[2]; // /productos/{n1}/{n2} → n1

  const q = [...leaves];
  let done = 0, emptyLeaves = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const leaf = q.shift();
      if (!leaf) break;
      const n1 = n1Slug(leaf);
      const n2 = leaf.split('/')[3];
      const d = await getNextData(`${leaf}.html`);
      if (!d) nextDataFailures.push({ path: `${leaf}.html`, reason: 'hoja inaccesible' });
      const hits = d ? hitsOf(d) : null;
      if (d && !hits) nextDataFailures.push({ path: `${leaf}.html`, reason: 'sin resultados Algolia' });
      if (hits && !hits.length) { emptyLeaves++; }
      for (const h of hits ?? []) {
        if (h?.objectID == null) continue;
        const id = String(h.objectID);
        // Nombres de categoría desde la jerarquía del hit (lvl0 = N1, lvl1 = N1 > N2).
        const labels = categoryLabels(h, n1, n2);
        if (!catName.has(n1)) catName.set(n1, labels.root);
        if (!catName.has(n2)) catName.set(n2, labels.leaf);
        if (!catParent.has(n2)) catParent.set(n2, n1);
        if (!products.has(id)) {
          const norm = normalize(h);
          if (!norm.display_name) continue;
          norm._primaryLeaf = n2;
          products.set(id, norm);
        }
      }
      if (++done % 30 === 0) console.log(`[aldi] ${done}/${leaves.length} hojas · ${products.size} productos`);
      await sleep(30);
    }
  }));

  // 4) Membership: cada producto lleva su(s) categoryIDs (hojas) + los N1 padre.
  const catCount = new Map();
  const rows = [];
  for (const p of products.values()) {
    const leavesOfP = p._cats.length ? p._cats : (p._primaryLeaf ? [p._primaryLeaf] : []);
    const expanded = new Set();
    for (const leafSlug of leavesOfP) {
      expanded.add(leafSlug);
      const par = catParent.get(leafSlug);
      if (par) expanded.add(par);
    }
    const primary = p._primaryLeaf && catName.has(p._primaryLeaf) ? p._primaryLeaf : (leavesOfP[0] ?? null);
    delete p._cats; delete p._hier; delete p._primaryLeaf;
    rows.push({
      ...p,
      category_ids: [...expanded].filter((c) => catName.has(c)),
      category_id: primary,
      category_name: primary ? catName.get(primary) ?? null : null,
    });
    for (const c of expanded) if (catName.has(c)) catCount.set(c, (catCount.get(c) ?? 0) + 1);
  }

  // 5) Filas de categorías (N1 + hojas), con product_count.
  const catRows = [...catName.keys()].map((slug) => ({
    id: slug,
    name: catName.get(slug),
    parent_id: catParent.get(slug) ?? null, // null en N1
    product_count: catCount.get(slug) ?? 0,
    published: true,
    synced_at: runStart,
  }));

  console.log(`[aldi] ${rows.length} productos únicos · ${catRows.length} categorías · ${emptyLeaves} hojas vacías`);

  if (nextDataFailures.length) {
    const sample = nextDataFailures.slice(0, 5)
      .map(({ path, reason }) => `${path}: ${reason}`).join('; ');
    console.warn(`[aldi] ${nextDataFailures.length} páginas sin datos tras reintentos (${sample})`);
    if (DRY_RUN && process.env.DEBUG_FAILURES === '1') {
      for (const { path, reason } of nextDataFailures) console.warn(`[aldi] fallo ${path}: ${reason}`);
    }
  }

  if (DRY_RUN) {
    if (MAX_LEAVES === Infinity) assertAldiSyncIntegrity({
      products: rows.length, categories: catRows.length, roots: n1s.length,
      leaves: leaves.length, failedPages: nextDataFailures,
      previousProducts: 0, previousCategories: 0, minProducts: MIN_PRODUCTS,
    });
    console.log('muestra (6):');
    for (const r of rows.slice(0, 6)) {
      console.log(`  ${r.id}  ${r.display_name}  [${r.brand ?? '—'}]  ${r.price_format}  ${r.price_per_unit != null ? r.price_per_unit + ' €/' + r.price_per_unit_unit : '—'}  cat=${r.category_name ?? '—'}`);
    }
    if (rows[0]) console.log('category_ids[0]:', rows[0].category_ids.join(', '));
    console.log('nulos →', {
      sin_precio: rows.filter((r) => r.unit_price == null).length,
      sin_ppu: rows.filter((r) => r.price_per_unit == null).length,
      sin_img: rows.filter((r) => !r.thumbnail).length,
      sin_categoria: rows.filter((r) => r.category_ids.length === 0).length,
      con_oferta: rows.filter((r) => r.promo_base_price != null).length,
    });
    for (const id of ['charcuteria', 'limpieza-y-hogar']) {
      const category = catRows.find((row) => row.id === id);
      console.log(`[aldi] ${id}: ${category?.product_count ?? 0} productos · ${catRows.filter((row) => row.parent_id === id).length} subcategorías`);
    }
    return;
  }

  // Un 200 intermedio o una hoja inaccesible no puede convertirse en un borrado.
  const [previousProducts, previousCategories] = await Promise.all([
    countRows('aldi_products', '&published=eq.true'),
    countRows('aldi_categories'),
  ]);
  assertAldiSyncIntegrity({
    products: rows.length, categories: catRows.length, roots: n1s.length,
    leaves: leaves.length, failedPages: nextDataFailures,
    previousProducts, previousCategories, minProducts: MIN_PRODUCTS,
  });

  await upsert('aldi_categories', catRows);
  await upsert('aldi_products', rows);
  await markStale('aldi_products');
  await markStale('aldi_categories');
  await recordCatalogSync({ url: SUPABASE_URL, key: SERVICE_ROLE, store: 'aldi' });
  console.log('[aldi] OK');
}

main().catch((e) => { console.error('[aldi] ERROR', e); process.exit(1); });
