#!/usr/bin/env node
// Sincroniza el catálogo de BonpreuEsclat → Supabase (catálogo + búsqueda), 1×/día.
//
// Bonpreu protege su API de productos con AWS WAF y el endpoint de hidratación
// (PUT /v6/products) solo acepta IDs "activados" por el page-view. Así que la vía
// fiable es: navegador headless que carga cada categoría y hace scroll, mientras
// capturamos las RESPUESTAS de los PUT que la propia web dispara.
//   1. GET /v1/categories (abierto, sin WAF) → categorías N2.
//   2. Navegador (un contexto = token WAF compartido) con varias pestañas en paralelo.
//   3. Por cada N2: goto + scroll hasta el fondo, capturando productos de los PUT.
//   4. Normalizar + upsert en Supabase (soft-delete de lo ausente).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      PW_CHANNEL=chrome   (usar Chrome del sistema en local; vacío en CI = chromium)
//      CONCURRENCY=4       (pestañas en paralelo)
//      DRY_RUN=1           (no escribe en Supabase; imprime resumen)
//      MAX_CATEGORIES=N    (limita nº de categorías, para pruebas)
import { chromium } from 'playwright-core';
import { canonicalPricePerUnit } from './lib/price.mjs';
import { markStale as markStaleBatched } from './lib/stale.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);
const MAX_CATEGORIES = process.env.MAX_CATEGORIES ? Number(process.env.MAX_CATEGORIES) : Infinity;
const SKIP_DETAIL = process.env.SKIP_DETAIL === '1';
const DETAIL_CONCURRENCY = Number(process.env.DETAIL_CONCURRENCY || 2);
const DETAIL_TTL_DAYS = Number(process.env.DETAIL_TTL_DAYS || 30);
const DETAIL_MAX = process.env.DETAIL_MAX ? Number(process.env.DETAIL_MAX) : 500;

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
  process.exit(1);
}

const HOME = 'https://www.compraonline.bonpreuesclat.cat';
const CATS_API = `${HOME}/api/webproductpagews/v1/categories`;
// El idioma se fija con la cookie `language` (NO con Accept-Language ni con el
// dominio, que los ignoran), y controla TANTO la API de categorías como la
// hidratación de productos (PUT /v6/products). La web es bilingüe (es-ES | ca-ES).
// Hacemos la app bilingüe (como Mercadona): guardamos los DOS idiomas y la app
// elige según el idioma activo. Pasada PRIMARIA = castellano (rellena display_name
// / name); 2ª pasada = catalán (rellena display_name_ca / name_ca, casando por id,
// que es estable entre idiomas). El catálogo se recorre DOS veces (~2× tiempo).
const LANG = process.env.BONPREU_LANG || 'es-ES';     // primario (castellano)
const LANG_CA = process.env.BONPREU_LANG_CA || 'ca-ES'; // 2ª pasada (catalán)
const runStart = new Date().toISOString();
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ── Normalización (forma de producto de Bonpreu) ─────────────────────────────
const num = (v) => { const n = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(n) ? n : null; };
// Precio del ENVASE. El JSON de Bonpreu trae el precio en dos formas según el
// producto: price.current.amount o price.amount (plano; en la práctica el 100%
// de las filas observadas usan la plana). OJO: NO caer a unitPrice.price.amount
// — ese es el €/kg|€/L de referencia, no lo que cuesta el envase; ese fallback
// guardó durante meses 14,88 € en un café de 0,4 kg que vale 5,95 € (~50% del
// catálogo mal, todo envase ≠ 1 unidad de medida). Reparado con
// supabase/migrations/fix_bonpreu_prices.sql sobre el raw ya almacenado.
const priceAmount = (p) => num(p?.price?.current?.amount) ?? num(p?.price?.amount);
const priceText = (p) => {
  const u = p?.unitPrice;
  if (!u?.price?.amount) return null;
  const unit = (u.unit || '').replace(/^fop\.price\.per\./, '');
  return `${u.price.amount} ${u.price.currency || 'EUR'}${unit ? '/' + unit : ''}`;
};
const imageUrl = (p) => p?.image?.src || (Array.isArray(p?.images) && (p.images[0]?.src || p.images[0]?.url)) || null;

