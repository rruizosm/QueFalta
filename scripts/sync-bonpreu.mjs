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

// ── Categorías (sin WAF) ─────────────────────────────────────────────────────
async function fetchCategoryTree(lang = LANG) {
  const res = await fetch(CATS_API, { headers: { Accept: 'application/json', Cookie: `language=${lang}` } });
  if (!res.ok) throw new Error(`categories ${res.status}`);
  const n1s = await res.json();
  const catRows = [], n2s = [];
  for (const n1 of n1s) {
    catRows.push({ id: n1.categoryId, name: n1.name, parent_id: null, product_count: n1.productCount ?? null, published: true, synced_at: runStart });
    for (const n2 of n1.childCategories ?? []) {
      catRows.push({ id: n2.categoryId, name: n2.name, parent_id: n1.categoryId, product_count: n2.productCount ?? null, published: true, synced_at: runStart });
      if ((n2.productCount ?? 0) > 0) n2s.push({ id: n2.categoryId, name: n2.name });
    }
  }
  return { catRows, n2s };
}

// ── Procesar una categoría ───────────────────────────────────────────────────
// Hace scroll capturando las respuestas de los PUT (hidratación). Los productos
// que la página hidrata SON los de esta categoría → `localIds` = pertenencia.
// No depende de window.__INITIAL_STATE__ (en CI/headless no está disponible al
// evaluar; la SPA ya lo consumió). `membership`: Map<productId, Set<categoryId>>.
async function processCategory(page, cat, products, membership) {
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
        try { await processCategory(pg, cat, products, membership); }
        catch (e) { console.warn(`[bonpreu:${lang}] ${cat.name} falló: ${e.message}`); }
        if (++done % 10 === 0) console.log(`[bonpreu:${lang}] ${done}/${cats.length} categorías · ${products.size} productos`);
      }
    }));
  } finally {
    await browser.close();
  }
  return { products, membership };
}

async function main() {
  console.log(`[bonpreu] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} conc=${CONCURRENCY}`);
  const { catRows, n2s } = await fetchCategoryTree(LANG);
  // Nombres de categoría en catalán (API abierta, una sola petición) → name_ca.
  let caCatName = new Map();
  try {
    const caTree = await fetchCategoryTree(LANG_CA);
    caCatName = new Map(caTree.catRows.map((c) => [c.id, c.name]));
  } catch (e) { console.warn(`[bonpreu] árbol ${LANG_CA} falló: ${e.message}`); }
  for (const c of catRows) c.name_ca = caCatName.get(c.id) ?? null;

  const cats = n2s.slice(0, MAX_CATEGORIES);
  console.log(`[bonpreu] ${catRows.length} categorías, ${n2s.length} N2 con productos (proceso ${cats.length})`);

  const catName = new Map(n2s.map((c) => [c.id, c.name]));

  // Pasada primaria (castellano): productos + pertenencia a categorías.
  const { products, membership } = await crawlProducts(cats, LANG);

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
  for (const [id, det] of products) {
    if (!det.display_name) continue;
    const mem = [...(membership.get(id) ?? [])];
    rows.push({
      ...det,
      display_name_ca: caName.get(id) ?? null,
      category_ids: mem,
      category_id: mem[0] ?? null,
      category_name: mem[0] ? catName.get(mem[0]) ?? null : null,
    });
  }
  console.log(`[bonpreu] ${rows.length} productos únicos`);

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
    });
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
