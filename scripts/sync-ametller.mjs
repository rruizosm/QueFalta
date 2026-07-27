#!/usr/bin/env node
// Sincroniza el catálogo de Ametller Origen → Supabase (catálogo + búsqueda),
// 1×/semana. Súper catalán de frescos/proximidad (Barcelona/Girona…). 10º espejo.
//
// La tienda corre sobre Salesforce Commerce Cloud (SFCC + PWA Kit), así que su
// API pública de comprador (SCAPI) responde directamente con un TOKEN DE INVITADO
// que se obtiene 100% con fetch (PKCE, sin navegador headless — a diferencia de
// Bonpreu/Sorli). Config sacada del HTML de la home (si rota, re-extraer los mismos
// campos de <script id="__NEXT_DATA__"> o del bundle): shortCode/organizationId/
// clientId/siteId. El clientId público es el del storefront (SLAS public client).
//
// Estrategia (catálogo pequeño, ~3.025 productos → sin recorrer hojas):
//   1. Token invitado SLAS por PKCE: GET /oauth2/authorize?hint=guest → 303 con
//      code+usid en la redirect; POST /oauth2/token → access_token (JWT ~30 min).
//   2. Árbol de categorías: GET /categories/root?levels=3 (es + ca) → id→{name,
//      name_ca, parent}. Se excluyen las ramas de marketing (Colecciones/Novedades/
//      Promociones/Lotes) del listado navegable.
//   3. Enumerar ids: product-search refine=cgid=root, paginando por offset
//      (limit 200) → todos los productId del catálogo.
//   4. Detalle por lotes: GET /products?ids=… (máx 24 ids/llamada) en DOS pasadas
//      de idioma:
//        - locale=es (primaria): rellena display_name, brand, precio, €/unidad,
//          ean, categoría, imagen, ficha (ingredientes/nutrición/conservación/origen).
//        - locale=ca (2ª): rellena display_name_ca + la ficha catalana, casando por id.
//      Bilingüe como Bonpreu/bonÀrea/Sorli.
//   5. Membership: primaryCategoryId (categoría hoja) + ancestros del árbol →
//      category_ids (navegación por cualquier nivel).
//   6. Normalizar + upsert en Supabase (soft-delete de lo ausente vía markStale).
//
// Notas:
//  - Precio del envase = price; €/unidad = pricePerUnit sobre unitMeasure
//    (KG→kg, L→l, UN→ud) → canonicalPricePerUnit.
//  - EAN estructurado (como Consum): útil para el matching exacto del comparador.
//  - Alérgenos llegan como códigos numéricos sin leyenda pública → NO se guardan
//    (mejor sin dato que un dato ilegible). c_ao_preferencias/pesoAproximado se
//    conservan en `raw` para features futuras.
//  - Precios de la tienda por defecto de la sesión de invitado (como Consum/Sorli).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      CONCURRENCY=6       (lotes de detalle en paralelo)
//      DRY_RUN=1           (no escribe en Supabase; imprime resumen)
//      MAX_PRODUCTS=N      (limita nº de productos, para pruebas)
import crypto from 'node:crypto';
import { canonicalPricePerUnit } from './lib/price.mjs';
import { normalizeAmetllerOffer } from './lib/retailer-offers.mjs';
import { markStale as markStaleBatched } from './lib/stale.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const MAX_PRODUCTS = process.env.MAX_PRODUCTS ? Number(process.env.MAX_PRODUCTS) : Infinity;

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
  process.exit(1);
}

// ── Config SCAPI (pública; extraída del storefront) ──────────────────────────
const SHORT_CODE = process.env.AMETLLER_SHORT_CODE || '4jppt37a';
const ORG_ID = process.env.AMETLLER_ORG_ID || 'f_ecom_blzv_prd';
const CLIENT_ID = process.env.AMETLLER_CLIENT_ID || 'fd3c9db8-2a0d-4f4b-9e74-294e068f9ae4';
const SITE_ID = process.env.AMETLLER_SITE_ID || 'ametller';
const REDIRECT_URI = 'https://www.ametllerorigen.com/callback';
const BASE = `https://${SHORT_CODE}.api.commercecloud.salesforce.com`;
const AUTH_BASE = `${BASE}/shopper/auth/v1/organizations/${ORG_ID}`;
const PROD_BASE = `${BASE}/product/shopper-products/v1/organizations/${ORG_ID}`;
const SEARCH_BASE = `${BASE}/search/shopper-search/v1/organizations/${ORG_ID}`;

