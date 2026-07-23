#!/usr/bin/env node
// Sincroniza el catálogo de Condis (Condisline) → Supabase (catálogo + búsqueda),
// 1×/semana. El catálogo usa fetch nativo; la ficha inicia OAuth con Playwright.
//
// Condis (compraonline.condis.es) es una SPA Next.js (App Router/RSC). Su API de
// catálogo real (catalog-api.condis.es) está protegida (403, exige API keys que
// van server-side), PERO su BUSCADOR usa Empathy.co con una API JSON ABIERTA (sin
// auth ni cookies) que además sirve el catálogo entero categoría a categoría:
//
//   GET https://api.empathy.co/search/v1/query/condis/browse
//       ?browseField=parentCategory&browseValue={N2}&lang={es|ca}&store={STORE}
//       &start={N}&rows={<=400}
//   → { catalog: { numFound, content:[ producto ], pagination:{total,rows,start} } }
//
// Producto (campos usados): id, description (nombre), brand, price{current,regular,
//   discounted}, pum ("0,87€/Litro"), images, category:[N1,N2,N3], section (N1),
//   family (N2), variety (N3), parentCategory (= N2 id), on_sale, on_promotion,
//   is_novelty, without_gluten/without_lactose, isEco, state.
//
// Las 94 categorías HOJA (nivel "family") se enumeran desde la PROPIA API de
// Empathy (el sitemap dejó de servir — ahora redirige a un bucle de OAuth
// anónimo): browse por store → facetSection (11 secciones) → browse por sección
// → facetFamily (los nombres de familia). Luego se navega cada familia por
// nombre (browseField=family). El árbol (2 niveles, N1 = section → N2 = family)
// y la membership se reconstruyen del p.parentCategory (cXX__cat########) y
// p.section/family de cada producto, estables entre idiomas.
//
// BILINGÜE es/ca (param lang): 2 pasadas rellenan display_name / display_name_ca
// (como Sorli/Bonpreu). La 1ª (es) fija el conjunto de productos; la 2ª (ca) solo
// añade el nombre catalán por id.
//
// UNA SOLA TIENDA (store=718 = Barcelona), NO multi-tienda: la API toma un `store`
// por CP, pero VERIFICADO en vivo 2026-07-14 que NO hace falta barrer varias.
// Condis tiene 31 tiendas (ids 433–780) y la 718 es SUPERCONJUNTO de todas: su
// catálogo (7.592 prod) contiene el de cualquier otra (5.335–7.098) SIN productos
// exclusivos fuera de ella, y los PRECIOS son idénticos entre tiendas (comparado el
// catálogo completo de 718 vs 540/780/433: 0 productos exclusivos, 0 precios
// distintos). Lo único que varía por tienda es la DISPONIBILIDAD local (una tienda
// pequeña no stockea parte del surtido), no el catálogo ni el precio. Por eso
// recoger solo 718 ya captura TODO el catálogo de Condis.
//
// Imágenes: el CDN público cdn.condis.es sirve fit-in/{WxH}/es/products/{id}.jpg
// (las de la app privada /images/catalog/… piden sesión → 404). Se usa 600x600.
//
// FICHA: ingredientes/nutrición/conservación/fabricante vienen estructurados en el
// productInformation del RSC del PDP. Playwright completa una vez el OAuth anónimo;
// el resto se descarga por HTTP reutilizando las cookies del contexto.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      CONCURRENCY=6     (categorías en paralelo)
//      STORE=718         (id de tienda; 718 = Barcelona = superconjunto, catálogo
//                         y precio idénticos al resto de tiendas → no cambiar)
//      DRY_RUN=1         (no escribe en Supabase; imprime resumen)
//      MAX_CATEGORIES=N  (limita nº de categorías, para pruebas)
//      SKIP_N1=csv       (ids de N1 a excluir; por defecto ninguno)
//      SKIP_DETAIL=1      (omite la ficha sin borrar datos anteriores)
//      DETAIL_CONCURRENCY=6 · DETAIL_MAX=1000 · DETAIL_TTL_DAYS=90
//      DRY_DETAIL_MAX=1   (fichas descargadas en DRY_RUN)
import { canonicalPricePerUnit } from './lib/price.mjs';
import { markStale as markStaleBatched } from './lib/stale.mjs';
import { chromium } from 'playwright-core';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const STORE = String(process.env.STORE || '718');
const MAX_CATEGORIES = process.env.MAX_CATEGORIES ? Number(process.env.MAX_CATEGORIES) : Infinity;
const SKIP_N1 = new Set((process.env.SKIP_N1 ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const SKIP_DETAIL = process.env.SKIP_DETAIL === '1';
const DETAIL_CONCURRENCY = Math.max(1, Number(process.env.DETAIL_CONCURRENCY || 6));
const DETAIL_TTL_DAYS = Math.max(1, Number(process.env.DETAIL_TTL_DAYS || 90));
const DETAIL_MAX = process.env.DETAIL_MAX ? Number(process.env.DETAIL_MAX) : 1000;
const DRY_DETAIL_MAX = Math.max(0, Number(process.env.DRY_DETAIL_MAX || 1));

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
  process.exit(1);
}

const API = 'https://api.empathy.co/search/v1/query/condis';
const CDN = 'https://cdn.condis.es';
const HOME = 'https://compraonline.condis.es';
const ROWS = 400; // tope de Empathy: rows debe ser < 500
const runStart = new Date().toISOString();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

const decodeHtml = (value) => String(value ?? '')
  .replace(/<br\s*\/?>|<\/br\s*>/gi, '\n')
  .replace(/<\/(?:p|li|div|tr)\s*>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n[ \t]+/g, '\n')
  .replace(/[ \t]{2,}/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

function balancedObject(text, start) {
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function parseProductDetailHtml(html, expectedId = null) {
  const chunks = [];
  const rscRe = /self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)<\/script>/g;
  for (const match of html.matchAll(rscRe)) {
    try { chunks.push(JSON.parse(`"${match[1]}"`)); } catch {}
  }
  const text = chunks.join('');
  const marker = '"productInformation":';
  let from = 0;
  while (from < text.length) {
    const markerAt = text.indexOf(marker, from);
    if (markerAt < 0) break;
    const start = text.indexOf('{', markerAt + marker.length);
    const json = start >= 0 ? balancedObject(text, start) : null;
    from = markerAt + marker.length;
    if (!json) continue;
    try {
      const product = JSON.parse(json);
      if (expectedId != null && String(product.ID) !== String(expectedId)) continue;
      const facts = product.nutritional_info?.nutritional_facts ?? [];
      const nutrition = facts.map((fact) => {
        const label = decodeHtml(fact.description);
        const amount = decodeHtml(fact.amount_per_100g);
        const unit = decodeHtml(fact.unit_of_measure);
        return label && amount ? `${label}: ${amount}${unit ? ` ${unit}` : ''}` : null;
      }).filter(Boolean).join('\n');
      const manufacturer = [product.manufacturer?.name, product.manufacturer?.contact_info]
        .map(decodeHtml).filter(Boolean).join('\n');
      return {
        ingredients: decodeHtml(product.ingredients) || null,
        nutrition: nutrition || null,
        conservation: decodeHtml(product.instructions) || null,
        manufacturer: manufacturer || null,
      };
    } catch {}
  }
  return null;
}

async function getJson(url, { tries = 4 } = {}) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'es-ES,es;q=0.9' },
        signal: AbortSignal.timeout(40000),
      });
      if (res.ok) return await res.json();
      console.warn(`[condis] GET ${url} → ${res.status} (intento ${t + 1})`);
    } catch (e) {
      console.warn(`[condis] GET ${url} falló: ${e.message} (intento ${t + 1})`);
    }
    await sleep(800 * (t + 1));
  }
  throw new Error(`no se pudo GET ${url}`);
}

