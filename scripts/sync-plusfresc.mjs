#!/usr/bin/env node
// Sincroniza el catálogo de Plusfresc → Supabase (catálogo + búsqueda + ficha),
// 1×/semana. Súper catalán de Lleida (Supsa Supermercats Pujol, ~77 tiendas;
// 8 centros online, todos en Catalunya). 15º espejo.
//
// La tienda online (compra.plusfresc.cat, SPA Angular) usa una API REST ASP.NET
// abierta en https://wscompra.plusfresc.cat/api/ que responde a fetch puro con
// un JWT de INVITADO (POST loginGuest/{centro}, caduca a los 30 min → re-login
// en 401). Sin cookies ni navegador: el sync más simple junto con Condis.
//
// Estrategia (verificada en vivo 2026-07-15):
//   1. POST loginGuest/{CENTER} → JWT. Precios/surtido son POR CENTRO; se usa
//      el 12 (Lleida Cap Pont, su casa matriz) como referencia.
//   2. GET categories/tree/{CENTER}/Root → árbol ENTERO bilingüe (es/ca) en una
//      petición. Ids numéricos jerárquicos por prefijo: N1 "09" → N2 "0901" →
//      N3 "090110" → hoja "09011001". Las ramas de marketing (PromoHighlight,
//      Oferta2, CategoXXX_…) llevan id NO numérico → fuera del árbol navegable.
//   3. GET products/category/Root/{CENTER} → TODO el catálogo en UNA petición
//      (~7.5k filas). Cada fila trae nombre es+ca (texts type 4), marca, precio
//      (value_cents), €/unidad (value_x_unit + unit_measure), imagen y su hoja
//      (filter_id). Un producto puede venir repetido (varias hojas + copias de
//      Oferta2/promos) → dedup por item_id quedándose la copia de hoja numérica
//      y uniendo la membership de todas.
//   4. Ficha incremental (patrón bonÀrea): GET productdetails/files/{item}/{lang}
//      → ingredientes/alérgenos/nutricionales/conservación/descripción, en 2
//      pasadas es/ca. Solo se descarga la de productos sin ficha o con
//      detail_synced_at > DETAIL_TTL_DAYS; el resto arrastra la guardada.
//   5. Normalizar + upsert en Supabase (soft-delete de lo ausente vía markStale).
//
// Notas:
//  - Las copias de "Oferta2" traen new_value_cents/end_date (precio de oferta):
//    no cambian unit_price del catálogo normal, pero se guardan por centro para
//    la pantalla Ofertas. Nunca se infieren de cambios entre syncs.
//  - unit_measure: L/Kg/Un/Do(tzena)/M/?/'' → canonicalPricePerUnit solo entiende
//    l/kg/ud/docena; el resto queda sin €/unidad canónico.
//  - Sin EAN (item_id es interno) → comparador por nombre, como casi todos.
//  - Imágenes: https://compra.plusfresc.cat/ImatgesProductes/{image_url}.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      PLUSFRESC_CENTER=12  (centro de referencia)
//      DRY_RUN=1            (no escribe en Supabase; imprime resumen)
//      MAX_PRODUCTS=N       (limita nº de productos, para pruebas)
//      SKIP_DETAIL=1        (no tocar la ficha; preserva la existente)
//      DETAIL_CONCURRENCY=6 DETAIL_TTL_DAYS=30 DETAIL_MAX=N (tope fichas/run)
//      PRODUCT_UPSERT_BATCH=50 (filas por escritura de productos en Supabase)
import { canonicalPricePerUnit } from './lib/price.mjs';
import { markStale as markStaleBatched } from './lib/stale.mjs';
import { recordCatalogSync } from './lib/sync-status.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const MAX_PRODUCTS = process.env.MAX_PRODUCTS ? Number(process.env.MAX_PRODUCTS) : Infinity;
const CENTER = process.env.PLUSFRESC_CENTER || '12';
const ALL_CENTERS = ['12', '3', '17', '33', '36', '58', '61', '110'];
const SKIP_DETAIL = process.env.SKIP_DETAIL === '1';
const DETAIL_CONCURRENCY = Number(process.env.DETAIL_CONCURRENCY || 6);
const DETAIL_TTL_DAYS = Number(process.env.DETAIL_TTL_DAYS || 30);
const DETAIL_MAX = process.env.DETAIL_MAX ? Number(process.env.DETAIL_MAX) : Infinity;
const PRODUCT_UPSERT_BATCH = Number(process.env.PRODUCT_UPSERT_BATCH || 50);