// SCAPI: en Ametller el idioma va en `locale` = 'es' | 'ca' (¡NO 'es-ES'/'ca-ES',
// que dan 400 Unsupported Locale!). Primaria = castellano.
const LANG = 'es';
const LANG_CA = 'ca';
const SEARCH_PAGE = 200;   // límite de product-search
const IDS_BATCH = 24;      // límite duro del endpoint /products?ids= (0..24)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const runStart = new Date().toISOString();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ── Sesión: token de invitado SLAS por PKCE (solo fetch) ─────────────────────
// El token caduca a la media hora; toda la corrida son ~270 peticiones (unos
// minutos), así que uno basta, pero si algo cae con 401 se re-autentica una vez.
async function newGuestToken() {
  const verifier = b64url(crypto.randomBytes(48)).slice(0, 64);
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  // 1) authorize (guest): la respuesta es un 303 cuya Location trae code + usid.
  const authUrl = `${AUTH_BASE}/oauth2/authorize?redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
    + `&client_id=${CLIENT_ID}&code_challenge=${challenge}&response_type=code&hint=guest`;
  const authRes = await fetch(authUrl, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': UA } });
  const loc = authRes.headers.get('location') || '';
  const code = loc.match(/[?&]code=([^&]+)/)?.[1];
  const usid = loc.match(/[?&]usid=([^&]+)/)?.[1];
  if (!code || !usid) throw new Error(`authorize sin code/usid (status ${authRes.status})`);
  // 2) token (authorization_code_pkce).
  const body = new URLSearchParams({
    grant_type: 'authorization_code_pkce', code, redirect_uri: REDIRECT_URI,
    code_verifier: verifier, client_id: CLIENT_ID, channel_id: SITE_ID, usid,
  });
  const tokRes = await fetch(`${AUTH_BASE}/oauth2/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA }, body,
  });
  if (!tokRes.ok) throw new Error(`token ${tokRes.status}: ${await tokRes.text()}`);
  const j = await tokRes.json();
  if (!j.access_token) throw new Error('token sin access_token');
  return j.access_token;
}

let token = null;
async function ensureToken() {
  if (!token) token = await newGuestToken();
  return token;
}

// GET a la SCAPI con el token de invitado y reintentos. Si cae con 401 (token
// caducado) se re-autentica y reintenta; 429/5xx → backoff.
async function scapiGet(url, { tries = 4 } = {}) {
  for (let t = 0; t < tries; t++) {
    const tok = await ensureToken();
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json', 'User-Agent': UA },
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return res.json();
      if (res.status === 401 && t < tries - 1) { token = null; await sleep(400); continue; }
      if ((res.status === 429 || res.status >= 500) && t < tries - 1) { await sleep(800 * (t + 1)); continue; }
      console.warn(`[ametller] ${url.split('?')[0].split('/').pop()} → ${res.status} (intento ${t + 1})`);
    } catch (e) {
      console.warn(`[ametller] petición falló: ${e.message} (intento ${t + 1})`);
    }
    await sleep(700 * (t + 1));
  }
  throw new Error(`no se pudo completar GET ${url}`);
}

// ── Árbol de categorías (bilingüe: es + ca) ──────────────────────────────────
// /categories/root?levels=3 anida `categories`. El nombre está en `name`;
// parent_id se deduce de la jerarquía (el JSON no lo trae explícito).
function walkCats(nodes, parentId, out, seen) {
  for (const n of nodes || []) {
    const id = n?.id != null ? String(n.id) : null;
    if (!id || id === 'root') { walkCats(n?.categories, parentId, out, seen); continue; }
    if (!seen.has(id)) {
      seen.add(id);
      out.push({ id, name: (n.name || '').trim(), parent_id: parentId });
    }
    walkCats(n.categories, id, out, seen);
  }
}

async function fetchCategoryTree(locale) {
  const j = await scapiGet(`${PROD_BASE}/categories/root?siteId=${SITE_ID}&levels=3&locale=${locale}`);
  const out = [];
  walkCats(j.data || j.categories || [], null, out, new Set());
  return out;
}

// N1 de marketing que NO son pasillos de súper (se ocultan del listado navegable).
const MARKETING_N1 = new Set(['colecciones', 'col·leccions', 'novedades', 'novetats', 'promociones', 'promocions', 'lotes ahorro', 'lots estalvi', 'ofertas', 'ofertes']);

