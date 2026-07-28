#!/usr/bin/env node
// Sincroniza el catálogo de BonpreuEsclat → Supabase (catálogo + búsqueda).
//
// Bonpreu protege la web con AWS WAF. La SPA, una vez resuelto su challenge,
// consume un endpoint paginado de productos por categoría. Usamos ese mismo
// endpoint dentro del navegador y repartimos el trabajo en ciclos reanudables:
//   1. GET /v1/categories (abierto, sin WAF) → categorías N2.
//   2. Navegador: una carga de HOME resuelve el challenge de forma normal.
//   3. Cada ejecución guarda un lote pequeño en staging, sin tocar producción.
//   4. Al completar ambos idiomas, publica el ciclo y entonces marca ausentes.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      PW_CHANNEL=chrome   (usar Chrome del sistema en local; vacío en CI = chromium)
//      CATEGORY_API_DELAY_MS=100 (pausa entre páginas de la API)
//      BONPREU_BATCH_SIZE=12 (categorías por ejecución y ciclo)
//      DRY_RUN=1           (no escribe en Supabase; imprime resumen)
//      MAX_CATEGORIES=N    (limita nº de categorías, para pruebas)
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';
import { canonicalPricePerUnit } from './lib/price.mjs';
import { markStale as markStaleBatched } from './lib/stale.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const MAX_CATEGORIES = process.env.MAX_CATEGORIES ? Number(process.env.MAX_CATEGORIES) : Infinity;
const BATCH_SIZE = Math.max(1, Number(process.env.BONPREU_BATCH_SIZE || 12));
const CATEGORY_API_DELAY_MS = Math.max(0, Number(process.env.CATEGORY_API_DELAY_MS || 100));
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
const PRODUCT_PAGES_PATH = '/api/webproductpagews/v6/product-pages';
// El idioma se fija con la cookie `language` (NO con Accept-Language ni con el
// dominio, que los ignoran), y controla TANTO la API de categorías como la
// respuesta de productos. La web es bilingüe (es-ES | ca-ES).
// Hacemos la app bilingüe (como Mercadona): guardamos los DOS idiomas y la app
// elige según el idioma activo. Pasada PRIMARIA = castellano (rellena display_name
// / name); 2ª pasada = catalán (rellena display_name_ca / name_ca, casando por id,
// que es estable entre idiomas). El catálogo se recorre DOS veces (~2× tiempo).
const LANG = process.env.BONPREU_LANG || 'es-ES';     // primario (castellano)
const LANG_CA = process.env.BONPREU_LANG_CA || 'ca-ES'; // 2ª pasada (catalán)
const runStart = new Date().toISOString();
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// AWS WAF empezó a bloquear el fingerprint predeterminado de Playwright
// (`HeadlessChrome` + navigator.webdriver) aunque el navegador resolviera su
// challenge y recibiera `aws-waf-token`. Conservamos Chromium headless, pero
// anunciamos su versión real como Chrome y desactivamos la señal de automatización.
const browserPlatform = process.platform === 'win32'
  ? 'Windows NT 10.0; Win64; x64'
  : process.platform === 'darwin'
    ? 'Macintosh; Intel Mac OS X 10_15_7'
    : 'X11; Linux x86_64';
