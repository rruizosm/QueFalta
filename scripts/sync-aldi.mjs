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
async function getNextData(path, { tries = 4 } = {}) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const html = await res.text();
        const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (m) { try { return JSON.parse(m[1]); } catch { /* html parcial */ } }
        return null; // 200 sin NEXT_DATA (página no-producto)
      }
      if ((res.status === 429 || res.status >= 500) && t < tries - 1) { await sleep(800 * (t + 1)); continue; }
      return null; // 404 u otros → sin datos
    } catch (e) {
      if (t < tries - 1) { await sleep(700 * (t + 1)); continue; }
      console.warn(`[aldi] ${path} falló: ${e.message}`);
    }
  }
  return null;
}

// Extrae los hits de Algolia embebidos (initialResults del índice de la página).
function hitsOf(nextData) {
  const pp = nextData?.props?.pageProps;
  const idx = pp?.algoliaConfig?.indexName;
  const results = idx && pp?.algoliaState?.initialResults?.[idx]?.results?.[0];
  return results?.hits || [];
}

// ── Enumeración de categorías hoja ───────────────────────────────────────────
// Los slugs de categoría salen de las URLs /productos/{n1}[/{n2}] embebidas en el
// __NEXT_DATA__ (menú + contenido). N1 = 2 barras, hoja = 3 barras.
const N1_RE = /\/productos\/[a-z0-9-]+(?![\/a-z0-9-])/g;
const LEAF_RE = /\/productos\/[a-z0-9-]+\/[a-z0-9-]+(?![\/a-z0-9-])/g;

async function enumerateLeaves() {
  const root = await getNextData('/productos.html');
  if (!root) throw new Error('no se pudo leer /productos.html');
  const n1s = [...new Set([...JSON.stringify(root).matchAll(N1_RE)].map((x) => x[0]))]
    .filter((p) => (p.match(/\//g) || []).length === 2);
  const leaves = new Set();
  for (const n1 of n1s) {
    const d = await getNextData(`${n1}.html`);
    if (d) for (const l of JSON.stringify(d).matchAll(LEAF_RE)) leaves.add(l[0]);
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
      const hits = d ? hitsOf(d) : [];
      if (!hits.length) { emptyLeaves++; }
      for (const h of hits) {
        if (h?.objectID == null) continue;
        const id = String(h.objectID);
        // Nombres de categoría desde la jerarquía del hit (lvl0 = N1, lvl1 = N1 > N2).
        const lvl0 = h.hierarchicalCategories?.lvl0?.[0];
        const lvl1 = h.hierarchicalCategories?.lvl1?.[0];
        if (lvl0 && !catName.has(n1)) catName.set(n1, lvl0);
        if (lvl1 && !catName.has(n2)) catName.set(n2, lvl1.split('>').pop().trim());
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

  if (DRY_RUN) {
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
    return;
  }

  // GUARDARRAÍL: scrape parcial → NO escribir (markStale borraría el catálogo vivo).
  if (rows.length < MIN_PRODUCTS) {
    throw new Error(`solo ${rows.length} productos (< ${MIN_PRODUCTS}); posible scrape parcial → abortado sin escribir`);
  }

  await upsert('aldi_categories', catRows);
  await upsert('aldi_products', rows);
  await markStale('aldi_products');
  await markStale('aldi_categories');
  await recordCatalogSync({ url: SUPABASE_URL, key: SERVICE_ROLE, store: 'aldi' });
  console.log('[aldi] OK');
}

main().catch((e) => { console.error('[aldi] ERROR', e); process.exit(1); });