// ── Enumerar todos los productId del catálogo (product-search cgid=root) ──────
async function enumerateIds() {
  const first = await scapiGet(`${SEARCH_BASE}/product-search?siteId=${SITE_ID}&refine=cgid=root&limit=${SEARCH_PAGE}&offset=0&locale=${LANG}`);
  const total = Math.min(first.total ?? 0, MAX_PRODUCTS);
  const ids = [];
  const push = (hits) => { for (const h of hits || []) if (h?.productId) ids.push(String(h.productId)); };
  push(first.hits);
  for (let off = SEARCH_PAGE; off < total; off += SEARCH_PAGE) {
    const j = await scapiGet(`${SEARCH_BASE}/product-search?siteId=${SITE_ID}&refine=cgid=root&limit=${SEARCH_PAGE}&offset=${off}&locale=${LANG}`);
    push(j.hits);
    await sleep(60);
  }
  return [...new Set(ids)].slice(0, MAX_PRODUCTS);
}

// ── Detalle por lotes de 24 (una pasada de idioma) ───────────────────────────
async function fetchDetails(ids, locale, onProduct) {
  const batches = chunk(ids, IDS_BATCH);
  let done = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const b = batches.shift();
      if (!b) break;
      try {
        const j = await scapiGet(`${PROD_BASE}/products?siteId=${SITE_ID}&locale=${locale}&ids=${b.join(',')}`);
        for (const p of j.data || []) onProduct(p);
      } catch (e) {
        console.warn(`[ametller] lote ${locale} falló: ${e.message}`);
      }
      if (++done % 20 === 0) console.log(`[ametller] ${locale}: ${done}/${batches.length + done} lotes`);
      await sleep(60);
    }
  }));
}

// ── Normalización ────────────────────────────────────────────────────────────
const num = (v) => { const n = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(n) ? n : null; };
const eurStr = (n) => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : null);
const clean = (s) => { const v = (s == null ? '' : String(s)).replace(/^\.+/, '').trim(); return v || null; };
// unitMeasure de SCAPI → unidad que entiende canonicalPricePerUnit.
const UM_MAP = { KG: 'kg', G: 'g', L: 'l', ML: 'ml', CL: 'cl', UN: 'ud', UD: 'ud', U: 'ud', UNITAT: 'ud', UNIDAD: 'ud' };

const imageOf = (p) => {
  const groups = p.imageGroups || [];
  const g = groups.find((x) => x.viewType === 'large') || groups[0];
  return g?.images?.[0]?.link || null;
};

// La tabla nutricional llega como una cadena separada por comas
// ("Valor energético 1680.0kj,Grasas 5.8g,…"); se pasa a una línea por nutriente.
const nutrients = (s) => { const v = clean(s); return v ? v.split(',').map((x) => x.trim()).filter(Boolean).join('\n') : null; };