// ── Enumeración de categorías HOJA (nivel family) SIN sitemap ─────────────────
// El sitemap de compraonline.condis.es dejó de servir (ahora redirige a un bucle
// infinito de OAuth anónimo /api/proxy/signin → fetch aborta por exceso de
// redirecciones). Se enumeran las familias desde la PROPIA API de Empathy (mismo
// host, sin auth): el catálogo entero se navega con browseField=store&browseValue
// ={STORE} (7.591 productos; sus facets listan las 11 secciones), y cada sección
// con browseField=section devuelve en facetFamily sus familias. NO se navega la
// sección/catálogo entero producto a producto (Empathy corta la paginación a
// start≈500), pero los facets se calculan sobre todo el conjunto → dan la lista
// completa aunque no se pagine. Luego se navega cada FAMILIA por nombre
// (browseField=family), que son pequeñas (≤ ~300) y sí paginan enteras.
//
// Devuelve los NOMBRES de familia del idioma pedido (browseField=family usa el
// nombre, no el id cXX__cat). El id/jerarquía de categoría se reconstruye después
// del propio producto (p.parentCategory + p.section/family), estable entre idiomas.
function facetValues(json, facet) {
  const f = (json.catalog?.facets ?? []).find((x) => x.facet === facet);
  return (f?.values ?? []).map((v) => v.value).filter(Boolean);
}