// GUARDARRAÍL: el catálogo vivo ronda los 7.3k productos; menos de esto = scrape
// parcial (WAF/API rota) → abortar para que markStale no despublique el catálogo.
const MIN_PRODUCTS = 6000;

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
  process.exit(1);
}

const API = 'https://wscompra.plusfresc.cat/api';
const IMG_BASE = 'https://compra.plusfresc.cat/ImatgesProductes/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const runStart = new Date().toISOString();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ── Sesión: JWT de invitado (30 min) ─────────────────────────────────────────
const tokens = new Map();
async function login(center) {
  const res = await fetch(`${API}/loginGuest/${center}`, {
    method: 'POST', headers: { 'User-Agent': UA, 'Content-Length': '0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`loginGuest ${res.status}`);
  const j = await res.json(); // el body es el JWT como string JSON
  if (typeof j !== 'string' || !j) throw new Error('loginGuest sin token');
  tokens.set(center, j);
}

// GET a la API con el token de invitado y reintentos: 401 (token caducado) →
// re-login; 429/5xx → backoff.
async function apiGet(path, center = CENTER, { tries = 4, allowNotFound = false } = {}) {
  for (let t = 0; t < tries; t++) {
    try {
      if (!tokens.get(center)) await login(center);
      const res = await fetch(`${API}/${path}`, {
        headers: { Authorization: `Bearer ${tokens.get(center)}`, Accept: 'application/json', 'User-Agent': UA },
        signal: AbortSignal.timeout(120000),
      });
      if (res.ok) return res.json();
      // Algunos productos que siguen en el listado no publican ficha. Es una
      // ausencia permanente, no un error transitorio: no reintentarla ni
      // ensuciar el log del sync.
      if (res.status === 404 && allowNotFound) return null;
      if (res.status === 401 && t < tries - 1) { tokens.delete(center); await sleep(400); continue; }
      if ((res.status === 429 || res.status >= 500) && t < tries - 1) { await sleep(1500 * (t + 1)); continue; }
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (t === tries - 1) throw new Error(`GET ${path}: ${e.message}`);
      await sleep(1000 * (t + 1));
    }
  }
}

// ── texts[]: nombre por idioma ───────────────────────────────────────────────
// Categorías usan type 1; productos, type 4. Se acepta el primero no vacío.
const textOf = (node, lang, types = [1, 4]) => {
  for (const ty of types) {
    const hit = (node?.texts || []).find((x) => x.lang === lang && x.type === ty && x.text?.trim());
    if (hit) return hit.text.trim();
  }
  return null;
};

// ── Árbol de categorías (solo ramas numéricas = surtido real) ────────────────
function walkCats(node, parentId, out) {
  for (const c of node?.childs || []) {
    const id = String(c.id ?? '');
    if (!/^\d+$/.test(id)) continue; // PromoHighlight/Oferta2/CategoXXX_… fuera
    out.push({
      id,
      name: textOf(c, 'es') ?? textOf(c, 'ca') ?? id,
      name_ca: textOf(c, 'ca'),
      parent_id: parentId,
    });
    walkCats(c, id, out);
  }
}

// ── Normalización de producto ────────────────────────────────────────────────
const eurStr = (n) => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : null);
const clean = (s) => { const v = (s == null ? '' : String(s)).trim(); return v || null; };
// unit_measure de Plusfresc → unidad que entiende canonicalPricePerUnit.
const UM_MAP = { L: 'l', KG: 'kg', UN: 'ud', DO: 'docena', DOT: 'docena' };
const offerEndISO = (date) => {
  const value = clean(date);
  const m = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : value;
};

function normalize(copies) {
  // Copia primaria: la de hoja numérica (las de Oferta2/promos llevan filter_id
  // no numérico y "category_id" basura); la oferta se captura de cualquiera.
  const primary = copies.find((c) => /^\d+$/.test(String(c.filter_id ?? ''))) ?? copies[0];
  const offerCopy = copies.find((c) => c.new_value_cents != null && c.new_value_cents > 0);
  const price = primary.value_cents > 0 ? primary.value_cents / 100 : null;
  const offerPrice = offerCopy ? offerCopy.new_value_cents / 100 : null;
  const offerBasePrice = offerCopy?.value_cents > offerCopy?.new_value_cents
    ? offerCopy.value_cents / 100
    : null;
  const ppu = primary.value_x_unit > 0
    ? canonicalPricePerUnit(primary.value_x_unit / 100, UM_MAP[(primary.unit_measure || '').toUpperCase()])
    : null;
  const img = clean(primary.image_url) ?? clean(primary.icon);
  return {
    id: String(primary.item_id),
    display_name: textOf(primary, 'es', [4]) ?? textOf(primary, 'ca', [4]) ?? '',
    display_name_ca: textOf(primary, 'ca', [4]),
    brand: clean(primary.brand_name),
    thumbnail: img ? IMG_BASE + img : null,
    unit_price: price,
    price_format: price != null ? `${eurStr(price)} €` : null,
    promo_name: offerCopy ? textOf(offerCopy, 'es', [6]) ?? 'Promoción' : null,
    promo_name_ca: offerCopy ? textOf(offerCopy, 'ca', [6]) ?? 'Promoció' : null,
    promo_offer_price: offerPrice,
    promo_base_price: offerBasePrice,
    promo_end: offerCopy ? offerEndISO(offerCopy.end_date) : null,
    price_per_unit: ppu?.value ?? null,
    price_per_unit_unit: ppu?.unit ?? null,
    available: primary.available !== false,
    published: true,
    raw: offerCopy && offerCopy !== primary
      ? { ...primary, offer: {
        new_value_cents: offerCopy.new_value_cents,
        end_date: offerCopy.end_date ?? null,
        promo_id: offerCopy.promo_id ?? null,
        qty_required: offerCopy.qty_required ?? null,
      } }
      : primary,
    synced_at: runStart,
    // Hojas numéricas de TODAS las copias (multi-categoría) para la membership.
    _leaves: [...new Set(copies.map((c) => String(c.filter_id ?? '')).filter((f) => /^\d+$/.test(f)))],
  };
}

const compactPrice = (r) => ({
  p: r.unit_price,
  pf: r.price_format,
  ppu: r.price_per_unit,
  ppuu: r.price_per_unit_unit,
  av: r.available,
  pn: r.promo_name,
  pnc: r.promo_name_ca,
  po: r.promo_offer_price,
  pb: r.promo_base_price,
  pe: r.promo_end,
});

// ── Ficha (productdetails/files/{item}/{lang}) ───────────────────────────────
const DETAIL_COLS = ['description', 'ingredients', 'allergens', 'nutrition', 'conservation'];
const DETAIL_COLS_CA = DETAIL_COLS.map((c) => `${c}_ca`);
// nutritionalunit → etiqueta legible (códigos observados; desconocido → sin unidad).
const NUTRI_UNIT = { E14: 'kcal', KJO: 'kJ', GR: 'g', MGR: 'mg', MCG: 'µg', MLT: 'ml' };

function parseDetail(d) {
  const fd = d?.filedetails ?? {};
  const nutrition = (d?.nutritionals || [])
    .filter((n) => clean(n.nutritionalname) && clean(n.per_100))
    .map((n) => `${n.nutritionalname.trim()}: ${n.per_100.trim()}${NUTRI_UNIT[n.nutritionalunit] ? ' ' + NUTRI_UNIT[n.nutritionalunit] : ''}`)
    .join('\n');
  // Alérgenos agrupados por relación ("Contiene"/"Puede contener", tal cual los da la API).
  const byRel = new Map();
  for (const a of d?.allergens || []) {
    const rel = clean(a.alergendescription), name = clean(a.alergensname);
    if (!rel || !name) continue;
    if (!byRel.has(rel)) byRel.set(rel, []);
    byRel.get(rel).push(name);
  }
  const allergens = [...byRel.entries()].map(([rel, names]) => `${rel}: ${names.join(', ')}`).join('\n');
  return {
    description: clean(fd.desc),
    ingredients: clean(fd.ingredient_list),
    allergens: allergens || null,
    nutrition: nutrition || null,
    conservation: clean(fd.conservation),
  };
}

// Lee la ficha ya guardada (id → fila) para decidir qué refrescar y arrastrar la
// del resto. Paginado por Range (PostgREST corta a 1000).
async function fetchExistingDetail() {
  const map = new Map();
  const cols = ['id', 'detail_synced_at', ...DETAIL_COLS, ...DETAIL_COLS_CA].join(',');
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/plusfresc_products?select=${cols}`, {
      headers: {
        apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`,
        Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items',
      },
    });
    if (!res.ok) throw new Error(`leer ficha existente ${res.status}: ${await res.text()}`);
    const page = await res.json();
    for (const r of page) map.set(r.id, r);
    if (page.length < PAGE) break;
  }
  return map;
}