const chromeUserAgent = (version) =>
  `Mozilla/5.0 (${browserPlatform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;

async function launchBonpreuBrowser(lang) {
  const browser = await chromium.launch({
    channel: process.env.PW_CHANNEL || undefined,
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  try {
    const ctx = await browser.newContext({
      locale: lang,
      userAgent: chromeUserAgent(browser.version()),
    });
    await ctx.addCookies([{ name: 'language', value: lang, domain: new URL(HOME).hostname, path: '/' }]);
    return { browser, ctx };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function assertWafPassed(page, label) {
  const title = await page.title().catch(() => '');
  if (/human verification|request could not be satisfied/i.test(title)) {
    throw new Error(`AWS WAF bloqueó ${label} (${title || 'sin título'})`);
  }
}

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
const promotionText = (p) => {
  const promotions = Array.isArray(p?.promotions) ? p.promotions : [p?.promotions];
  return promotions
    .map((promotion) => typeof promotion?.description === 'string' ? promotion.description.trim() : '')
    .filter(Boolean)
    .join(' · ') || null;
};
// Bonpreu puede publicar la rebaja de dos maneras: precio normal + promoPrice,
// o precio final + texto "Antes X,XX€". Conservamos ambos importes para que la
// ficha muestre una oferta real, no el último cambio semanal de precio.
function promotionPrices(p) {
  const current = priceAmount(p);
  const promo = num(p?.promoPrice?.amount);
  if (current != null && promo != null && promo < current) {
    return { promoPrice: promo, basePrice: current };
  }
  const text = promotionText(p);
  const match = text?.match(/\bantes\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:€|eur)\b/i);
  const base = match ? num(match[1].replace(',', '.')) : null;
  return { promoPrice: null, basePrice: current != null && base != null && base > current ? base : null };
}
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

function supplierFromAdditionalDescription(value) {
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
  const labelRe = /^(?:(?:nombre|nom)\s+(?:del|de\s+l['’])\s*)?(?:operador|proveedor|proveidor)\s*:?\s*(.*)$/i;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(labelRe);
    if (!match) continue;
    const supplier = (match[1] || lines[i + 1] || '').replace(/^[:\s-]+/, '').trim();
    if (supplier) return supplier;
  }
  return null;
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
  else if (/descripcion adicional|descripcio addicional|additional description/.test(key)) {
    out.supplier_name ??= supplierFromAdditionalDescription(value);
  }
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
  const { promoPrice, basePrice } = promotionPrices(p);
  return {
    id: p.productId,
    retailer_product_id: p.retailerProductId ?? null,
    display_name: (p.name || '').trim(),
    brand: p.brand ?? null,
    packaging: p.packSizeDescription ?? null,
    thumbnail: imageUrl(p),
    unit_price: priceAmount(p),
    promo_price: promoPrice,
    promo_base_price: basePrice,
    promo_text: promotionText(p),
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
  if (!rows.length) return;
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

const restHeaders = (extra = {}) => ({
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  ...extra,
});

async function restMutation(table, query, method, body) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(1500 * 2 ** (attempt - 1));
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`, {
        method,
        headers: restHeaders({
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        }),
        body: body == null ? undefined : JSON.stringify(body),
      });
      if (res.ok) return;
      last = new Error(`${method} ${table} ${res.status}: ${await res.text()}`);
    } catch (error) {
      last = error;
    }
    console.warn(`[bonpreu] ${String(last.message).split('\n')[0]} (intento ${attempt + 1}/4)`);
  }
  throw last;
}

