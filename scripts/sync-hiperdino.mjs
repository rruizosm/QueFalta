#!/usr/bin/env node
// Sincroniza el catálogo de HiperDino (Canarias) → Supabase (catálogo + búsqueda),
// 1×/semana. 13º espejo. SOLO castellano (hiperdino.es no es bilingüe).
//
// HiperDino es la cadena líder de Canarias. Su web es **Magento 2 con GraphQL
// 100% ABIERTO** (POST https://www.hiperdino.es/graphql, sin auth ni cookies ni
// navegador — el espejo más limpio de todos, patrón fetch puro). OJO NEGOCIO:
// solo opera en Canarias → precios con IGIC (no IVA); relevante solo para
// usuarios canarios (el filtrado por comunidad autónoma decide si se muestra).
//
// Estrategia (Magento):
//   1. Enumerar productos por las 13 ramas "de súper" de nivel-2 (INCLUDE): en
//      Magento las categorías top son ANCHOR → products(category_id: rama) agrega
//      TODOS los productos de su subárbol (verificado: Alimentación id 3 → 4.552).
//      Se pagina con pageSize alto (5000 entra de una en la rama mayor) y se
//      deduplica por sku (un producto está en varias ramas/promos).
//   2. Reconstruir el árbol N1→N2 (2 niveles, como Aldi) desde el `path` de las
//      categorías que referencia cada producto (path="1/2/3/58" → N1=path[2]=3,
//      N2=path[3]=58; nivel-4+ colapsa a su N2). Se ignoran las ramas de
//      promo/estacional (Ofertas folleto, San Valentín, Carnaval…) y bazar.
//   3. Normalizar + upsert en Supabase (soft-delete de lo ausente vía markStale).
//
// Notas:
//  - Precio = price_range.minimum_price.final_price.value. HiperDino trae también
//    regular_price (tachado de promo): se persiste como oferta SOLO cuando es
//    mayor que el final, nunca se deduce de cambios entre syncs.
//  - SIN EAN (el sku es un código interno de 18 dígitos, no código de barras) →
//    el comparador casa por nombre. SIN €/unidad (Magento no lo expone aquí).
//    SIN ficha (ingredientes/nutrición). El nombre ya incluye marca y formato.
//  - Imagen: image.url (cdn.hiperdino.es), ya lista para usar.
//  - GUARDARRAÍL: si el nº de productos únicos cae por debajo de MIN_PRODUCTS
//    (fallo de API / respuesta parcial), se ABORTA sin escribir para que
//    markStale no despublique el catálogo vivo.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      DRY_RUN=1           (no escribe en Supabase; imprime resumen)
//      MIN_PRODUCTS=5000   (suelo del guardarraíl)
import { markStale as markStaleBatched } from './lib/stale.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const MIN_PRODUCTS = Number(process.env.MIN_PRODUCTS || 10000);

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
  process.exit(1);
}

const GQL = 'https://www.hiperdino.es/graphql';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const runStart = new Date().toISOString();

// Ramas de súper (nivel-2) a incluir. Se dejan fuera las de promo/estacional
// (Ofertas folleto, San Valentín, Carnaval, Vuelta al cole…), bazar, tiempo
// libre, regalos solidarios y "Marca propia" (transversal: duplica productos).
const INCLUDE_BRANCHES = [
  '3',    // Alimentación
  '6',    // Bebidas
  '273',  // Bodega
  '35',   // Frescos
  '111',  // Congelados
  '9',    // Derivados lácteos y huevos
  '92',   // Bebé
  '257',  // Higiene y perfumería
  '14',   // Droguería y limpieza
  '246',  // Hogar
  '249',  // Mascotas
  '325',  // Ecológicos
  '516',  // Gourmet
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ── GraphQL POST con reintentos ──────────────────────────────────────────────
async function gql(query, { tries = 4 } = {}) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(GQL, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(40000),
      });
      if (res.ok) {
        const j = await res.json();
        if (j.errors?.length) throw new Error(`GraphQL: ${j.errors[0]?.message}`);
        return j.data;
      }
      if ((res.status === 429 || res.status >= 500) && t < tries - 1) { await sleep(1000 * (t + 1)); continue; }
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (t < tries - 1) { await sleep(800 * (t + 1)); continue; }
      throw e;
    }
  }
}

// ── Enumeración de productos por rama (anchor) ───────────────────────────────
// OJO: NO se pide el campo `image`/`small_image`/`thumbnail`: algún producto
// (p.ej. en Bodega) tiene la imagen rota y su resolver tira "Internal server
// error" para TODA la query. La miniatura se DERIVA del sku, que sigue un patrón
// determinista universal verificado (HTTP 200): cdn.hiperdino.es/.../{sku}_1.jpg.
// Cada producto trae sus categorías con `path` (jerarquía "1/2/3/115/545") y
// nombre de TODA la cadena de ancestros → el árbol N1→N2 se reconstruye sin una
// segunda fase de red.
const PROD_FIELDS = `
  sku name url_key
  price_range { minimum_price { final_price { value } regular_price { value } } }
  categories { id name path }`;

const CDN = 'https://cdn.hiperdino.es/catalog/product/x';
const imageOf = (sku) => `${CDN}/${sku}_1.jpg`;

async function fetchBranchProducts(branchId, onto) {
  const PAGE = 5000;
  let page = 1, pages = 1;
  do {
    const data = await gql(`{ products(filter:{category_id:{eq:"${branchId}"}}, pageSize:${PAGE}, currentPage:${page}){
      total_count page_info{ total_pages } items{ ${PROD_FIELDS} } } }`);
    const p = data?.products;
    if (!p) break;
    pages = p.page_info?.total_pages || 1;
    for (const it of p.items || []) {
      if (!it?.sku || !it?.name) continue;
      if (!onto.has(it.sku)) onto.set(it.sku, it);
    }
    page++;
    await sleep(120);
  } while (page <= pages);
}