// Rellena la ficha de `rows` IN-PLACE (es + ca): reutiliza la guardada si está al
// día y descarga (tope DETAIL_MAX) la de los que faltan/caducaron. Garantiza que
// TODAS las filas llevan las MISMAS claves (PostgREST pone null en las ausentes).
async function fillDetail(rows) {
  const existing = DRY_RUN ? new Map() : await fetchExistingDetail();
  const ttlMs = DETAIL_TTL_DAYS * 86400000;
  const now = Date.now();
  const ALL_COLS = [...DETAIL_COLS, ...DETAIL_COLS_CA];
  for (const r of rows) { for (const c of ALL_COLS) r[c] = null; r.detail_synced_at = null; }
  const stale = [];
  for (const r of rows) {
    const prev = existing.get(r.id);
    const fresh = prev?.detail_synced_at && now - new Date(prev.detail_synced_at).getTime() < ttlMs;
    if (prev) { for (const c of ALL_COLS) r[c] = prev[c] ?? null; r.detail_synced_at = prev.detail_synced_at ?? null; }
    if (!fresh) stale.push(r);
  }
  const batch = stale.slice(0, DETAIL_MAX);
  console.log(`[plusfresc] ficha: ${batch.length} a descargar · ${rows.length - batch.length} al día/arrastradas`);
  const queue = [...batch];
  let done = 0;
  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, async () => {
    for (;;) {
      const r = queue.shift();
      if (!r) break;
      try {
        const es = parseDetail(await apiGet(`productdetails/files/${r.id}/es`, CENTER, { allowNotFound: true }));
        const ca = parseDetail(await apiGet(`productdetails/files/${r.id}/ca`, CENTER, { allowNotFound: true }));
        // Si el fetch no saca nada PERO ya había ficha, NO la pisamos (probable
        // cambio de API): se conserva y se reintenta otro día. Si nunca tuvo,
        // se marca rastreada igualmente (no reintentar cada semana sin datos).
        const got = DETAIL_COLS.some((c) => es[c] || ca[c]);
        const had = DETAIL_COLS.some((c) => r[c] || r[`${c}_ca`]);
        if (got || !had) {
          for (const c of DETAIL_COLS) {
            r[c] = es[c];
            // La ficha catalana a veces llega sin traducir (mismo texto) → solo
            // se guarda si difiere; el cliente hace fallback al castellano.
            r[`${c}_ca`] = ca[c] && ca[c] !== es[c] ? ca[c] : null;
          }
          r.detail_synced_at = runStart;
        }
      } catch (e) { console.warn(`[plusfresc] ficha ${r.id} falló: ${e.message.split('\n')[0]}`); }
      if (++done % 200 === 0) console.log(`[plusfresc] ficha ${done}/${batch.length}`);
      await sleep(60);
    }
  }));
}