async function familyNames(lang) {
  const root = await getJson(`${API}/browse?browseField=store&browseValue=${STORE}&lang=${lang}&store=${STORE}&rows=0`);
  const sections = facetValues(root, 'facetSection');
  if (sections.length === 0) throw new Error('Empathy no devolvió secciones (¿cambió la API?)');
  const families = new Set();
  for (const sec of sections) {
    const j = await getJson(`${API}/browse?browseField=section&browseValue=${encodeURIComponent(sec)}&lang=${lang}&store=${STORE}&rows=0`);
    for (const fam of facetValues(j, 'facetFamily')) families.add(fam);
    await sleep(40);
  }
  return [...families];
}

// ── Normalización de un producto de Empathy ───────────────────────────────────
const eurStr = (n) => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : null);

// pum: "0,87€/Litro" / "6,50€/Litro" / "1,20€/Kilo" / "0,35€/Unidad" / "0,80€/100 g"
function ppuFromPum(pum) {
  if (!pum) return null;
  const m = String(pum).trim().match(/^([\d.,]+)\s*€?\s*\/\s*(.+)$/);
  if (!m) return null;
  return canonicalPricePerUnit(m[1], m[2].toLowerCase());
}

function normalize(p) {
  const price = typeof p.price?.current === 'number' ? p.price.current : null;
  const ppu = ppuFromPum(p.pum);
  return {
    id: String(p.id ?? p.externalId),
    retailer_product_id: p.externalId != null ? String(p.externalId) : null,
    display_name: (p.description || '').trim(),
    display_name_ca: null, // lo rellena la 2ª pasada (lang=ca)
    brand: (p.brand || '').trim() || null,
    thumbnail: `${CDN}/fit-in/600x600/es/products/${p.id}.jpg`,
    unit_price: price,
    price_format: price != null ? `${eurStr(price)} €` : null,
    price_per_unit: ppu?.value ?? null,
    price_per_unit_unit: ppu?.unit ?? null,
    available: p.state ? p.state === 'ACTIVE' : true,
    published: true,
    raw: p,
    synced_at: runStart,
  };
}

// ── Supabase REST ─────────────────────────────────────────────────────────────
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

const DETAIL_FIELDS = ['ingredients', 'nutrition', 'conservation', 'manufacturer'];

async function fetchExistingDetails() {
  const map = new Map();
  if (DRY_RUN) return map;
  const columns = ['id', 'detail_synced_at', ...DETAIL_FIELDS].join(',');
  for (let offset = 0;; offset += 1000) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/condis_products?select=${encodeURIComponent(columns)}&order=id&limit=1000&offset=${offset}`, {
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) throw new Error(`read condis_products details ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    for (const row of rows) map.set(row.id, row);
    if (rows.length < 1000) break;
  }
  return map;
}