const htmlEntity = (s) => String(s)
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const cleanDetail = (s) => htmlEntity(String(s ?? '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(?:p|li|div|tr|h[1-6])\s*>/gi, '\n')
  .replace(/<\/(?:td|th)\s*>/gi, '\t')
  .replace(/<[^>]+>/g, ''))
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n[ \t]+/g, '\n')
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

function detailKey(title) {
  return cleanDetail(title).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function assignDetail(out, title, content) {
  const key = detailKey(title);
  const value = cleanDetail(content);
  if (!value) return;
  if (/ingredient/.test(key)) out.ingredients ??= value;
  else if (/nutri|dades nutricional|datos nutricional|informacion nutricional/.test(key)) out.nutrition ??= value;
  else if (/proveedor|proveidor|supplier/.test(key)) out.supplier_name ??= value;
  else if (/marca|brand/.test(key)) out.brand ??= value;
  else if (/informacion del producto|informacio del product|product information|product info/.test(key)) out.product_info ??= value;
}

function parseProductDetailHtml(html) {
  const out = {};
  const sectionRe = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>([\s\S]*?)(?=<h[1-6][^>]*>|$)/gi;
  for (const match of html.matchAll(sectionRe)) assignDetail(out, match[1], match[2]);
  return out;
}

// Detalles de un producto (independientes de la categoría). La pertenencia a
// categorías se calcula aparte (membership) leyendo los IDs del SSR de cada página.
function normalize(p) {
  // €/unidad canónico: Bonpreu da unitPrice.price.amount + unitPrice.unit ("litre"…).
  const ppu = canonicalPricePerUnit(p?.unitPrice?.price?.amount, p?.unitPrice?.unit);
  return {
    id: p.productId,
    retailer_product_id: p.retailerProductId ?? null,
    display_name: (p.name || '').trim(),
    brand: p.brand ?? null,
    packaging: p.packSizeDescription ?? null,
    thumbnail: imageUrl(p),
    unit_price: priceAmount(p),
    price_format: priceText(p),
    price_per_unit: ppu?.value ?? null,
    price_per_unit_unit: ppu?.unit ?? null,
    available: p.available !== false,
    is_new: !!p.isNew,
    published: true,
    raw: p,
    synced_at: runStart,
  };
}

// ── Supabase REST ────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function upsert(table, rows) {
  // Lotes pequeños: el catálogo de Bonpreu son ~18k productos con `raw` jsonb
  // grande + índice trigram; a 500/lote el upsert excede el statement_timeout de
  // Supabase (57014). 50/lote mantiene cada statement bien por debajo del límite.
  // Además, el lunes se solapan los 6+ syncs y la BD va cargada → un 57014/5xx
  // suelto tiraba el run entero (visto 2026-07-13). Cada lote reintenta con
  // backoff (mismo criterio que lib/stale.mjs) para absorber los picos.
  for (const c of chunk(rows, 50)) {
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
      console.warn(`[bonpreu] ${String(last.message).split('\n')[0]} (intento ${t + 1}/4)`);
    }
    if (!done) throw last;
  }
}
// Soft-delete por lotes con reintentos (lib/stale.mjs): el UPDATE único de toda
// la tabla moría por statement_timeout (57014) cuando la BD iba cargada.
const markStale = (table) => markStaleBatched({ url: SUPABASE_URL, key: SERVICE_ROLE, table, runStart });

// La N1 "Ofertas" (bilingüe: "Ofertes") NO es taxonomía real: agrupa productos
// que ya están en su categoría de verdad (Lácteos, Bebidas…) pero en promoción.
// La usamos como fuente de la sección "Ofertas" (su nombre de subcategoría —
// "Precio rebajado", "2ª unidad con descuento"… — es el tipo de promo) y la
// SACAMOS de las categorías del catálogo. Detección por nombre (robusta a que
// cambie el uuid). Ver supabase/migrations/bonpreu_offers.sql.
const isOffersN1 = (name) => /^\s*ofert(a|e)s\s*$/i.test(name || '');

