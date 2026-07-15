#!/usr/bin/env node
// Sincroniza el catálogo de Dia → Supabase (catálogo + búsqueda), 1×/día.
// Sin dependencias npm. Usa fetch nativo de Node 18+ (dia.es no tiene Cloudflare
// ni pide cookies para leer).
//
// dia.es es una SPA Vike (vite-plugin-ssr). Desde 2026-07-11 el sync usa su API
// REST JSON abierta (antes /api/v1/plp-back daba 422; ya NO). Es MÁS ROBUSTA que
// raspar el SSR (versionada /api/v1/, ~20 KB JSON/página vs ~150 KB de HTML) — la
// lección de Eroski (retiraron ?pageNumber=N y rompió el scraper) empuja a ello.
//
//   GET /api/v1/plp-back/plp?navigation=L1                (Origin/Referer de dia.es)
//   → { category_data.categories: árbol N1→N2 COMPLETO (31 N1, ~296 N2, con id+link+name),
//       plp_items[]: productos estructurados de la página (object_id, sku_id, display_name,
//         brand, image, prices{price, price_per_unit, measure_unit, strikethrough_price,
//         is_promo_price, discount_percentage}, units_in_stock, url),
//       pagination.pagination.total_pages }
//   navigation=L1 NO filtra: devuelve el CATÁLOGO ENTERO paginado (~5.500 productos,
//   ~278 páginas de 20). La categoría de cada producto se deriva de su `url`
//   (/frutas/platanos-y-bananas/p/42070 → N2 "platanos-y-bananas") casada contra
//   los `link` del árbol (verificado: 100% de las urls mapean).
//
// (Los endpoints filtrados por categoría —/api/v1/plp-back/l1/all/{N1}/reduced?
//  category_id={N2}— existen pero OMITEN `brand`, por eso se usa el catálogo
//  completo, que sí lo trae. /api/v1/search-back/search?q= es API de búsqueda
//  abierta con items estructurados + l1/l2_category_description — no usada aquí.)
//
// La FICHA (ingredientes/nutrición/…) sigue viniendo del SSR de cada producto
// (raw.url → vike_pageContext): la API de listado no la expone. Ver más abajo.
//
// Estrategia:
//   1. GET plp?navigation=L1 → árbol de categorías + total_pages.
//   2. Paginar el catálogo entero (page=1..total_pages) → todos los plp_items.
//      Membership = la N2 del `url` de cada producto + su N1 (mapa desde el árbol).
//   3. Normalizar + upsert en Supabase (soft-delete de lo ausente vía markStale).
//
// Notas:
//  - prices.price ya lleva la promo aplicada (strikethrough_price = original; flags
//    is_promo_price/is_club_price en raw). price_per_unit sigue a la promo.
//  - measure_unit viene en castellano ("KILO", "LITRO", "UNIDAD") → base canónica
//    l/kg/ud vía lib/price.mjs.
//  - Los precios son de la zona por defecto (CP 28041 Madrid, sesión anónima).
//  - La N1 "Novedades y recomendados" (L128) se salta: es marketing rotatorio, no
//    taxonomía; sus productos viven también en su categoría real.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      CONCURRENCY=4       (N2 procesadas en paralelo)
//      DRY_RUN=1           (no escribe en Supabase; imprime resumen)
//      MAX_PAGES=N         (limita nº de páginas del catálogo, para pruebas)
//      SKIP_N1=csv         (ids de N1 a excluir; por defecto "L128")
import { canonicalPricePerUnit } from './lib/price.mjs';
import { markStale as markStaleBatched } from './lib/stale.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);
// MAX_PAGES limita las páginas del catálogo entero (antes MAX_CATEGORIES, cuando
// se recorría por N2); se acepta el nombre viejo por compatibilidad.
const MAX_PAGES = process.env.MAX_PAGES ? Number(process.env.MAX_PAGES)
  : process.env.MAX_CATEGORIES ? Number(process.env.MAX_CATEGORIES) : Infinity;
const SKIP_N1 = new Set((process.env.SKIP_N1 ?? 'L128').split(',').map((s) => s.trim()).filter(Boolean));