// ── Normalización de un producto ─────────────────────────────────────────────
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const eurStr = (n) => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : null);

function normalize(it) {
  const price = num(it.price_range?.minimum_price?.final_price?.value);
  const regularPrice = num(it.price_range?.minimum_price?.regular_price?.value);
  const promoBasePrice = regularPrice != null && price != null && regularPrice > price
    ? regularPrice
    : null;
  return {
    id: String(it.sku),
    retailer_product_id: String(it.sku),          // código interno HiperDino (NO EAN)
    display_name: (it.name || '').trim(),
    brand: null,                                   // Magento no expone marca aparte; va en el nombre
    packaging: null,                               // el formato ("380 g") va en el nombre
    thumbnail: imageOf(it.sku),
    unit_price: price,
    price_format: price != null ? `${eurStr(price)} €` : null,
    promo_base_price: promoBasePrice,
    price_per_unit: null,                          // HiperDino no expone €/ud
    price_per_unit_unit: null,
    available: true,
    published: true,
    raw: it,
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
const markStale = (table) => markStaleBatched({ url: SUPABASE_URL, key: SERVICE_ROLE, table, runStart });

async function main() {
  console.log(`[hiperdino] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''}`);

  // 1) Enumerar productos por rama (anchor) + dedup por sku.
  const bySku = new Map();
  for (const b of INCLUDE_BRANCHES) {
    const before = bySku.size;
    await fetchBranchProducts(b, bySku);
    console.log(`[hiperdino] rama ${b}: +${bySku.size - before} (total ${bySku.size})`);
  }
  const items = [...bySku.values()];
  console.log(`[hiperdino] ${items.length} productos únicos`);

  // 2) Nombre de cada categoría (de la cadena de ancestros embebida en cada
  //    producto: id 3 "Alimentación", id 115 "Repostería", id 545 "Preparados…").
  const INCLUDE = new Set(INCLUDE_BRANCHES);
  const catNameById = new Map();
  for (const it of items) for (const c of it.categories || []) {
    const nm = (c.name || '').trim();
    if (nm) catNameById.set(String(c.id), nm);
  }

  // 3) Membership (árbol de 2 niveles, colapsando nivel-4+ a su N2) + filas de
  //    producto. Para cada categoría del producto: path="1/2/{n1}/{n2}/…" →
  //    N1=path[2] (rama nivel-2, debe estar en INCLUDE); N2=path[3] (nivel-3).
  const catParent = new Map(); // N2 → N1
  const catCount = new Map();
  const rows = [];
  for (const it of items) {
    const norm = normalize(it);
    if (!norm.display_name) continue;
    const all = new Set();
    let primaryN2 = null;
    for (const c of it.categories || []) {
      const p = String(c.path || '').split('/');
      if (p.length < 3) continue;
      const n1 = p[2];
      if (!INCLUDE.has(n1)) continue;
      all.add(n1);
      if (p.length >= 4) {
        const n2 = p[3];
        catParent.set(n2, n1);
        all.add(n2);
        if (!primaryN2) primaryN2 = n2;
      }
    }
    const primary = primaryN2 ?? [...all][0] ?? null;
    rows.push({
      ...norm,
      category_ids: [...all],
      category_id: primary,
      category_name: primary ? catNameById.get(primary) ?? null : null,
    });
    for (const c of all) catCount.set(c, (catCount.get(c) ?? 0) + 1);
  }

  // 4) Filas de categorías (N1 + N2), con product_count.
  const catRows = [...catCount.keys()]
    .filter((id) => catNameById.get(id))
    .map((id) => ({
      id,
      name: catNameById.get(id),
      parent_id: catParent.get(id) ?? null, // null en N1
      product_count: catCount.get(id) ?? 0,
      published: true,
      synced_at: runStart,
    }));

  console.log(`[hiperdino] ${rows.length} productos · ${catRows.length} categorías`);

  if (DRY_RUN) {
    console.log('muestra (6):');
    for (const r of rows.slice(0, 6)) {
      console.log(`  ${r.id}  ${r.display_name}  ${r.price_format ?? '—'}  cat=${r.category_name ?? '—'}`);
    }
    if (rows[0]) console.log('category_ids[0]:', rows[0].category_ids.map((c) => catNameById.get(c)).join(' · '));
    console.log('nulos →', {
      sin_precio: rows.filter((r) => r.unit_price == null).length,
      sin_img: rows.filter((r) => !r.thumbnail).length,
      sin_categoria: rows.filter((r) => r.category_ids.length === 0).length,
      con_tachado: rows.filter((r) => num(r.raw?.price_range?.minimum_price?.regular_price?.value) != null
        && r.raw.price_range.minimum_price.regular_price.value > (r.unit_price ?? 0)).length,
    });
    return;
  }

  // GUARDARRAÍL: respuesta parcial → NO escribir (markStale borraría el catálogo).
  if (rows.length < MIN_PRODUCTS) {
    throw new Error(`solo ${rows.length} productos (< ${MIN_PRODUCTS}); posible respuesta parcial → abortado sin escribir`);
  }

  await upsert('hiperdino_categories', catRows);
  await upsert('hiperdino_products', rows);
  await markStale('hiperdino_products');
  await markStale('hiperdino_categories');
  console.log('[hiperdino] OK');
}

main().catch((e) => { console.error('[hiperdino] ERROR', e); process.exit(1); });