async function loadProductDocument(page, row) {
  const target = new URL(row.raw.url, HOME).href;
  try {
    // Condis puede cambiar la URL durante el OAuth (slash final, locale o
    // callback intermedio). Esperar una respuesta con la URL exacta descarta
    // el documento válido aunque la navegación haya terminado correctamente.
    await page.goto(target, { waitUntil: 'commit', timeout: 30000 });
    for (let i = 0; i < 120; i++) {
      const html = await page.content();
      if (html.includes('productInformation')) return html;
      await page.waitForTimeout(250);
    }
    throw new Error(`sin documento final para ${row.id} (url final: ${page.url()})`);
  } catch (e) {
    if (e.message?.startsWith('sin documento final')) throw e;
    throw new Error(`${e.message} (url final: ${page.url()})`);
  }
}

async function fetchProductDocument(request, row) {
  const target = new URL(row.raw.url, HOME).href;
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await request.get(target, { timeout: 40000, maxRedirects: 8 });
      if (response.ok()) return await response.text();
      last = new Error(`${response.status()} ${response.url()}`);
    } catch (e) { last = e; }
    await sleep(800 * (attempt + 1));
  }
  throw last;
}

async function enrichProductDetails(rows) {
  if (SKIP_DETAIL || rows.length === 0) return;
  const existing = await fetchExistingDetails();
  const cutoff = Date.now() - DETAIL_TTL_DAYS * 86400000;
  const stale = [];
  for (const row of rows) {
    const old = existing.get(row.id);
    for (const field of DETAIL_FIELDS) row[field] = old?.[field] ?? null;
    row.detail_synced_at = old?.detail_synced_at ?? null;
    if ((!old?.detail_synced_at || Date.parse(old.detail_synced_at) < cutoff) && row.raw?.url) stale.push(row);
  }
  const limit = DRY_RUN ? DRY_DETAIL_MAX : DETAIL_MAX;
  const batch = stale.slice(0, limit);
  if (!batch.length) { console.log('[condis] ficha: nada pendiente'); return; }
  console.log(`[condis] ficha: ${batch.length} productos · ${stale.length - batch.length} pospuestos`);

  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, headless: true });
  try {
    const context = await browser.newContext({ locale: 'es-ES' });
    const warmPage = await context.newPage();
    const queue = [...batch];
    let completed = 0;
    let succeeded = 0;
    let failed = 0;
    let sessionReady = false;
    // Una ficha concreta puede haber desaparecido o redirigir sin devolver RSC.
    // No debe impedir que el resto abra la sesión OAuth y se enriquezca.
    for (let warmAttempts = 0; queue.length && warmAttempts < 8 && !sessionReady; warmAttempts++) {
      const warmRow = queue.shift();
      try {
        const html = await loadProductDocument(warmPage, warmRow);
        const detail = parseProductDetailHtml(html, warmRow.id);
        if (!detail) throw new Error('productInformation ausente');
        Object.assign(warmRow, detail, { detail_synced_at: runStart });
        succeeded++;
        sessionReady = true;
      } catch (e) {
        failed++;
        console.warn(`[condis] ficha ${warmRow.id} falló: ${e.message}`);
      }
      completed++;
    }
    await warmPage.close();
    if (!sessionReady) {
      throw new Error(`ficha: no se pudo abrir la sesión OAuth tras ${completed} intentos; ${queue.length} fichas no se descargaron`);
    }

    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, async () => {
      for (;;) {
        const row = queue.shift();
        if (!row) break;
        try {
          const html = await fetchProductDocument(context.request, row);
          const detail = parseProductDetailHtml(html, row.id);
          if (!detail) throw new Error('productInformation ausente');
          Object.assign(row, detail, { detail_synced_at: runStart });
          succeeded++;
        } catch (e) {
          failed++;
          console.warn(`[condis] ficha ${row.id} falló: ${e.message}`);
        }
        completed++;
        if (completed % 100 === 0) console.log(`[condis] ficha ${completed}/${batch.length}`);
      }
    }));
    console.log(`[condis] ficha: ${succeeded}/${batch.length} procesadas · ${failed} fallos`);
  } finally { await browser.close(); }
}

