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
// La web es catalana por defecto. El idioma se fija con la cookie `language`
// (NO con Accept-Language ni con el dominio, que los ignoran); con `es-ES` tanto
// la API de categorías como la hidratación de productos devuelven castellano.
const LANG = process.env.BONPREU_LANG || 'es-ES';
const runStart = new Date().toISOString();
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ── Normalización (forma de producto de Bonpreu) ─────────────────────────────
const num = (v) => { const n = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(n) ? n : null; };
const priceAmount = (p) => num(p?.price?.current?.amount) ?? num(p?.unitPrice?.price?.amount);
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
  return {
    id: p.productId,
    retailer_product_id: p.retailerProductId ?? null,
    display_name: (p.name || '').trim(),
    brand: p.brand ?? null,
    packaging: p.packSizeDescription ?? null,
    thumbnail: imageUrl(p),
    unit_price: priceAmount(p),
    price_format: priceText(p),
    available: p.available !== false,
    is_new: !!p.isNew,
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

// ── Categorías (sin WAF) ─────────────────────────────────────────────────────
async function fetchCategoryTree() {
  const res = await fetch(CATS_API, { headers: { Accept: 'application/json', Cookie: `language=${LANG}` } });
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

async function main() {
  console.log(`[bonpreu] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} conc=${CONCURRENCY}`);
  const { catRows, n2s } = await fetchCategoryTree();
  const cats = n2s.slice(0, MAX_CATEGORIES);
  console.log(`[bonpreu] ${catRows.length} categorías, ${n2s.length} N2 con productos (proceso ${cats.length})`);

  const catName = new Map(n2s.map((c) => [c.id, c.name]));
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, headless: true });
  const products = new Map();      // productId → detalles
  const membership = new Map();    // productId → Set<categoryId>
  try {
    const ctx = await browser.newContext({ locale: LANG });
    // Fija el idioma del catálogo (los PUT /v6/products hidratan en este idioma).
    await ctx.addCookies([{ name: 'language', value: LANG, domain: new URL(HOME).hostname, path: '/' }]);

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
        catch (e) { console.warn(`[bonpreu] ${cat.name} falló: ${e.message}`); }
        if (++done % 10 === 0) console.log(`[bonpreu] ${done}/${cats.length} categorías · ${products.size} productos`);
      }
    }));
  } finally {
    await browser.close();
  }

  // Adjuntar a cada producto sus categorías reales (las que lo listan en su SSR).
  const rows = [];
  for (const [id, det] of products) {
    if (!det.display_name) continue;
    const mem = [...(membership.get(id) ?? [])];
    rows.push({
      ...det,
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