function normalizeEs(p) {
  const ppu = canonicalPricePerUnit(p.pricePerUnit, UM_MAP[(p.unitMeasure || '').toUpperCase()] ?? p.unitMeasure);
  const price = num(p.price);
  const offer = normalizeAmetllerOffer(p);
  return {
    id: String(p.id),
    retailer_product_id: null,
    display_name: (p.name || '').trim(),
    display_name_ca: null, // lo rellena la 2ª pasada (locale=ca)
    brand: clean(p.brand),
    packaging: null, // el formato ya va en el nombre ("… 150 g")
    thumbnail: imageOf(p),
    ean: clean(p.ean),
    unit_price: price,
    price_format: price != null ? `${eurStr(price)} €` : null,
    promo_name: offer?.promo_name ?? null,
    promo_text: offer?.promo_text ?? null,
    promo_price: offer?.promo_price ?? null,
    promo_base_price: offer?.promo_base_price ?? null,
    promo_start: offer?.promo_start ?? null,
    promo_end: offer?.promo_end ?? null,
    price_per_unit: ppu?.value ?? null,
    price_per_unit_unit: ppu?.unit ?? null,
    available: p.inventory ? p.inventory.orderable !== false : true,
    published: true,
    // Ficha (bilingüe): pasada es rellena las columnas base; ca, las _ca.
    ingredients: clean(p.c_ao_ingredientes),
    nutrition: nutrients(p.c_ao_nutrients),
    conservation: clean(p.c_ao_conservation),
    origin: clean(p.c_ao_origen),
    ingredients_ca: null,
    nutrition_ca: null,
    conservation_ca: null,
    origin_ca: null,
    raw: p,
    synced_at: runStart,
    _leaf: p.primaryCategoryId != null ? String(p.primaryCategoryId) : null,
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
  console.log(`[ametller] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} conc=${CONCURRENCY}`);

  // 1) Árbol de categorías (es + ca).
  const catsEs = await fetchCategoryTree(LANG);
  const caNames = new Map();
  for (const c of await fetchCategoryTree(LANG_CA)) caNames.set(c.id, c.name);
  const catRows = catsEs.map((c) => ({
    id: c.id, name: c.name, name_ca: caNames.get(c.id) ?? null,
    parent_id: c.parent_id, product_count: null, published: true, synced_at: runStart,
  }));
  const catName = new Map(catRows.map((c) => [c.id, c.name]));
  const parentOf = new Map(catRows.map((c) => [c.id, c.parent_id]));
  // N1 de marketing → se marcan para no contarlos (product_count queda a 0 y la app los oculta).
  const isMarketingRoot = (id) => {
    let cur = id;
    while (cur != null && parentOf.get(cur) != null) cur = parentOf.get(cur);
    return cur != null && MARKETING_N1.has((catName.get(cur) || '').toLowerCase());
  };
  const ancestorsOf = (id) => {
    const chain = [];
    for (let cur = id; cur; cur = parentOf.get(cur) ?? null) chain.push(cur);
    return chain;
  };
  const n1Names = catRows.filter((c) => c.parent_id === null).map((c) => c.name);
  console.log(`[ametller] ${catRows.length} categorías · N1: ${n1Names.join(', ')}`);

  // 2) Enumerar ids del catálogo.
  const ids = await enumerateIds();
  console.log(`[ametller] ${ids.length} productos a detallar`);

  // 3) Detalle pasada primaria (es).
  const products = new Map(); // id → normalizado
  await fetchDetails(ids, LANG, (p) => {
    if (p?.id == null) return;
    const norm = normalizeEs(p);
    if (norm.display_name) products.set(norm.id, norm);
  });

  // 4) Detalle pasada catalana (ca): nombre + ficha, casando por id.
  let caFilled = 0;
  await fetchDetails(ids, LANG_CA, (p) => {
    const row = products.get(String(p?.id));
    if (!row) return;
    const nameCa = (p.name || '').trim();
    if (nameCa && nameCa !== row.display_name) { row.display_name_ca = nameCa; caFilled++; }
    row.ingredients_ca = clean(p.c_ao_ingredientes);
    row.nutrition_ca = nutrients(p.c_ao_nutrients);
    row.conservation_ca = clean(p.c_ao_conservation);
    row.origin_ca = clean(p.c_ao_origen);
  });

  // 5) Membership (hoja + ancestros) y product_count (sin contar ramas de marketing).
  const catCount = new Map();
  const rows = [];
  for (const det of products.values()) {
    const leaf = det._leaf && catName.has(det._leaf) && !isMarketingRoot(det._leaf) ? det._leaf : null;
    delete det._leaf;
    const expanded = new Set();
    if (leaf) for (const a of ancestorsOf(leaf)) expanded.add(a);
    rows.push({
      ...det,
      category_ids: [...expanded],
      category_id: leaf,
      category_name: leaf ? catName.get(leaf) ?? null : null,
      detail_synced_at: runStart,
    });
    for (const c of expanded) catCount.set(c, (catCount.get(c) ?? 0) + 1);
  }
  for (const c of catRows) c.product_count = catCount.get(c.id) ?? 0;
  console.log(`[ametller] ${rows.length} productos únicos · ${caFilled} con nombre catalán`);

  if (DRY_RUN) {
    console.log('muestra (6):');
    for (const r of rows.slice(0, 6)) {
      console.log(`  ${r.id}  ${r.display_name}  [ca: ${r.display_name_ca ?? '—'}]  [${r.brand ?? '—'}]  ${r.price_format}  ${r.price_per_unit != null ? r.price_per_unit + ' €/' + r.price_per_unit_unit : '—'}  ean=${r.ean ?? '—'}  cat=${r.category_name ?? '—'}`);
    }
    if (rows[0]) console.log('category_ids[0]:', rows[0].category_ids.join(', '));
    console.log('nulos →', {
      sin_precio: rows.filter((r) => r.unit_price == null).length,
      con_oferta: rows.filter((r) => r.promo_name != null).length,
      sin_ppu: rows.filter((r) => r.price_per_unit == null).length,
      sin_img: rows.filter((r) => !r.thumbnail).length,
      sin_ean: rows.filter((r) => !r.ean).length,
      sin_ca: rows.filter((r) => !r.display_name_ca).length,
      sin_categoria: rows.filter((r) => r.category_ids.length === 0).length,
      con_ingredientes: rows.filter((r) => r.ingredients).length,
    });
    return;
  }
  if (rows.length === 0) throw new Error('0 productos (¿cambió la SCAPI o la sesión?)');

  await upsert('ametller_categories', catRows);
  await upsert('ametller_products', rows);
  await markStale('ametller_products');
  await markStale('ametller_categories');
  console.log('[ametller] OK');
}

main().catch((e) => { console.error('[ametller] ERROR', e); process.exit(1); });