// Una pasada de idioma sobre una FAMILIA (por nombre): pagina (start/rows) y
// devuelve todos sus productos. lang = 'es' | 'ca'. Las familias son pequeñas
// (≤ ~300 en Condis), así que rara vez pasa de la 1ª página.
async function browseFamily(family, lang) {
  const out = [];
  for (let start = 0; ; start += ROWS) {
    const j = await getJson(`${API}/browse?browseField=family&browseValue=${encodeURIComponent(family)}&lang=${lang}&store=${STORE}&start=${start}&rows=${ROWS}`);
    const items = j.catalog?.content ?? [];
    out.push(...items);
    const total = j.catalog?.numFound ?? out.length;
    if (out.length >= total || items.length === 0) break;
  }
  return out;
}

async function main() {
  console.log(`[condis] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} store=${STORE} conc=${CONCURRENCY}`);

  let families = await familyNames('es');
  if (MAX_CATEGORIES !== Infinity) families = families.slice(0, MAX_CATEGORIES);
  if (families.length === 0) throw new Error('no encuentro familias en la API de Empathy');
  console.log(`[condis] ${families.length} familias (N2)`);

  const products = new Map();     // id → producto normalizado (es)
  const nameCa = new Map();       // id → display_name_ca
  const membership = new Map();   // id → Set<N2 id>
  // Nombres del árbol (aprendidos de los productos). El id de N2 es el
  // p.parentCategory (cXX__cat########, estable entre idiomas) y el de N1 su
  // prefijo cXX; los NOMBRES salen de p.section / p.family del idioma navegado.
  const n1Name = new Map(), n1NameCa = new Map();
  const n2Name = new Map(), n2NameCa = new Map(), n2Parent = new Map();

  const catNames = (p) => ({
    n1: p.section || p.category?.[0] || null,
    n2: p.family || p.category?.[1] || null,
  });
  // id de N2 (family) de un producto = su parentCategory (cXX__cat…); N1 = prefijo cXX.
  const idsOf = (p) => {
    const n2 = p.parentCategory ? String(p.parentCategory) : null;
    return { n2, n1: n2 ? n2.split('__')[0] : null };
  };

  // Pasada ES: fija el conjunto de productos + membership + nombres es. Se navega
  // por NOMBRE de familia; la categoría de cada producto se toma de su parentCategory.
  const queue = [...families];
  let done = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const family = queue.shift();
      if (family == null) break;
      try {
        const items = await browseFamily(family, 'es');
        for (const p of items) {
          const id = String(p.id ?? p.externalId ?? '');
          const { n2, n1 } = idsOf(p);
          if (!id || !n2 || SKIP_N1.has(n1)) continue;
          n2Parent.set(n2, n1);
          if (!products.has(id)) {
            const norm = normalize(p);
            if (!norm.display_name) continue;
            products.set(id, norm);
          }
          let set = membership.get(id);
          if (!set) membership.set(id, (set = new Set()));
          set.add(n2);
          const nm = catNames(p);
          if (nm.n2 && !n2Name.has(n2)) n2Name.set(n2, nm.n2);
          if (nm.n1 && !n1Name.has(n1)) n1Name.set(n1, nm.n1);
        }
      } catch (e) { console.warn(`[condis] familia ${family} (es) falló: ${e.message}`); }
      if (++done % 20 === 0) console.log(`[condis] es ${done}/${families.length} · ${products.size} productos`);
      await sleep(60);
    }
  }));
  console.log(`[condis] ES: ${products.size} productos`);

  // Pasada CA: solo nombres (producto + categorías) por id. Familias en catalán.
  let familiesCa = await familyNames('ca');
  if (MAX_CATEGORIES !== Infinity) familiesCa = familiesCa.slice(0, MAX_CATEGORIES);
  const queueCa = [...familiesCa];
  let doneCa = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const family = queueCa.shift();
      if (family == null) break;
      try {
        const items = await browseFamily(family, 'ca');
        for (const p of items) {
          const id = String(p.id ?? p.externalId ?? '');
          const { n2, n1 } = idsOf(p);
          if (!id || !n2) continue;
          const ca = (p.description || '').trim();
          if (ca) nameCa.set(id, ca);
          const nm = catNames(p);
          if (nm.n2 && !n2NameCa.has(n2)) n2NameCa.set(n2, nm.n2);
          if (nm.n1 && !n1NameCa.has(n1)) n1NameCa.set(n1, nm.n1);
        }
      } catch (e) { console.warn(`[condis] familia ${family} (ca) falló: ${e.message}`); }
      if (++doneCa % 20 === 0) console.log(`[condis] ca ${doneCa}/${familiesCa.length}`);
      await sleep(60);
    }
  }));

  // Filas de categorías (N1 + N2).
  const catRows = [];
  const seenN1 = new Set();
  for (const [n2, n1] of n2Parent) {
    if (!seenN1.has(n1)) {
      seenN1.add(n1);
      catRows.push({ id: n1, name: n1Name.get(n1) || n1, name_ca: n1NameCa.get(n1) || null, parent_id: null, product_count: null, published: true, synced_at: runStart });
    }
    catRows.push({ id: n2, name: n2Name.get(n2) || n2, name_ca: n2NameCa.get(n2) || null, parent_id: n1, product_count: null, published: true, synced_at: runStart });
  }
  const catName = new Map(catRows.map((c) => [c.id, c.name]));

  // Filas de productos: display_name_ca + category_ids (N2 + su N1).
  const catCount = new Map();
  const rows = [];
  for (const [id, det] of products) {
    const leavesOf = [...(membership.get(id) ?? [])];
    const expanded = new Set();
    for (const leaf of leavesOf) {
      expanded.add(leaf);
      const p = n2Parent.get(leaf);
      if (p) expanded.add(p);
    }
    const primary = leavesOf[0] ?? null;
    rows.push({
      ...det,
      display_name_ca: nameCa.get(id) ?? null,
      category_ids: [...expanded],
      category_id: primary,
      category_name: primary ? catName.get(primary) ?? null : null,
    });
    for (const c of expanded) catCount.set(c, (catCount.get(c) ?? 0) + 1);
  }
  for (const c of catRows) c.product_count = catCount.get(c.id) ?? 0;
  console.log(`[condis] ${rows.length} productos únicos · ${catRows.length} categorías`);

  await enrichProductDetails(rows);

  if (DRY_RUN) {
    console.log('muestra (5):');
    for (const r of rows.slice(0, 5)) console.log(`  ${r.id}  ${r.display_name}  [ca: ${r.display_name_ca ?? '—'}]  [${r.brand ?? '—'}]  ${r.price_format}  ${r.price_per_unit != null ? r.price_per_unit + ' €/' + r.price_per_unit_unit : '—'}`);
    if (rows[0]) console.log('category_ids[0] (N2 + N1):', rows[0].category_ids.join(', '), '→', rows[0].category_name);
    console.log('nulos →', {
      sin_precio: rows.filter((r) => r.unit_price == null).length,
      sin_ppu: rows.filter((r) => r.price_per_unit == null).length,
      sin_img: rows.filter((r) => !r.thumbnail).length,
      sin_categoria: rows.filter((r) => r.category_ids.length === 0).length,
      sin_nombre_ca: rows.filter((r) => !r.display_name_ca).length,
      con_promo: rows.filter((r) => r.raw.on_sale || r.raw.on_promotion).length,
    });
    console.log('detalle:', {
      ingredientes: rows.filter((r) => r.ingredients).length,
      nutricion: rows.filter((r) => r.nutrition).length,
      conservacion: rows.filter((r) => r.conservation).length,
      fabricante: rows.filter((r) => r.manufacturer).length,
    });
    const detail = rows.find((r) => r.detail_synced_at);
    if (detail) for (const field of DETAIL_FIELDS) console.log(`  ${field}: ${detail[field] ?? 'â€”'}`);
    return;
  }
  if (rows.length === 0) throw new Error('0 productos (¿cambió la API de Empathy?)');

  await upsert('condis_categories', catRows);
  await upsert('condis_products', rows);
  await markStale('condis_products');
  await markStale('condis_categories');
  console.log('[condis] OK');
}

import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error('[condis] ERROR', e); process.exit(1); });
}

export { ppuFromPum, normalize, parseProductDetailHtml };