// Ramas N1 (por nombre exacto del árbol es) que cuentan como "alimentación" para
// la sección de Ofertas: solo se muestran ofertas de productos que pertenezcan a
// alguna de ellas. Quedan FUERA "Para el hogar", "Espacio mascotas" y "Acción
// solidaria". (Solo filtra las ofertas; el catálogo sigue teniéndolo todo.)
const OFFER_FOOD_N1 = new Set([
  'Frescos', 'Alimentación', 'Bebidas', 'Congelados', 'Lácteos y huevos',
  'Dietas, intolerancias y estilos de vida', 'Productos Km0', 'Bodega',
  'Cuidado personal', 'Limpieza del hogar', 'Parafarmacia', 'Bebés',
  'Prepárate para el verano',
]);
// Prioridad del tipo de promo cuando un producto está en varias subcategorías de
// oferta: se muestra la etiqueta más informativa. Menor = más prioritario.
const promoRank = (name) => {
  const n = (name || '').toLowerCase();
  if (/rebaj/.test(n)) return 0;              // Precio rebajado
  if (/2|seg[oa]n|unitat|unidad/.test(n)) return 1; // 2as unidades con descuento
  if (/lot/.test(n)) return 2;                // Lotes oferta
  if (/bonif/.test(n)) return 3;              // Bonificaciones
  if (/regal/.test(n)) return 4;              // Unidades regalo
  return 5;                                    // Otras ofertas
};

// ── Categorías (sin WAF) ─────────────────────────────────────────────────────
// Devuelve también offerIds (todas las categorías del árbol "Ofertas") y
// offerNames (id → nombre, en el idioma pedido) para etiquetar las promos.
async function fetchCategoryTree(lang = LANG) {
  const res = await fetch(CATS_API, { headers: { Accept: 'application/json', Cookie: `language=${lang}` } });
  if (!res.ok) throw new Error(`categories ${res.status}`);
  const n1s = await res.json();
  const catRows = [], n2s = [];
  const offerIds = new Set();
  const offerNames = new Map();
  for (const n1 of n1s) {
    const isOffers = isOffersN1(n1.name);
    if (isOffers) {
      offerIds.add(n1.categoryId);
      offerNames.set(n1.categoryId, n1.name);
    } else {
      catRows.push({ id: n1.categoryId, name: n1.name, parent_id: null, product_count: n1.productCount ?? null, published: true, synced_at: runStart });
    }
    for (const n2 of n1.childCategories ?? []) {
      if (isOffers) {
        offerIds.add(n2.categoryId);
        offerNames.set(n2.categoryId, n2.name);
      } else {
        catRows.push({ id: n2.categoryId, name: n2.name, parent_id: n1.categoryId, product_count: n2.productCount ?? null, published: true, synced_at: runStart });
      }
      // Las subcategorías de oferta SÍ se rastrean (para saber qué productos van
      // en promoción y de qué tipo); solo se excluyen del árbol de categorías.
      if ((n2.productCount ?? 0) > 0) n2s.push({ id: n2.categoryId, name: n2.name });
    }
  }
  return { catRows, n2s, offerIds, offerNames };
}