// Ficha de producto (INGREDIENTES/NUTRICIÓN/CONSERVACIÓN…). Como en bonÀrea: la ficha
// cambia poco frente al precio (diario), así que NO se baja la de todos cada día, solo
// la de productos sin ficha o con detail_synced_at más viejo que DETAIL_TTL_DAYS; el
// resto arrastra la guardada. Ver supabase/migrations/dia_product_detail.sql.
const SKIP_DETAIL = process.env.SKIP_DETAIL === '1';     // 1 = no tocar la ficha (preserva la existente)
const DETAIL_CONCURRENCY = Number(process.env.DETAIL_CONCURRENCY || 4);
const DETAIL_TTL_DAYS = Number(process.env.DETAIL_TTL_DAYS || 30);
const DETAIL_MAX = process.env.DETAIL_MAX ? Number(process.env.DETAIL_MAX) : Infinity; // tope de fichas/ejecución

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
  process.exit(1);
}

const HOME = 'https://www.dia.es';
const runStart = new Date().toISOString();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// GET una página y devuelve su vike_pageContext parseado (el estado SSR completo).
async function getPageContext(path, { tries = 4 } = {}) {
  const url = `${HOME}${path}`;
  for (let t = 0; t < tries; t++) {
    try {
      // OJO: con `Accept: text/html` a secas el SSR de Dia devuelve 500; hace falta
      // el Accept completo de navegador (o ninguno).
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9',
        },
        signal: AbortSignal.timeout(40000),
      });
      if (res.ok) {
        const html = await res.text();
        const m = html.match(/<script id="vike_pageContext" type="application\/json">([\s\S]*?)<\/script>/);
        if (m) return JSON.parse(m[1]);
        console.warn(`[dia] ${path}: sin vike_pageContext (${html.length}b) (intento ${t + 1})`);
      } else {
        console.warn(`[dia] GET ${path} → ${res.status} (intento ${t + 1})`);
      }
    } catch (e) {
      console.warn(`[dia] GET ${path} falló: ${e.message} (intento ${t + 1})`);
    }
    await sleep(800 * (t + 1));
  }
  throw new Error(`no se pudo GET ${path}`);
}

// ── API REST JSON (listado + árbol) ──────────────────────────────────────────
// El BFF exige Origin/Referer de dia.es (si no, 403/redirect). navigation=L1 es
// obligatorio ("navigation in query is required") y devuelve el catálogo entero.
async function getApi(path, { tries = 4 } = {}) {
  const url = `${HOME}/api/v1/${path}`;
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA, Accept: 'application/json',
          Origin: HOME, Referer: `${HOME}/`, 'Accept-Language': 'es-ES,es;q=0.9',
        },
        signal: AbortSignal.timeout(40000),
      });
      if (res.ok) return await res.json();
      console.warn(`[dia] API ${path} → ${res.status} (intento ${t + 1})`);
    } catch (e) {
      console.warn(`[dia] API ${path} falló: ${e.message} (intento ${t + 1})`);
    }
    await sleep(800 * (t + 1));
  }
  throw new Error(`no se pudo GET api/${path}`);
}

// Slug de categoría de una url de producto: "/frutas/platanos-y-bananas/p/42070"
// → "frutas/platanos-y-bananas" (los segmentos antes de /p/).
const catSlugOfUrl = (url) => (url || '').replace(/\/p\/[^/]+\/?$/, '').split('/').filter(Boolean).join('/');
// Mismo slug desde un `link` del árbol ("/frutas/platanos-y-bananas/c/L2033" → idem).
const catSlugOfLink = (link) => (link || '').replace(/\/c\/[^/]+\/?$/, '').split('/').filter(Boolean).join('/');

// ── Normalización de un plp_item ─────────────────────────────────────────────
const eurStr = (n) => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : null);

function normalize(p) {
  const prices = p.prices ?? {};
  const price = typeof prices.price === 'number' ? prices.price : null;
  // measure_unit en castellano ("KILO"/"LITRO"/"UNIDAD") → lib/price.mjs ya
  // reconoce kilo(s)/litro(s)/unidad(es) en minúsculas.
  const ppu = canonicalPricePerUnit(prices.price_per_unit, (prices.measure_unit || '').toLowerCase());
  return {
    id: String(p.object_id),
    retailer_product_id: p.sku_id != null ? String(p.sku_id) : null,
    display_name: (p.display_name || '').trim(),
    brand: (p.brand || '').trim() || null,
    thumbnail: p.image ? `${HOME}${p.image}` : null,
    ean: null,
    unit_price: price,
    price_format: price != null ? `${eurStr(price)} €` : null,
    price_per_unit: ppu?.value ?? null,
    price_per_unit_unit: ppu?.unit ?? null,
    available: typeof p.units_in_stock === 'number' ? p.units_in_stock > 0 : true,
    published: true,
    raw: p,
    synced_at: runStart,
  };
}