// ── Supabase REST ────────────────────────────────────────────────────────────
async function upsert(table, rows) {
  // `plusfresc_products` tiene JSONB grande, tres índices trigram/GIN y un
  // trigger de precios. Los lotes de 500 superan el statement_timeout de
  // Supabase; 50 mantiene la transacción acotada incluso si coinciden syncs.
  const batchSize = table === 'plusfresc_products' ? PRODUCT_UPSERT_BATCH : 500;
  for (const c of chunk(rows, batchSize)) {
    let last;
    let done = false;
    for (let t = 0; t < 4 && !done; t++) {
      if (t) await sleep(1500 * 2 ** (t - 1));
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
          method: 'POST',
          headers: {
            apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`,
            'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify(c),
        });
        if (res.ok) { done = true; break; }
        last = new Error(`upsert ${table} ${res.status}: ${await res.text()}`);
      } catch (e) { last = e; }
      console.warn(`[plusfresc] ${String(last.message).split('\n')[0]} (intento ${t + 1}/4)`);
    }
    if (!done) throw last;
  }
}
const markStale = (table) => markStaleBatched({ url: SUPABASE_URL, key: SERVICE_ROLE, table, runStart });
const markLocationPricesStale = () => markStaleBatched({
  url: SUPABASE_URL, key: SERVICE_ROLE, table: 'catalog_location_prices', runStart,
  filters: 'store=eq.plusfresc',
});

const locationPriceRow = (productId, centerId, price) => ({
  id: `plusfresc:${centerId}:${productId}`,
  store: 'plusfresc',
  product_id: productId,
  location_id: centerId,
  unit_price: price.p,
  price_per_unit: price.ppu,
  price_per_unit_unit: price.ppuu,
  available: price.av !== false,
  published: true,
  synced_at: runStart,
});

async function main() {
  console.log(`[plusfresc] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} centro=${CENTER}`);

  // 1) Árbol de categorías (bilingüe, una petición).
  const tree = await apiGet(`categories/tree/${CENTER}/Root`);
  const cats = [];
  walkCats(tree?.category, null, cats);
  if (cats.length < 100) throw new Error(`árbol sospechosamente pequeño (${cats.length} categorías)`);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const n1Names = cats.filter((c) => c.parent_id === null).map((c) => c.name);
  console.log(`[plusfresc] ${cats.length} categorías · N1: ${n1Names.join(', ')}`);

  // 2) Catálogo entero (una petición) y dedup por item_id.
  const listing = await apiGet(`products/category/Root/${CENTER}`);
  if (!Array.isArray(listing)) throw new Error('products/category/Root no devolvió un array');
  const byItem = new Map();
  for (const p of listing) {
    const item = String(p?.item_id ?? '');
    if (!item) continue;
    if (!byItem.has(item)) byItem.set(item, []);
    byItem.get(item).push(p);
  }
  let rows = [...byItem.values()].map(normalize).filter((r) => r.display_name);
  rows = rows.slice(0, MAX_PRODUCTS);
  const byId = new Map(rows.map((r) => {
    r._centers = new Set([CENTER]);
    r._priceByCenter = new Map([[CENTER, compactPrice(r)]]);
    return [r.id, r];
  }));
  console.log(`[plusfresc] ${listing.length} filas → ${rows.length} productos únicos`);
  if (!DRY_RUN && rows.length < MIN_PRODUCTS) {
    throw new Error(`solo ${rows.length} productos (<${MIN_PRODUCTS}): scrape parcial, se aborta para no despublicar el catálogo`);
  }

  // Unir surtido/precio de los otros siete centros. El centro de referencia
  // conserva las columnas base; las diferencias se persisten compactas por id.
  for (const center of ALL_CENTERS.filter((id) => id !== CENTER)) {
    const centerListing = await apiGet(`products/category/Root/${center}`, center);
    if (!Array.isArray(centerListing) || (!DRY_RUN && centerListing.length < MIN_PRODUCTS)) {
      throw new Error(`centro ${center}: catálogo sospechosamente pequeño (${Array.isArray(centerListing) ? centerListing.length : 'sin array'})`);
    }
    const centerByItem = new Map();
    for (const p of centerListing) {
      const item = String(p?.item_id ?? '');
      if (!item) continue;
      if (!centerByItem.has(item)) centerByItem.set(item, []);
      centerByItem.get(item).push(p);
    }
    for (const copies of centerByItem.values()) {
      const normalized = normalize(copies);
      if (!normalized.display_name) continue;
      let row = byId.get(normalized.id);
      if (!row) {
        row = normalized;
        row._centers = new Set();
        row._priceByCenter = new Map();
        rows.push(row);
        byId.set(row.id, row);
      } else {
        row._leaves = [...new Set([...row._leaves, ...normalized._leaves])];
      }
      row._centers.add(center);
      row._priceByCenter.set(center, compactPrice(normalized));
    }
    console.log(`[plusfresc] centro ${center}: ${centerByItem.size} productos · unión ${rows.length}`);
  }

  // 3) Membership: hoja(s) + ancestros por PREFIJO de id ("09011001" → 090110,
  //    0901, 09), limitados a categorías que existen en el árbol.
  const catCount = new Map();
  const locationPriceRows = [];
  for (const r of rows) {
    r.centers = r._centers.size === ALL_CENTERS.length ? null : [...r._centers].sort((a, b) => Number(a) - Number(b));
    const basePrice = r._priceByCenter.get(CENTER) ?? compactPrice(r);
    const centerPrices = {};
    for (const center of r._centers) {
      if (center === CENTER) continue;
      const price = r._priceByCenter.get(center);
      if (price && (price.p !== basePrice.p || price.av !== basePrice.av || price.ppu !== basePrice.ppu || price.po !== basePrice.po || price.pb !== basePrice.pb || price.pe !== basePrice.pe)) centerPrices[center] = price;
    }
    r.center_prices = Object.keys(centerPrices).length ? centerPrices : null;
    const offerCenters = [...r._centers]
      .filter((center) => r._priceByCenter.get(center)?.po != null)
      .sort((a, b) => Number(a) - Number(b));
    r.offer_centers = offerCenters.length ? offerCenters : null;
    for (const [centerId, price] of r._priceByCenter) {
      locationPriceRows.push(locationPriceRow(r.id, centerId, price));
    }
    delete r._centers;
    delete r._priceByCenter;
    const expanded = new Set();
    for (const leaf of r._leaves) {
      for (let len = 2; len <= leaf.length; len += 2) {
        const anc = leaf.slice(0, len);
        if (catName.has(anc)) expanded.add(anc);
      }
    }
    const leaf = r._leaves.find((l) => catName.has(l)) ?? null;
    delete r._leaves;
    r.category_ids = [...expanded];
    r.category_id = leaf;
    r.category_name = leaf ? catName.get(leaf) ?? null : null;
    for (const c of expanded) catCount.set(c, (catCount.get(c) ?? 0) + 1);
  }
  const catRows = cats.map((c) => ({
    ...c, product_count: catCount.get(c.id) ?? 0, published: true, synced_at: runStart,
  }));
  console.log(`[plusfresc] ${locationPriceRows.length} precios efectivos por ubicación`);

  // 4) Ficha incremental (es + ca).
  if (!SKIP_DETAIL && !DRY_RUN) await fillDetail(rows);

  if (DRY_RUN) {
    console.log('muestra (6):');
    for (const r of rows.slice(0, 6)) {
      console.log(`  ${r.id}  ${r.display_name}  [ca: ${r.display_name_ca ?? '—'}]  [${r.brand ?? '—'}]  ${r.price_format}  ${r.price_per_unit != null ? r.price_per_unit + ' €/' + r.price_per_unit_unit : '—'}  cat=${r.category_name ?? '—'}`);
    }
    if (rows[0]) console.log('category_ids[0]:', rows[0].category_ids.join(', '));
    console.log('nulos →', {
      sin_precio: rows.filter((r) => r.unit_price == null).length,
      sin_ppu: rows.filter((r) => r.price_per_unit == null).length,
      sin_img: rows.filter((r) => !r.thumbnail).length,
      sin_ca: rows.filter((r) => !r.display_name_ca).length,
      sin_categoria: rows.filter((r) => r.category_ids.length === 0).length,
      con_oferta: rows.filter((r) => r.raw.offer).length,
    });
    // Muestra de ficha: descarga la de los primeros productos para verificar el parseo.
    if (!SKIP_DETAIL) {
      for (const r of rows.slice(0, 3)) {
        try {
          const d = parseDetail(await apiGet(`productdetails/files/${r.id}/es`));
          console.log(`\nficha ${r.id} — ${r.display_name}`);
          for (const c of DETAIL_COLS) if (d[c]) console.log(`  ${c}: ${d[c].replace(/\n/g, ' / ').slice(0, 140)}`);
        } catch (e) { console.warn(`  ficha falló: ${e.message.split('\n')[0]}`); }
      }
    }
    return;
  }
  await upsert('plusfresc_categories', catRows);
  await upsert('plusfresc_products', rows);
  await upsert('catalog_location_prices', locationPriceRows);
  await markStale('plusfresc_products');
  await markStale('plusfresc_categories');
  await markLocationPricesStale();
  await recordCatalogSync({ url: SUPABASE_URL, key: SERVICE_ROLE, store: 'plusfresc' });
  console.log('[plusfresc] OK');
}

main().catch((e) => { console.error('[plusfresc] ERROR', e); process.exit(1); });