// ── Procesar una categoría ───────────────────────────────────────────────────
// Hace scroll capturando las respuestas de los PUT (hidratación). Los productos
// que la página hidrata SON los de esta categoría → `localIds` = pertenencia.
// No depende de window.__INITIAL_STATE__ (en CI/headless no está disponible al
// evaluar; la SPA ya lo consumió). `membership`: Map<productId, Set<categoryId>>.
async function processCategory(page, cat, products, membership, retailerLinks) {
  const localIds = new Set();
  const onResp = async (resp) => {
    const req = resp.request();
    if (req.method() === 'PUT' && resp.url().includes('/v6/products')) {
      try {
        const d = await resp.json();
        for (const p of d.products || []) {
          if (!p?.productId) continue;
          localIds.add(p.productId);
          if (!products.has(p.productId)) products.set(p.productId, normalize(p));
        }
      } catch {}
    }
  };
  page.on('response', onResp);
  try {
    await page.goto(`${HOME}/categories/${cat.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let last = -1, stable = 0;
    for (let i = 0; i < 120 && stable < 4; i++) {
      await page.mouse.wheel(0, 14000);
      await page.waitForTimeout(350);
      if (localIds.size === last) stable++; else { stable = 0; last = localIds.size; }
    }
    const links = await page.locator('a[data-test="fop-product-link"][href*="/products/"]').evaluateAll((els) =>
      els.filter((a) => a.getAttribute('aria-hidden') !== 'true').map((a) => ({ href: a.href })));
    for (const link of links) {
      const retailerId = new URL(link.href).pathname.split('/').filter(Boolean).pop();
      if (retailerId && !retailerLinks.has(retailerId)) {
        retailerLinks.set(retailerId, { href: link.href, categoryUrl: `${HOME}/categories/${cat.id}` });
      }
    }
  } finally {
    page.off('response', onResp);
  }
  // Pertenencia: los productos hidratados por esta categoría son sus productos.
  for (const id of localIds) {
    let set = membership.get(id);
    if (!set) membership.set(id, (set = new Set()));
    set.add(cat.id);
  }
}

// Recorre TODAS las categorías N2 en un idioma (cookie `language=lang`) y captura
// los productos hidratados. Devuelve products (Map id→detalles) y membership
// (Map id→Set<categoryId>). En la 2ª pasada (catalán) solo se usa products para leer
// el display_name en català; el membership/categorías sale de la pasada primaria.
async function crawlProducts(cats, lang) {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, headless: true });
  const retailerLinks = new Map();
  const products = new Map();      // productId → detalles
  const membership = new Map();    // productId → Set<categoryId>
  try {
    const ctx = await browser.newContext({ locale: lang });
    // Fija el idioma del catálogo (los PUT /v6/products hidratan en este idioma).
    await ctx.addCookies([{ name: 'language', value: lang, domain: new URL(HOME).hostname, path: '/' }]);

    // Calentar el WAF en una pestaña (token compartido por el contexto).
    const warm = await ctx.newPage();
    await warm.goto(`${HOME}/categories/${cats[0].id}`, { waitUntil: 'networkidle', timeout: 60000 });
    await warm.waitForTimeout(1500);

    // Pool de pestañas que consumen la cola de categorías.
    const queue = [...cats];
    let done = 0;
    const pages = [warm, ...(await Promise.all(Array.from({ length: CONCURRENCY - 1 }, () => ctx.newPage())))];
    await Promise.all(pages.map(async (pg) => {
      for (;;) {
        const cat = queue.shift();
        if (!cat) break;
        try { await processCategory(pg, cat, products, membership, retailerLinks); }
        catch (e) { console.warn(`[bonpreu:${lang}] ${cat.name} falló: ${e.message}`); }
        if (++done % 10 === 0) console.log(`[bonpreu:${lang}] ${done}/${cats.length} categorías · ${products.size} productos`);
      }
    }));
  } finally {
    await browser.close();
  }
  return { products, membership, retailerLinks };
}

const DETAIL_FIELDS = ['product_info', 'supplier_name', 'ingredients', 'nutrition'];

async function fetchExistingDetails() {
  const result = new Map();
  if (DRY_RUN) return result;
  const cols = ['id', 'brand', 'detail_synced_at', ...DETAIL_FIELDS].join(',');
  for (let offset = 0;; offset += 1000) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bonpreu_products?select=${encodeURIComponent(cols)}&order=id&limit=1000&offset=${offset}`, {
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
    });
    if (!res.ok) throw new Error(`read bonpreu_products details ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    for (const row of rows) result.set(row.id, row);
    if (rows.length < 1000) break;
  }
  return result;
}

async function crawlProductDetails(rows, retailerLinks) {
  if (SKIP_DETAIL) return;
  const existing = await fetchExistingDetails();
  const cutoff = Date.now() - DETAIL_TTL_DAYS * 86400000;
  const groups = new Map();
  for (const row of rows) {
    const old = existing.get(row.id);
    for (const field of DETAIL_FIELDS) row[field] = old?.[field] ?? null;
    row.detail_synced_at = old?.detail_synced_at ?? null;
    // Hay fichas que legítimamente no publican proveedor o nutrición. El timestamp
    // evita que esas ausencias consuman siempre el cupo de backfill.
    const stale = !old?.detail_synced_at || Date.parse(old.detail_synced_at) < cutoff;
    const link = retailerLinks.get(row.retailer_product_id);
    if (stale && link) {
      let group = groups.get(link.categoryUrl);
      if (!group) groups.set(link.categoryUrl, (group = []));
      group.push({ row, link });
    }
  }
  const pending = [...groups.values()].flat().slice(0, DETAIL_MAX);
  if (!pending.length) { console.log('[bonpreu] fichas: nada pendiente'); return; }
  console.log(`[bonpreu] fichas: ${pending.length} pendientes (lÃ­mite ${DETAIL_MAX})`);
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, headless: true });
  try {
    const ctx = await browser.newContext({ locale: LANG });
    await ctx.addCookies([{ name: 'language', value: LANG, domain: new URL(HOME).hostname, path: '/' }]);
    const queue = [...groups.values()].filter((group) => group.some((item) => pending.includes(item)));
    const pages = await Promise.all(Array.from({ length: Math.max(1, DETAIL_CONCURRENCY) }, () => ctx.newPage()));
    let done = 0;
    await Promise.all(pages.map(async (page) => {
      for (;;) {
        const group = queue.shift();
        if (!group) break;
        const work = group.filter((item) => pending.includes(item));
        try {
          await page.goto(group[0].link.categoryUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.locator('#onetrust-accept-btn-handler').click({ force: true, timeout: 2000 }).catch(() => {});
          for (const item of work) {
            let index = -1;
            for (let i = 0; i < 120 && index < 0; i++) {
              index = await page.locator('a[data-test="fop-product-link"]').evaluateAll((els, href) =>
                els.findIndex((a) => a.href === href && a.getAttribute('aria-hidden') !== 'true'), item.link.href);
              if (index < 0) { await page.mouse.wheel(0, 14000); await page.waitForTimeout(350); }
            }
            if (index < 0) continue;
            await page.locator('a[data-test="fop-product-link"]').nth(index).click({ force: true });
            await page.waitForTimeout(700);
            const detail = parseProductDetailHtml(await page.content());
            for (const field of DETAIL_FIELDS) if (detail[field]) item.row[field] = detail[field];
            if (detail.brand && !item.row.brand) item.row.brand = detail.brand;
            item.row.detail_synced_at = runStart;
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async () => {
              await page.goto(group[0].link.categoryUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            });
            await page.waitForTimeout(250);
            if (++done % 25 === 0) console.log(`[bonpreu] fichas ${done}/${pending.length}`);
          }
        } catch (e) { console.warn(`[bonpreu] grupo de fichas fallÃ³: ${e.message}`); }
      }
    }));
  } finally { await browser.close(); }
}

async function main() {
  console.log(`[bonpreu] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} conc=${CONCURRENCY}`);
  const { catRows, n2s, offerIds, offerNames } = await fetchCategoryTree(LANG);
  // Nombres de categoría en catalán (API abierta, una sola petición) → name_ca.
  let caCatName = new Map();
  let offerNamesCa = new Map();
  try {
    const caTree = await fetchCategoryTree(LANG_CA);
    caCatName = new Map(caTree.catRows.map((c) => [c.id, c.name]));
    offerNamesCa = caTree.offerNames;
  } catch (e) { console.warn(`[bonpreu] árbol ${LANG_CA} falló: ${e.message}`); }
  for (const c of catRows) c.name_ca = caCatName.get(c.id) ?? null;
  console.log(`[bonpreu] ${offerIds.size} categorías de oferta (excluidas del árbol)`);

  // Ofertas SOLO de alimentación: N2 que cuelgan de una N1 de OFFER_FOOD_N1. Una
  // oferta se muestra si el producto pertenece (por su categoría real) a alguna.
  const foodN1Ids = new Set(catRows.filter((c) => c.parent_id == null && OFFER_FOOD_N1.has(c.name)).map((c) => c.id));
  const foodN2Ids = new Set(catRows.filter((c) => c.parent_id != null && foodN1Ids.has(c.parent_id)).map((c) => c.id));

  const cats = n2s.slice(0, MAX_CATEGORIES);
  console.log(`[bonpreu] ${catRows.length} categorías, ${n2s.length} N2 con productos (proceso ${cats.length})`);

  const catName = new Map(n2s.map((c) => [c.id, c.name]));

  // Pasada primaria (castellano): productos + pertenencia a categorías.
  const { products, membership, retailerLinks } = await crawlProducts(cats, LANG);

  // 2ª pasada (catalán): solo nombres, casados por id (estable entre idiomas).
  let caName = new Map();
  if (!DRY_RUN) {
    console.log(`[bonpreu] 2ª pasada en ${LANG_CA} (nombres en català)…`);
    const { products: productsCa } = await crawlProducts(cats, LANG_CA);
    caName = new Map([...productsCa].map(([id, p]) => [id, p.display_name]).filter(([, n]) => n));
    console.log(`[bonpreu] ${caName.size} nombres en català`);
  }

  // Adjuntar a cada producto sus categorías reales (las que lo listan en su SSR)
  // + el nombre en català (display_name_ca; null → la app cae al castellano).
  const rows = [];
  let onOffer = 0;
  for (const [id, det] of products) {
    if (!det.display_name) continue;
    const mem = [...(membership.get(id) ?? [])];
    // Separa la pertenencia real (categorías del catálogo) de las de oferta.
    const offerMem = mem.filter((c) => offerIds.has(c));
    const realMem = mem.filter((c) => !offerIds.has(c));
    // Solo se marca como oferta si es alimentación (alguna categoría real de food).
    const isFood = realMem.some((c) => foodN2Ids.has(c));
    // Etiqueta de promo = subcategoría de oferta más informativa (promoRank).
    let promoId = null;
    if (isFood) for (const c of offerMem) {
      if (promoId == null || promoRank(offerNames.get(c)) < promoRank(offerNames.get(promoId))) promoId = c;
    }
    const promo_name = promoId ? offerNames.get(promoId) ?? null : null;
    const promo_name_ca = promoId ? offerNamesCa.get(promoId) ?? offerNames.get(promoId) ?? null : null;
    if (promo_name) onOffer++;
    rows.push({
      ...det,
      display_name_ca: caName.get(id) ?? null,
      category_ids: realMem,
      category_id: realMem[0] ?? null,
      category_name: realMem[0] ? catName.get(realMem[0]) ?? null : null,
      promo_name,
      promo_name_ca,
    });
  }
  console.log(`[bonpreu] ${rows.length} productos únicos · ${onOffer} en oferta`);

  await crawlProductDetails(rows, retailerLinks);
  if (DRY_RUN) console.log('[bonpreu] detalle detectado:', {
    informacion: rows.filter((r) => r.product_info).length,
    proveedor: rows.filter((r) => r.supplier_name).length,
    ingredientes: rows.filter((r) => r.ingredients).length,
    nutricion: rows.filter((r) => r.nutrition).length,
  });

  if (DRY_RUN) {
    const perCat = new Map();
    for (const r of rows) for (const c of r.category_ids) perCat.set(c, (perCat.get(c) ?? 0) + 1);
    console.log('productos por categoría (las procesadas):');
    for (const c of cats) console.log(`  ${c.name}: ${perCat.get(c.id) ?? 0}`);
    console.log('nulos →', {
      sin_precio: rows.filter((r) => r.unit_price == null).length,
      sin_ppu: rows.filter((r) => r.price_per_unit == null).length,
      sin_img: rows.filter((r) => !r.thumbnail).length,
      sin_categoria: rows.filter((r) => r.category_ids.length === 0).length,
      con_oferta: rows.filter((r) => r.promo_name != null).length,
    });
    if (offerNames.size) {
      const byPromo = new Map();
      for (const r of rows) if (r.promo_name) byPromo.set(r.promo_name, (byPromo.get(r.promo_name) ?? 0) + 1);
      console.log('ofertas por tipo:', Object.fromEntries(byPromo));
    }
    return;
  }
  if (rows.length === 0) throw new Error('0 productos (¿WAF/navegador?)');

  await upsert('bonpreu_categories', catRows);
  await upsert('bonpreu_products', rows);
  await markStale('bonpreu_products');
  await markStale('bonpreu_categories');
  console.log('[bonpreu] OK');
}

main().catch((e) => { console.error('[bonpreu] ERROR', e); process.exit(1); });