// ── Ficha de producto (JSON estructurado del SSR) ────────────────────────────
// dia.es embebe el producto completo en el vike_pageContext de su página
// (raw.url → /…/p/<object_id>): ingredients.text (HTML, alérgenos en <strong>),
// nutritional_info (estructurada), instructions (conservación/preparación),
// manufacturer_contact, product_info. dia.es es solo castellano → no bilingüe.
const DETAIL_COLS = ['description', 'ingredients', 'nutrition', 'conservation', 'preparation', 'denomination', 'operator'];

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decodeEntities = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);

// HTML → texto: <br>/<\/p> a salto de línea, resto de tags fuera, entidades, espacios.
function htmlToText(html) {
  if (html == null) return null;
  const t = decodeEntities(
    String(html)
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  ).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return t || null;
}
const numEs = (n) => (typeof n === 'number' ? String(n).replace('.', ',') : n);

// nutritional_info estructurada → texto (un nutriente por línea, decimales con coma).
function nutritionText(ni) {
  const nv = ni?.nutritional_values;
  if (!nv) return null;
  const lines = [];
  const size = ni.nutri_size?.value;
  const unit = ni.nutri_measurement_unit?.value || 'g';
  lines.push(size ? `Valores medios por ${numEs(size)} ${unit}:` : 'Valores medios:');
  if (nv.energy_value != null) {
    const kj = nv.energy_value_kj != null ? `${numEs(nv.energy_value_kj)} ${nv.measure_unit_kj || 'kJ'} / ` : '';
    lines.push(`Valor energético ${kj}${numEs(nv.energy_value)} ${nv.measure_unit || 'kcal'}`);
  }
  for (const row of nv.values || []) {
    if (!row?.title) continue;
    let s = `${row.title} ${numEs(row.value)} ${row.measure_unit || ''}`.trim();
    const subs = (row.items || []).filter((it) => it?.title).map((it) => `${it.title} ${numEs(it.value)} ${it.measure_unit || ''}`.trim());
    if (subs.length) s += ` (${subs.join(', ')})`;
    lines.push(s);
  }
  return lines.length > 1 ? lines.join('\n') : null;
}

// Localiza el objeto de producto en el INITIAL_STATE (el que trae ingredients/nutrition).
function findProductObj(state) {
  const seen = new Set();
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 6 || seen.has(o)) return null;
    seen.add(o);
    if ('ingredients' in o || 'nutritional_info' in o || 'product_info' in o) return o;
    for (const k of Object.keys(o)) { const r = walk(o[k], depth + 1); if (r) return r; }
    return null;
  };
  return walk(state, 0);
}

// Producto del PDP → columnas de ficha.
function diaDetailColumns(p) {
  if (!p) return {};
  const pi = p.product_info ?? {};
  const ins = p.instructions ?? {};
  const mc = p.manufacturer_contact ?? {};
  const operator = [mc.manufacturer_contact_name, mc.manufacturer_contact_address]
    .map((s) => (s || '').trim()).filter(Boolean).join('\n') || null;
  return {
    description:  htmlToText(pi.description) || null,
    ingredients:  htmlToText(p.ingredients?.text),
    nutrition:    nutritionText(p.nutritional_info),
    conservation: htmlToText(ins.storage_instructions?.text),
    preparation:  htmlToText(ins.instructions_for_preparation?.text),
    denomination: htmlToText(pi.product) || null,
    operator,
  };
}

// Descarga la página del producto y devuelve sus columnas de ficha (todas null si no hay).
async function fetchDetail(url) {
  const ctx = await getPageContext(url);
  return diaDetailColumns(findProductObj(ctx.INITIAL_STATE ?? {}));
}