async function readAll(table, query, order = '') {
  const result = [];
  for (let offset = 0;; offset += 1000) {
    const separator = query ? '&' : '';
    const orderQuery = order ? `&order=${encodeURIComponent(order)}` : '';
    const url = `${SUPABASE_URL}/rest/v1/${table}?${query}${separator}limit=1000&offset=${offset}${orderQuery}`;
    const res = await fetch(url, { headers: restHeaders() });
    if (!res.ok) throw new Error(`read ${table} ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    result.push(...rows);
    if (rows.length < 1000) break;
  }
  return result;
}

async function getActiveCycle() {
  const rows = await readAll(
    'bonpreu_sync_cycles',
    'select=*&status=in.(collecting,finalizing)',
    'created_at.asc',
  );
  return rows[0] ?? null;
}

const updateCycle = (id, values) => restMutation(
  'bonpreu_sync_cycles',
  `id=eq.${encodeURIComponent(id)}`,
  'PATCH',
  { ...values, updated_at: new Date().toISOString() },
);

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
// El endpoint paginado que consume la propia SPA devuelve productos completos
// con `maxProductsToDecorate=300`.
function decoratedProducts(data) {
  const result = [];
  for (const group of data?.productGroups ?? []) {
    for (const product of group?.decoratedProducts ?? []) {
      if (product?.productId) result.push(product);
    }
  }
  return result;
}

async function fetchCategoryProducts(page, cat) {
  const products = new Map();
  const seenTokens = new Set();
  let pageToken = null;

  for (let pageNumber = 1; pageNumber <= 100; pageNumber++) {
    const params = new URLSearchParams({
      categoryId: cat.id,
      maxProductsToDecorate: '300',
      maxPageSize: '300',
    });
    params.append('tag', 'web');
    params.append('tag', 'category-item');
    if (pageToken) params.set('pageToken', pageToken);
    else params.set('includeAdditionalPageInfo', 'true');

    const path = `${PRODUCT_PAGES_PATH}?${params}`;
    const response = await page.evaluate(async (requestPath) => {
      const res = await fetch(requestPath, { headers: { Accept: 'application/json' } });
      return {
        ok: res.ok,
        status: res.status,
        wafAction: res.headers.get('x-amzn-waf-action'),
        body: await res.text(),
      };
    }, path);

    if (response.wafAction || !response.ok) {
      throw new Error(
        `product-pages ${response.status}${response.wafAction ? ` WAF=${response.wafAction}` : ''}`,
      );
    }

    let data;
    try {
      data = JSON.parse(response.body);
    } catch {
      throw new Error(`product-pages ${response.status}: respuesta no JSON`);
    }
    for (const product of decoratedProducts(data)) products.set(product.productId, product);

    const next = data?.metadata?.nextPageToken ?? data?.nextPageToken ?? null;
    if (!next) break;
    if (pageNumber === 100) throw new Error('product-pages superó el límite de 100 páginas');
    if (seenTokens.has(next)) throw new Error('product-pages repitió nextPageToken');
    seenTokens.add(next);
    pageToken = next;
    if (CATEGORY_API_DELAY_MS) await page.waitForTimeout(CATEGORY_API_DELAY_MS);
  }

  if (!products.size) throw new Error('product-pages devolvió 0 productos en una categoría con stock');
  return [...products.values()];
}

const productSlug = (name) => String(name ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/['’]+/g, '-')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

// Recorre TODAS las categorías N2 en un idioma (cookie `language=lang`) y captura
// los productos paginados. Devuelve products (Map id→detalles) y membership
// (Map id→Set<categoryId>). En la 2ª pasada (catalán) solo se usa products para leer
// el display_name en català; el membership/categorías sale de la pasada primaria.
async function crawlProducts(cats, lang) {
  const { browser, ctx } = await launchBonpreuBrowser(lang);
  const retailerLinks = new Map();
  const products = new Map();      // productId → detalles
  const membership = new Map();    // productId → Set<categoryId>
  try {
    // Una única navegación obtiene el token WAF. El resto son peticiones de
    // datos iguales a las que hace la SPA, dentro del mismo origen y contexto.
    const page = await ctx.newPage();
    await page.goto(HOME, { waitUntil: 'networkidle', timeout: 60000 });
    await assertWafPassed(page, `el calentamiento ${lang}`);

    for (let index = 0; index < cats.length; index++) {
      const cat = cats[index];
      let categoryProducts;
      try {
        categoryProducts = await fetchCategoryProducts(page, cat);
      } catch (error) {
        throw new Error(`rastreo incompleto en ${cat.name}: ${error.message}`);
      }
      for (const product of categoryProducts) {
        if (!products.has(product.productId)) products.set(product.productId, normalize(product));
        let set = membership.get(product.productId);
        if (!set) membership.set(product.productId, (set = new Set()));
        set.add(cat.id);

        const retailerId = product.retailerProductId;
        if (retailerId != null && !retailerLinks.has(retailerId)) {
          const slug = productSlug(product.name) || 'producte';
          retailerLinks.set(retailerId, {
            href: `${HOME}/products/${slug}/${encodeURIComponent(retailerId)}`,
            categoryUrl: `${HOME}/categories/${cat.id}`,
          });
        }
      }
      if ((index + 1) % 10 === 0 || index + 1 === cats.length) {
        console.log(`[bonpreu:${lang}] ${index + 1}/${cats.length} categorías · ${products.size} productos`);
      }
      if (CATEGORY_API_DELAY_MS) await page.waitForTimeout(CATEGORY_API_DELAY_MS);
    }
  } finally {
    await browser.close();
  }
  return { products, membership, retailerLinks };
}

const DETAIL_FIELDS = ['product_info', 'supplier_name', 'ingredients', 'nutrition'];
// La primera versión no detectaba el proveedor porque Bonpreu lo publica como
// "Nombre del operador" dentro de "Descripción adicional". Fuerza una sola
// recarga de las fichas anteriores a esta versión; el nuevo timestamp evita
// reintentos diarios en productos que legítimamente no incluyen ese dato.
const SUPPLIER_PARSER_REFRESH_AFTER = Date.parse('2026-07-20T20:00:00.000Z');

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

async function openProductFromCategory(page, href) {
  const targetPath = new URL(href).pathname;
  for (let i = 0; i < 120; i++) {
    // The virtualized grid replaces nodes while Playwright scrolls to them.
    // Clicking synchronously in the DOM by stable URL avoids stale nth indexes.
    const clicked = await page.locator('a[data-test="fop-product-link"]').evaluateAll((links, targetHref) => {
      const link = links.find((candidate) => candidate.href === targetHref
        && candidate.getAttribute('aria-hidden') !== 'true');
      if (!link) return false;
      link.click();
      return true;
    }, href);
    if (clicked) {
      await page.waitForURL((url) => url.pathname === targetPath, { timeout: 30000 });
      // Some fresh products legitimately have no detail sections. The stable
      // product URL plus a short hydration wait is therefore the success signal.
      await page.waitForTimeout(700);
      return true;
    }
    await page.mouse.wheel(0, 14000);
    await page.waitForTimeout(350);
  }
  return false;
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
    const detailSyncedAt = Date.parse(old?.detail_synced_at);
    const needsSupplierRefresh = !old?.supplier_name
      && (!Number.isFinite(detailSyncedAt) || detailSyncedAt < SUPPLIER_PARSER_REFRESH_AFTER);
    const stale = !Number.isFinite(detailSyncedAt) || detailSyncedAt < cutoff || needsSupplierRefresh;
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
  const { browser, ctx } = await launchBonpreuBrowser(LANG);
  try {
    const queue = [...groups.values()].filter((group) => group.some((item) => pending.includes(item)));
    // El contexto de fichas es independiente del rastreo del catálogo. Resuelve
    // aquí el challenge una vez para compartir el token con todos sus workers.
    const warm = await ctx.newPage();
    try {
      await warm.goto(pending[0].link.categoryUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await assertWafPassed(warm, 'el calentamiento de fichas');
    } finally {
      await warm.close();
    }
    const pages = await Promise.all(Array.from({ length: Math.max(1, DETAIL_CONCURRENCY) }, () => ctx.newPage()));
    let attempted = 0, succeeded = 0, failed = 0;
    await Promise.all(pages.map(async (page) => {
      for (;;) {
        const group = queue.shift();
        if (!group) break;
        const work = group.filter((item) => pending.includes(item));
        try {
          await page.goto(group[0].link.categoryUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.locator('#onetrust-accept-btn-handler').click({ force: true, timeout: 2000 }).catch(() => {});
          for (const item of work) {
            try {
              const opened = await openProductFromCategory(page, item.link.href);
              if (!opened) throw new Error('product link not found after scrolling the category');
              const detail = parseProductDetailHtml(await page.content());
              for (const field of DETAIL_FIELDS) if (detail[field]) item.row[field] = detail[field];
              if (detail.brand && !item.row.brand) item.row.brand = detail.brand;
              item.row.detail_synced_at = runStart;
              succeeded++;
            } catch (e) {
              failed++;
              console.warn(`[bonpreu] ficha ${item.row.retailer_product_id} fallo: ${e.message}`);
            } finally {
              attempted++;
              try {
                if (new URL(page.url()).pathname.startsWith('/products/')) {
                  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async () => {
                    await page.goto(group[0].link.categoryUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                  });
                } else if (!page.url().startsWith(group[0].link.categoryUrl)) {
                  await page.goto(group[0].link.categoryUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                }
              } catch (e) {
                console.warn(`[bonpreu] no se pudo restaurar la categoria: ${e.message}`);
              }
              await page.waitForTimeout(250);
              if (attempted % 25 === 0) {
                console.log(`[bonpreu] fichas ${attempted}/${pending.length} - ${succeeded} correctas - ${failed} fallidas`);
              }
            }
          }
        } catch (e) {
          failed += work.length;
          attempted += work.length;
          console.warn(`[bonpreu] categoria de fichas fallo: ${e.message}`);
        }
      }
    }));
    console.log(`[bonpreu] fichas completadas: ${succeeded}/${pending.length} - ${failed} fallidas`);
  } finally { await browser.close(); }
}

const serializeTree = ({ catRows, n2s, offerIds, offerNames }) => ({
  catRows,
  n2s,
  offerIds: [...offerIds],
  offerNames: Object.fromEntries(offerNames),
});

const hydrateTree = (tree) => ({
  catRows: Array.isArray(tree?.catRows) ? tree.catRows : [],
  n2s: Array.isArray(tree?.n2s) ? tree.n2s : [],
  offerIds: new Set(Array.isArray(tree?.offerIds) ? tree.offerIds : []),
  offerNames: new Map(Object.entries(tree?.offerNames ?? {})),
});

function buildCatalogRows(treeEs, treeCa, products, membership, caName) {
  const catRows = treeEs.catRows.map((category) => ({
    ...category,
    name_ca: treeCa.catRows.find((candidate) => candidate.id === category.id)?.name ?? null,
    published: true,
    synced_at: runStart,
  }));
  const catName = new Map(treeEs.n2s.map((category) => [category.id, category.name]));
  const foodN1Ids = new Set(
    catRows
      .filter((category) => category.parent_id == null && OFFER_FOOD_N1.has(category.name))
      .map((category) => category.id),
  );
  const foodN2Ids = new Set(
    catRows
      .filter((category) => category.parent_id != null && foodN1Ids.has(category.parent_id))
      .map((category) => category.id),
  );

  const rows = [];
  const retailerLinks = new Map();
  let onOffer = 0;
  for (const [id, membershipSet] of membership) {
    const details = products.get(id);
    if (!details?.display_name) continue;
    const memberOf = [...membershipSet];
    const offerMembership = memberOf.filter((categoryId) => treeEs.offerIds.has(categoryId));
    const realMembership = memberOf.filter((categoryId) => !treeEs.offerIds.has(categoryId));
    const isFood = realMembership.some((categoryId) => foodN2Ids.has(categoryId));
    let promoId = null;
    if (isFood) for (const categoryId of offerMembership) {
      if (
        promoId == null
        || promoRank(treeEs.offerNames.get(categoryId)) < promoRank(treeEs.offerNames.get(promoId))
      ) promoId = categoryId;
    }
    const promo_name = promoId ? treeEs.offerNames.get(promoId) ?? null : null;
    const promo_name_ca = promoId
      ? treeCa.offerNames.get(promoId) ?? treeEs.offerNames.get(promoId) ?? null
      : null;
    if (promo_name) onOffer++;
    const row = {
      ...details,
      synced_at: runStart,
      published: true,
      display_name_ca: caName.get(id) ?? null,
      category_ids: realMembership,
      category_id: realMembership[0] ?? null,
      category_name: realMembership[0] ? catName.get(realMembership[0]) ?? null : null,
      promo_name,
      promo_name_ca,
    };
    rows.push(row);

    if (row.retailer_product_id != null && row.category_id) {
      const slug = productSlug(row.display_name) || 'producte';
      retailerLinks.set(row.retailer_product_id, {
        href: `${HOME}/products/${slug}/${encodeURIComponent(row.retailer_product_id)}`,
        categoryUrl: `${HOME}/categories/${row.category_id}`,
      });
    }
  }
  return { catRows, rows, retailerLinks, onOffer };
}

async function createCycle() {
  console.log('[bonpreu] no hay ciclo activo; congelando el árbol de categorías');
  const [treeEsRaw, treeCaRaw] = await Promise.all([
    fetchCategoryTree(LANG),
    fetchCategoryTree(LANG_CA),
  ]);
  const caIds = new Set(treeCaRaw.n2s.map((category) => category.id));
  const missingCa = treeEsRaw.n2s.filter((category) => !caIds.has(category.id));
  if (missingCa.length) {
    throw new Error(`${missingCa.length} categorías del árbol español no existen en el catalán`);
  }
  const cycle = {
    id: randomUUID(),
    status: 'collecting',
    expected_categories: treeEsRaw.n2s.length,
    batch_size: BATCH_SIZE,
    tree_es: serializeTree(treeEsRaw),
    tree_ca: serializeTree(treeCaRaw),
    last_error: null,
  };
  await upsert('bonpreu_sync_cycles', [cycle]);
  console.log(`[bonpreu] ciclo ${cycle.id} creado · ${cycle.expected_categories} categorías`);
  return cycle;
}

async function completedSnapshots(cycleId) {
  return readAll(
    'bonpreu_sync_categories',
    `select=language,category_id,product_count&cycle_id=eq.${encodeURIComponent(cycleId)}`,
    'category_id.asc',
  );
}

async function stageLanguage(cycle, cats, lang, crawl) {
  if (!cats.length) return;
  const now = new Date().toISOString();
  const productRows = [...crawl.products].map(([productId, payload]) => ({
    cycle_id: cycle.id,
    language: lang,
    product_id: productId,
    payload: lang === LANG ? payload : { display_name: payload.display_name },
    updated_at: now,
  }));
  await upsert('bonpreu_sync_products', productRows);

  if (lang === LANG) {
    // Un reintento reemplaza por completo la pertenencia de cada categoría.
    for (const category of cats) {
      await restMutation(
        'bonpreu_sync_memberships',
        `cycle_id=eq.${encodeURIComponent(cycle.id)}&category_id=eq.${encodeURIComponent(category.id)}`,
        'DELETE',
      );
    }
    const memberships = [];
    for (const [productId, categoryIds] of crawl.membership) {
      for (const categoryId of categoryIds) {
        memberships.push({ cycle_id: cycle.id, category_id: categoryId, product_id: productId });
      }
    }
    await upsert('bonpreu_sync_memberships', memberships);
  }

  const checkpoints = cats.map((category) => ({
    cycle_id: cycle.id,
    language: lang,
    category_id: category.id,
    product_count: [...crawl.membership.values()].filter((ids) => ids.has(category.id)).length,
    completed_at: now,
  }));
  // El checkpoint siempre se escribe al final: una categoría marcada está
  // garantizada como completa en staging.
  await upsert('bonpreu_sync_categories', checkpoints);
  console.log(`[bonpreu:${lang}] staging confirmado · ${cats.length} categorías · ${productRows.length} productos únicos`);
}

async function finalizeCycle(cycle) {
  const treeEs = hydrateTree(cycle.tree_es);
  const treeCa = hydrateTree(cycle.tree_ca);
  const expectedIds = new Set(treeEs.n2s.map((category) => category.id));
  const snapshots = await completedSnapshots(cycle.id);
  const complete = new Set(
    snapshots
      .filter((snapshot) => expectedIds.has(snapshot.category_id))
      .map((snapshot) => `${snapshot.language}:${snapshot.category_id}`),
  );
  const missing = [...expectedIds].flatMap((categoryId) => [LANG, LANG_CA]
    .filter((language) => !complete.has(`${language}:${categoryId}`))
    .map((language) => `${language}:${categoryId}`));
  if (missing.length) throw new Error(`ciclo ${cycle.id} incompleto: faltan ${missing.length} snapshots`);

  if (cycle.status !== 'finalizing') {
    await updateCycle(cycle.id, { status: 'finalizing', last_error: null });
    cycle.status = 'finalizing';
  }
  console.log(`[bonpreu] publicando ciclo completo ${cycle.id}`);

  const [stagedProducts, stagedMemberships] = await Promise.all([
    readAll(
      'bonpreu_sync_products',
      `select=language,product_id,payload&cycle_id=eq.${encodeURIComponent(cycle.id)}`,
      'product_id.asc',
    ),
    readAll(
      'bonpreu_sync_memberships',
      `select=category_id,product_id&cycle_id=eq.${encodeURIComponent(cycle.id)}`,
      'product_id.asc',
    ),
  ]);
  const products = new Map();
  const caName = new Map();
  for (const staged of stagedProducts) {
    if (staged.language === LANG) products.set(staged.product_id, staged.payload);
    else if (staged.payload?.display_name) caName.set(staged.product_id, staged.payload.display_name);
  }
  const membership = new Map();
  const membershipCount = new Map();
  for (const staged of stagedMemberships) {
    let ids = membership.get(staged.product_id);
    if (!ids) membership.set(staged.product_id, (ids = new Set()));
    ids.add(staged.category_id);
    membershipCount.set(staged.category_id, (membershipCount.get(staged.category_id) ?? 0) + 1);
  }

  const spanishSnapshots = snapshots.filter((snapshot) => snapshot.language === LANG);
  for (const snapshot of spanishSnapshots) {
    const stored = membershipCount.get(snapshot.category_id) ?? 0;
    if (stored !== snapshot.product_count) {
      throw new Error(
        `staging inconsistente en ${snapshot.category_id}: checkpoint=${snapshot.product_count}, memberships=${stored}`,
      );
    }
  }
  const missingProducts = [...membership].filter(([productId]) => !products.has(productId));
  if (missingProducts.length) {
    throw new Error(`${missingProducts.length} productos con pertenencia no tienen payload español`);
  }

  const { catRows, rows, retailerLinks, onOffer } = buildCatalogRows(
    treeEs,
    treeCa,
    products,
    membership,
    caName,
  );
  if (!rows.length) throw new Error('0 productos en el ciclo completo');
  console.log(`[bonpreu] publicación preparada · ${rows.length} productos · ${onOffer} en oferta`);

  await crawlProductDetails(rows, retailerLinks);
  await upsert('bonpreu_categories', catRows);
  await upsert('bonpreu_products', rows);
  // No se retira nada hasta que todos los upserts del ciclo hayan terminado.
  await markStale('bonpreu_products');
  await markStale('bonpreu_categories');
  await updateCycle(cycle.id, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    last_error: null,
  });
  try {
    await restMutation(
      'bonpreu_sync_cycles',
      `status=eq.completed&id=neq.${encodeURIComponent(cycle.id)}`,
      'DELETE',
    );
  } catch (error) {
    console.warn(`[bonpreu] no se pudieron limpiar ciclos antiguos: ${error.message}`);
  }
  console.log(`[bonpreu] OK · ciclo ${cycle.id} publicado`);
}

async function runDry() {
  const [treeEs, treeCa] = await Promise.all([fetchCategoryTree(LANG), fetchCategoryTree(LANG_CA)]);
  const limit = Number.isFinite(MAX_CATEGORIES) ? MAX_CATEGORIES : BATCH_SIZE;
  const cats = treeEs.n2s.slice(0, limit);
  console.log(`[bonpreu] DRY RUN · ${treeEs.catRows.length} categorías, ${treeEs.n2s.length} N2 (proceso ${cats.length})`);
  const crawl = await crawlProducts(cats, LANG);
  const result = buildCatalogRows(treeEs, treeCa, crawl.products, crawl.membership, new Map());
  await crawlProductDetails(result.rows, crawl.retailerLinks);

  const perCat = new Map();
  for (const row of result.rows) {
    for (const categoryId of row.category_ids) {
      perCat.set(categoryId, (perCat.get(categoryId) ?? 0) + 1);
    }
  }
  console.log('productos por categoría (las procesadas):');
  for (const category of cats) console.log(`  ${category.name}: ${perCat.get(category.id) ?? 0}`);
  console.log('nulos →', {
    sin_precio: result.rows.filter((row) => row.unit_price == null).length,
    sin_ppu: result.rows.filter((row) => row.price_per_unit == null).length,
    sin_img: result.rows.filter((row) => !row.thumbnail).length,
    sin_categoria: result.rows.filter((row) => row.category_ids.length === 0).length,
    con_oferta: result.rows.filter((row) => row.promo_name != null).length,
  });
}

let activeCycleId = null;

async function main() {
  console.log(
    `[bonpreu] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} `
    + `apiDelay=${CATEGORY_API_DELAY_MS}ms batch=${BATCH_SIZE}`,
  );
  if (DRY_RUN) {
    await runDry();
    return;
  }

  let cycle = await getActiveCycle();
  if (!cycle) cycle = await createCycle();
  activeCycleId = cycle.id;
  if (cycle.status === 'finalizing') {
    await finalizeCycle(cycle);
    return;
  }

  const treeEs = hydrateTree(cycle.tree_es);
  const treeCa = hydrateTree(cycle.tree_ca);
  const snapshots = await completedSnapshots(cycle.id);
  const completed = new Set(snapshots.map((snapshot) => `${snapshot.language}:${snapshot.category_id}`));
  const batch = treeEs.n2s
    .filter((category) => (
      !completed.has(`${LANG}:${category.id}`)
      || !completed.has(`${LANG_CA}:${category.id}`)
    ))
    .slice(0, cycle.batch_size || BATCH_SIZE);

  if (!batch.length) {
    await finalizeCycle(cycle);
    return;
  }
  const completePairs = treeEs.n2s.filter((category) => (
    completed.has(`${LANG}:${category.id}`) && completed.has(`${LANG_CA}:${category.id}`)
  )).length;
  console.log(
    `[bonpreu] ciclo ${cycle.id} · ${completePairs}/${treeEs.n2s.length} completas `
    + `· lote de ${batch.length}`,
  );

  const esCats = batch.filter((category) => !completed.has(`${LANG}:${category.id}`));
  if (esCats.length) {
    await stageLanguage(cycle, esCats, LANG, await crawlProducts(esCats, LANG));
  }
  const caNameById = new Map(treeCa.n2s.map((category) => [category.id, category.name]));
  const caCats = batch
    .filter((category) => !completed.has(`${LANG_CA}:${category.id}`))
    .map((category) => ({ ...category, name: caNameById.get(category.id) ?? category.name }));
  if (caCats.length) {
    await stageLanguage(cycle, caCats, LANG_CA, await crawlProducts(caCats, LANG_CA));
  }

  const after = await completedSnapshots(cycle.id);
  const afterSet = new Set(after.map((snapshot) => `${snapshot.language}:${snapshot.category_id}`));
  const allDone = treeEs.n2s.every((category) => (
    afterSet.has(`${LANG}:${category.id}`) && afterSet.has(`${LANG_CA}:${category.id}`)
  ));
  if (allDone) await finalizeCycle(cycle);
  else {
    const pairs = treeEs.n2s.filter((category) => (
      afterSet.has(`${LANG}:${category.id}`) && afterSet.has(`${LANG_CA}:${category.id}`)
    )).length;
    console.log(`[bonpreu] OK · lote guardado · ciclo ${pairs}/${treeEs.n2s.length}`);
  }
}

main().catch(async (error) => {
  if (!DRY_RUN && activeCycleId) {
    await updateCycle(activeCycleId, { last_error: String(error.message).slice(0, 2000) }).catch(() => {});
  }
  console.error('[bonpreu] ERROR', error);
  process.exit(1);
});