// Lee la ficha ya guardada (id → fila) para decidir qué refrescar y arrastrar la del
// resto. Paginado por Range (PostgREST corta a 1000).
async function fetchExistingDetail() {
  const map = new Map();
  const cols = ['id', 'detail_synced_at', ...DETAIL_COLS].join(',');
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/dia_products?select=${cols}`, {
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
  const existing = await fetchExistingDetail();
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
  console.log(`[dia] ficha: ${batch.length} a descargar · ${rows.length - batch.length} al día/arrastradas`);
  const queue = [...batch];
  let done = 0;
  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, async () => {
    for (;;) {
      const r = queue.shift();
      if (!r) break;
      const url = r.raw?.url;
      if (url) {
        try {
          const d = await fetchDetail(url);
          const got = DETAIL_COLS.some((c) => d[c]);
          const had = DETAIL_COLS.some((c) => r[c]); // r aún tiene lo previo arrastrado
          // Si el parseo no saca nada PERO ya había ficha, NO la pisamos (probable cambio
          // del SSR): se conserva y se reintenta otro día. Si nunca tuvo, se marca
          // rastreada igualmente (no reintentar a diario un producto sin ficha).
          if (got || !had) { Object.assign(r, d); r.detail_synced_at = runStart; }
        } catch (e) { console.warn(`[dia] ficha ${r.id} falló: ${e.message.split('\n')[0]}`); }
      }
      if (++done % 100 === 0) console.log(`[dia] ficha ${done}/${batch.length}`);
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
// Soft-delete por lotes con reintentos (lib/stale.mjs): el UPDATE único de toda
// la tabla moría por statement_timeout (57014) cuando la BD iba cargada.
const markStale = (table) => markStaleBatched({ url: SUPABASE_URL, key: SERVICE_ROLE, table, runStart });

// Una página del catálogo entero (navigation=L1). Devuelve { items, totalPages }.
async function catalogPage(page) {
  const j = await getApi(`plp-back/plp?navigation=L1${page > 1 ? `&page=${page}` : ''}`);
  // La API devuelve pagination.total_pages PLANO (el SSR lo anidaba en
  // pagination.pagination; no confundir). Tolera ambas por si acaso.
  const pg = j.pagination ?? {};
  return {
    items: j.plp_items ?? [],
    totalPages: pg.total_pages ?? pg.pagination?.total_pages ?? 1,
    tree: j.category_data?.categories ?? null,
  };
}

async function main() {
  console.log(`[dia] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} conc=${CONCURRENCY}`);

  // 1ª página: árbol de categorías (category_data) + total de páginas + primeros
  // productos. El árbol es N1→N2 (con id, name, link). Se saltan los N1 de SKIP_N1
  // (L128 "Novedades y recomendados" = marketing rotatorio).
  const first = await catalogPage(1);
  const n1s = (first.tree ?? []).filter((c) => c?.id && !SKIP_N1.has(c.id));
  if (n1s.length === 0) throw new Error('no encuentro category_data.categories en la API');

  // catRows (N1 + N2, deduplicados: cada N1 trae un hijo "Todo X" con el id del
  // padre) y mapa slug→N2id para asignar la categoría de cada producto por su url.
  const catRows = [], seen = new Set();
  const slugToN2 = new Map();
  for (const n1 of n1s) {
    if (!seen.has(n1.id)) {
      seen.add(n1.id);
      catRows.push({ id: n1.id, name: (n1.name || '').trim(), parent_id: null, url: n1.link || null, product_count: null, published: true, synced_at: runStart });
    }
    for (const n2 of n1.children ?? []) {
      if (!n2?.id || !n2.link || n2.id === n1.id) continue; // "Todo X" comparte id con el N1
      if (!seen.has(n2.id)) {
        seen.add(n2.id);
        catRows.push({ id: n2.id, name: (n2.name || '').trim(), parent_id: n1.id, url: n2.link, product_count: null, published: true, synced_at: runStart });
      }
      const slug = catSlugOfLink(n2.link);
      if (slug && !slugToN2.has(slug)) slugToN2.set(slug, n2.id);
    }
  }
  const totalPages = Math.min(first.totalPages, MAX_PAGES === Infinity ? first.totalPages : MAX_PAGES);
  console.log(`[dia] ${n1s.length} N1 · ${catRows.length} categorías · ${first.totalPages} páginas de catálogo (proceso ${totalPages})`);

  const catName = new Map(catRows.map((c) => [c.id, c.name]));
  const parentOf = new Map(catRows.map((c) => [c.id, c.parent_id]));
  const products = new Map();   // object_id → producto normalizado
  const membership = new Map(); // object_id → Set<id N2>

  const ingest = (items) => {
    for (const p of items) {
      if (p?.object_id == null) continue;
      const id = String(p.object_id);
      if (!products.has(id)) {
        const norm = normalize(p);
        if (!norm.display_name) continue;
        products.set(id, norm);
      }
      // Categoría por la url del producto (N2 del árbol). Si no mapea, sin categoría.
      const n2 = slugToN2.get(catSlugOfUrl(p.url));
      if (n2) {
        let set = membership.get(id);
        if (!set) membership.set(id, (set = new Set()));
        set.add(n2);
      }
    }
  };
  ingest(first.items);

  // Resto de páginas en paralelo (pool de workers sobre los números de página).
  const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  let done = 1;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const page = pages.shift();
      if (page == null) break;
      try { ingest((await catalogPage(page)).items); }
      catch (e) { console.warn(`[dia] página ${page} falló: ${e.message}`); }
      if (++done % 25 === 0) console.log(`[dia] ${done}/${totalPages} páginas · ${products.size} productos`);
      await sleep(80);
    }
  }));

  // category_ids = N2 observadas + su N1 (árbol de 2 niveles, como Bonpreu).
  const catCount = new Map();
  const rows = [];
  for (const [id, det] of products) {
    const leaves = [...(membership.get(id) ?? [])];
    const expanded = new Set();
    for (const leaf of leaves) {
      expanded.add(leaf);
      const p = parentOf.get(leaf);
      if (p) expanded.add(p);
    }
    const primary = leaves[0] ?? null;
    rows.push({
      ...det,
      category_ids: [...expanded],
      category_id: primary,
      category_name: primary ? catName.get(primary) ?? null : null,
    });
    for (const c of expanded) catCount.set(c, (catCount.get(c) ?? 0) + 1);
  }
  for (const c of catRows) c.product_count = catCount.get(c.id) ?? 0;
  console.log(`[dia] ${rows.length} productos únicos`);

  if (DRY_RUN) {
    console.log('muestra (5):');
    for (const r of rows.slice(0, 5)) console.log(`  ${r.id}  ${r.display_name}  [${r.brand ?? '—'}]  ${r.price_format}  ${r.price_per_unit != null ? r.price_per_unit + ' €/' + r.price_per_unit_unit : '—'}`);
    if (rows[0]) console.log('category_ids[0] (N2 + N1):', rows[0].category_ids.join(', '));
    console.log('nulos →', {
      sin_precio: rows.filter((r) => r.unit_price == null).length,
      sin_ppu: rows.filter((r) => r.price_per_unit == null).length,
      sin_img: rows.filter((r) => !r.thumbnail).length,
      sin_categoria: rows.filter((r) => r.category_ids.length === 0).length,
      con_promo: rows.filter((r) => r.raw.prices?.is_promo_price).length,
    });
    const unidades = new Set(rows.map((r) => r.raw.prices?.measure_unit).filter(Boolean));
    console.log('measure_units vistas:', [...unidades].join(', '));
    // Muestra de ficha: descarga la de los primeros productos para verificar el parseo.
    if (!SKIP_DETAIL) {
      for (const r of rows.slice(0, 3)) {
        const url = r.raw?.url;
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
  if (rows.length === 0) throw new Error('0 productos (¿cambió el SSR / vike_pageContext?)');

  // Ficha (INGREDIENTES/NUTRICIÓN/CONSERVACIÓN…): solo la de productos nuevos o caducados;
  // el resto arrastra la guardada. SKIP_DETAIL=1 la deja intacta.
  if (!SKIP_DETAIL) {
    try { await fillDetail(rows); }
    catch (e) { console.warn(`[dia] ficha: pasada omitida (${e.message.split('\n')[0]})`); }
  }

  await upsert('dia_categories', catRows);
  await upsert('dia_products', rows);
  await markStale('dia_products');
  await markStale('dia_categories');
  console.log('[dia] OK');
}

// Ejecuta main() solo al invocar el fichero como script (no al importarlo en tests).
import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error('[dia] ERROR', e); process.exit(1); });
}

export { diaDetailColumns, findProductObj, nutritionText, htmlToText };
