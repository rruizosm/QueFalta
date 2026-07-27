#!/usr/bin/env node
// Sincroniza el catálogo de Sorli (Sorliclic) → Supabase (catálogo + búsqueda),
// 1×/semana. Súper catalán (Maresme/Vallès/Barcelona, ~95 tiendas).
//
// Sorli expone una API REST JSON propia (api.sorliclic.com), PERO protege las
// llamadas con un token de sesión `s` (32 hex) que el SPA calcula en el navegador
// (utilsService.s(window,…) → MD5 dependiente de `window`) y que el servidor
// valida contra la cookie de sesión `an_us_id`. Un `s` autogenerado da 400. Así
// que, como Bonpreu, se ARRANCA la sesión con un navegador headless (mintea el
// `s` + cookies válidos) y LUEGO se pagina con fetch de node reusando ese par
// {s, cookies} (verificado: node fetch con cookie+s → 200).
//
// Estrategia (como Consum: catálogo entero paginado, sin recorrer hojas):
//   1. Playwright: cargar una página de sorliclic → capturar `s` + cookies.
//   2. GET /categorias?idioma=es|ca → árbol (N1→N2→N3, hoja = nivel 3) bilingüe.
//   3. POST /articulos/filtersort con codigoCategoria='' → catálogo ENTERO
//      paginado (~9.460 productos, 95 páginas de 100). DOS pasadas:
//        - idioma=es (primaria: rellena display_name, precio, categoría, raw)
//        - idioma=ca (2ª: rellena display_name_ca, casando por idArticulo)
//      El nombre catalán viene en `descripcion` de la pasada ca (los campos
//      descripcionEs/descripcionCat del JSON llegan inconsistentes según la
//      consulta, así que NO se confía en ellos: 2 pasadas deterministas).
//   4. Membership: cada producto trae su categoría HOJA (categoria.idCategoria,
//      nivel 3). category_ids = hoja + ancestros (para navegar por cualquier nivel).
//   5. Normalizar + upsert en Supabase (soft-delete de lo ausente vía markStale).
//
// Notas:
//  - Ofertas: la ruta /es/ofertas usa `soloOfertas=true`, pero el catálogo
//    general ya trae oferta/textoOferta/ofertaEnVigor/fechas. Se normalizan tipo
//    bilingüe, condiciones, precio anterior y vigencia sin un segundo crawl.
//  - Precio del envase: pvpoferta si hay oferta viva (>0), si no pvp.
//  - precioUnidadMedida + unidadMedida ("K"|"L"|"U") → €/unidad canónica (kg/l/ud).
//  - marca es un OBJETO ({idMarca, descripcion}); se guarda descripcion.
//  - nutriScore y agrupaciones (Ecológico/Sin Gluten/Vegano/Sin Lactosa/Producto
//    de Aquí) se conservan en `raw` para features futuras (no columnas propias).
//  - Precios de la tienda por defecto de la sesión de invitado (como Consum).
//  - Imágenes: el listado trae urlImagen en 135x135 (borrosa en la ficha), pero
//    el CDN sirve la MISMA ruta en 300x300 (lo expone el endpoint de detalle,
//    imagenes300x300; verificado 100% de cobertura en muestra dispersa del
//    catálogo; 400/600/800 sí dan 404) → se guarda la URL reescrita a 300x300.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      PW_CHANNEL=chrome   (usar Chrome del sistema en local; vacío en CI = chromium)
//      CONCURRENCY=6       (páginas descargadas en paralelo)
//      DRY_RUN=1           (no escribe en Supabase; imprime resumen)
//      MAX_PAGES=N         (limita nº de páginas por pasada, para pruebas)
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { canonicalPricePerUnit } from './lib/price.mjs';
import { markStale as markStaleBatched } from './lib/stale.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const MAX_PAGES = process.env.MAX_PAGES ? Number(process.env.MAX_PAGES) : Infinity;
const PW_CHANNEL = process.env.PW_CHANNEL || undefined; // 'chrome' en local; vacío = chromium (CI)

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
  process.exit(1);
}

const API = 'https://api.sorliclic.com/api';
const HOME = 'https://www.sorliclic.com';
// Página de categoría cualquiera: basta para que el SPA arranque la sesión y firme `s`.
const BOOT_URL = `${HOME}/es/c/010104/comprar-naranjas-online`;
const PAGE_SIZE = 100;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const runStart = new Date().toISOString();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ── Sesión: navegador headless que firma el token `s` + cookies ──────────────
// Se reusa para toda la corrida; si una petición cae con 400/401 (sesión
// caducada) se vuelve a arrancar una vez (reBootstrap).
async function bootstrap() {
  const browser = await chromium.launch({ channel: PW_CHANNEL, headless: true });
  try {
    const ctx = await browser.newContext({ locale: 'es-ES', userAgent: UA });
    const page = await ctx.newPage();
    let s = null;
    page.on('request', (req) => {
      const m = req.url().match(/[?&]s=([a-f0-9]{16,})/);
      if (m && !s) s = m[1];
    });
    await page.goto(BOOT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // El SPA dispara /categorias?...&s=… en los primeros segundos; esperamos a que aparezca.
    for (let i = 0; i < 30 && !s; i++) await page.waitForTimeout(500);
    if (!s) throw new Error('no se pudo capturar el token de sesión `s`');
    const cookies = await ctx.cookies('https://api.sorliclic.com');
    const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    return { s, cookie };
  } finally {
    await browser.close();
  }
}

let session = null;
async function ensureSession() {
  if (!session) session = await bootstrap();
  return session;
}

// Petición a la API con reintentos. `build(s)` recibe el token de la sesión
// ACTUAL y devuelve { path, init }; se llama DENTRO del bucle para que, si la
// sesión caduca (400/401/403) y se re-arranca, el reintento use el `s` nuevo
// (el token va en la query o en el body, así que hay que reconstruirlos).
async function apiFetch(build, { tries = 4 } = {}) {
  for (let t = 0; t < tries; t++) {
    const { s, cookie } = await ensureSession();
    const { path, init } = build(s);
    try {
      const res = await fetch(`${API}${path}`, {
        ...init,
        headers: {
          'User-Agent': UA, Accept: 'application/json',
          Origin: HOME, Referer: `${HOME}/`, Cookie: cookie,
          ...(init?.headers || {}),
        },
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return res;
      // Sesión caducada / token rechazado → re-arrancar y reintentar con `s` nuevo.
      if ((res.status === 400 || res.status === 401 || res.status === 403) && t < tries - 1) {
        console.warn(`[sorli] ${path.split('?')[0]} → ${res.status}; re-arranco sesión (intento ${t + 1})`);
        session = null;
        await sleep(500);
        continue;
      }
      console.warn(`[sorli] ${path.split('?')[0]} → ${res.status} (intento ${t + 1})`);
    } catch (e) {
      console.warn(`[sorli] petición falló: ${e.message} (intento ${t + 1})`);
    }
    await sleep(700 * (t + 1));
  }
  throw new Error('no se pudo completar la petición a la API de Sorli');
}

// GET con el token `s` en la query (path incluye ya sus otros parámetros).
async function getJson(path) {
  const res = await apiFetch((s) => ({
    path: path.includes('?') ? `${path}&s=${s}` : `${path}?s=${s}`,
    init: {},
  }));
  return res.json();
}

// Una página del catálogo (filtersort) en un idioma. El token `s` va en el body.
async function filtersortPage(idioma, pageNumber) {
  const res = await apiFetch((s) => ({
    path: '/articulos/filtersort',
    init: {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filterArticulos: { codigoCategoria: '', descripcion: '' },
        sortArticulos: { ordenacion: '2', descendente: false },
        paginationFilter: { pageNumber, pageSize: PAGE_SIZE, totalElements: 0 },
        idioma, s,
      }),
    },
  }));
  const j = await res.json();
  return j?.articulos ?? {};
}

// ── Árbol de categorías (bilingüe: es + ca) ──────────────────────────────────
// /categorias devuelve un array de N1 con `subcategorias` anidadas (hasta nivel 3).
// El nombre está en `description`. parent_id se deduce de la jerarquía.
function walkCats(nodes, parentId, out, seen) {
  for (const n of nodes || []) {
    const id = n?.id != null ? String(n.id) : null;
    if (!id) continue;
    if (!seen.has(id)) {
      seen.add(id);
      out.push({ id, name: (n.description || '').trim(), parent_id: parentId });
    }
    walkCats(n.subcategorias, id, out, seen);
  }
}

// ── Normalización de un producto de filtersort ───────────────────────────────
const eurStr = (n) => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : null);
// unidadMedida de Sorli → unidad que entiende canonicalPricePerUnit.
const UM_MAP = { K: 'kg', KG: 'kg', G: 'g', L: 'l', ML: 'ml', U: 'ud', UD: 'ud', UN: 'ud' };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function brandName(marca) {
  if (marca == null) return null;
  if (typeof marca === 'string') return marca.trim() || null;
  const d = marca.descripcion || marca.nombre || marca.descripcionEs || null;
  return d ? String(d).trim() || null : null;
}

function nutriScoreGrade(product) {
  const value = product.nutriScore ?? product.nutriscore ?? product.nutri_score;
  const candidate = value && typeof value === 'object'
    ? value.grade ?? value.letter ?? value.value
    : value;
  const grade = typeof candidate === 'string' ? candidate.trim().toUpperCase() : null;
  return ['A', 'B', 'C', 'D', 'E'].includes(grade) ? grade : null;
}

const cleanText = (value) => typeof value === 'string' ? value.trim() || null : null;
const dateOnly = (value) => cleanText(value)?.slice(0, 10) ?? null;

function compactSorliOfferName(product, ca = false) {
  const detail = [
    ca ? product.descripcionOfertaCat : product.descripcionOferta,
    product.textoOferta,
    product.descripcionOferta,
  ].map(cleanText).find(Boolean) ?? '';

  const secondUnit = detail.match(/2\s*[ªa]\s*(?:UN(?:IDAD|ITAT)?|U(?:D)?\.?)?\s*(?:AL|A)?\s*(\d{1,3})\s*%/i);
  if (secondUnit) return ca
    ? `2a unitat al ${secondUnit[1]}%`
    : `2ª unidad al ${secondUnit[1]}%`;

  // "2x1 €" y "3 x 3,99 €" son lotes a precio fijo, no promociones 2x1/3x3.
  const fixedDecimal = detail.match(/\b(\d+)\s*(?:U(?:D|N)?\.?\s*)?(?:X|POR|PER)\s*(\d+[.,]\d+)\s*€?/i);
  const fixedWithX = detail.match(/\b(\d+)\s*(?:U(?:D|N)?\.?\s*)?(?:X|POR|PER)\s*(\d+(?:[.,]\d+)?)\s*€/i);
  const fixedUnits = detail.match(/\b(\d+)\s*(?:U|UD|UNIDADES?|UNITATS?)\s+(\d+(?:[.,]\d+)?)\s*€/i);
  const fixed = fixedDecimal ?? fixedWithX ?? fixedUnits;
  if (fixed) {
    const amount = fixed[2].replace('.', ',');
    return ca ? `${fixed[1]} u. per ${amount} €` : `${fixed[1]} uds. por ${amount} €`;
  }

  const multiBuy = detail.match(/\b(\d+)\s*[xX]\s*(\d+)\b(?![.,]\d|\s*€)/);
  if (multiBuy) return `${multiBuy[1]}x${multiBuy[2]}`;
  if (/\b(regalo|regal)\b/i.test(detail)) return ca ? 'Regal' : 'Regalo';

  const structured = cleanText(ca ? product.oferta?.descripcionCat : product.oferta?.descripcion);
  const key = cleanText(product.oferta?.descripcion)?.toLowerCase();
  if (key === 'precio') return ca ? 'Preu rebaixat' : 'Precio rebajado';
  if (key === 'lote fijo') return ca ? 'Lot a preu fix' : 'Lote a precio fijo';
  if (key === 'lote variable') return ca ? 'Lot combinat' : 'Lote combinado';
  if (key === '2ª 50%') return ca ? '2a unitat al 50%' : '2ª unidad al 50%';
  if (key === '2ª 70%') return ca ? '2a unitat al 70%' : '2ª unidad al 70%';
  return structured ?? (ca ? 'Oferta' : 'Oferta');
}

/** Señal explícita que usa la ruta oficial `/ofertas` de Sorliclic. La API
 * incluye estos campos también en el catálogo general, por lo que no hace falta
 * un segundo crawl ni inferir promociones desde el histórico de precios. */
function sorliOfferColumns(product) {
  if (product?.ofertaEnVigor !== true) return null;
  const pvp = num(product.pvp);
  const offerPrice = num(product.pvpoferta);
  const complex = product.ofertaCompleja === true;
  return {
    promo_name: compactSorliOfferName(product, false),
    promo_name_ca: compactSorliOfferName(product, true),
    promo_text: complex
      ? cleanText(product.descripcionOferta) ?? cleanText(product.textoOferta)
      : null,
    promo_text_ca: complex
      ? cleanText(product.descripcionOfertaCat) ?? cleanText(product.textoOferta)
      : null,
    promo_base_price: pvp != null && offerPrice != null && offerPrice > 0 && pvp > offerPrice
      ? pvp
      : null,
    promo_start: dateOnly(product.fechaInicioOferta),
    promo_end: dateOnly(product.fechaFinOferta),
  };
}

// El listado da la imagen en 135x135, que estirada en la ficha (260pt) se ve
// borrosa. El CDN tiene la misma imagen en 300x300 (misma ruta, otra carpeta;
// cobertura verificada en todo el catálogo) → se reescribe la URL.
const thumbnailUrl = (url) =>
  url ? String(url).replace('/imagenes/articulos/135x135/', '/imagenes/articulos/300x300/') : null;

function normalize(p) {
  const pvp = num(p.pvp);
  const pvpof = num(p.pvpoferta);
  const offer = sorliOfferColumns(p);
  const price = offer && pvpof && pvpof > 0 ? pvpof : pvp;
  const ppu = canonicalPricePerUnit(p.precioUnidadMedida, UM_MAP[(p.unidadMedida || '').toUpperCase()] ?? p.unidadMedida);
  return {
    id: String(p.idArticulo),
    retailer_product_id: null,
    display_name: (p.descripcion || '').trim(),
    display_name_ca: null, // lo rellena la 2ª pasada (idioma=ca)
    brand: brandName(p.marca),
    packaging: null, // el formato ya va en el nombre ("Naranja Bolsa 2kg")
    thumbnail: thumbnailUrl(p.urlImagen),
    unit_price: price,
    price_format: price != null ? `${eurStr(price)} €` : null,
    price_per_unit: ppu?.value ?? null,
    price_per_unit_unit: ppu?.unit ?? null,
    promo_name: offer?.promo_name ?? null,
    promo_name_ca: offer?.promo_name_ca ?? null,
    promo_text: offer?.promo_text ?? null,
    promo_text_ca: offer?.promo_text_ca ?? null,
    promo_base_price: offer?.promo_base_price ?? null,
    promo_start: offer?.promo_start ?? null,
    promo_end: offer?.promo_end ?? null,
    nutri_score: nutriScoreGrade(p),
    available: p.desactivado !== true,
    published: true,
    raw: p,
    synced_at: runStart,
    _leaf: p.categoria?.idCategoria != null ? String(p.categoria.idCategoria) : null,
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

// Recorre TODAS las páginas del catálogo en un idioma, con concurrencia, y
// llama a onProduct(p) por cada artículo (dedup lo hace el llamante).
async function crawlLanguage(idioma, onProduct) {
  const first = await filtersortPage(idioma, 1);
  const totalPages = Math.min(first.totalPages ?? 1, MAX_PAGES);
  (first.results || []).forEach(onProduct);
  console.log(`[sorli] ${idioma}: ${first.totalResults ?? '?'} productos · ${totalPages} páginas`);

  const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  let done = 1;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const pn = pages.shift();
      if (pn == null) break;
      try { (await filtersortPage(idioma, pn)).results?.forEach(onProduct); }
      catch (e) { console.warn(`[sorli] ${idioma} página ${pn} falló: ${e.message}`); }
      if (++done % 20 === 0) console.log(`[sorli] ${idioma}: ${done}/${totalPages} páginas`);
      await sleep(80);
    }
  }));
}

async function main() {
  console.log(`[sorli] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} conc=${CONCURRENCY} channel=${PW_CHANNEL || 'chromium'}`);

  // 1) Árbol de categorías (es + ca).
  const catsEs = [];
  walkCats(await getJson('/categorias?idioma=es'), null, catsEs, new Set());
  const caNames = new Map();
  {
    const catsCa = [];
    walkCats(await getJson('/categorias?idioma=ca'), null, catsCa, new Set());
    for (const c of catsCa) caNames.set(c.id, c.name);
  }
  const catRows = catsEs.map((c) => ({
    id: c.id, name: c.name, name_ca: caNames.get(c.id) ?? null,
    parent_id: c.parent_id, product_count: null, published: true, synced_at: runStart,
  }));
  const catName = new Map(catRows.map((c) => [c.id, c.name]));
  const parentOf = new Map(catRows.map((c) => [c.id, c.parent_id]));
  const ancestorsOf = (id) => {
    const chain = [];
    for (let cur = id; cur; cur = parentOf.get(cur) ?? null) chain.push(cur);
    return chain;
  };
  const n1Names = catRows.filter((c) => c.parent_id === null).map((c) => c.name);
  console.log(`[sorli] ${catRows.length} categorías · N1: ${n1Names.join(', ')}`);

  // 2) Catálogo, pasada primaria (es).
  const products = new Map(); // id → producto normalizado
  await crawlLanguage('es', (p) => {
    if (p?.idArticulo == null) return;
    const id = String(p.idArticulo);
    if (products.has(id)) return;
    const norm = normalize(p);
    if (!norm.display_name) return;
    products.set(id, norm);
  });

  // 3) Pasada catalana (ca): rellena display_name_ca casando por id.
  let caFilled = 0;
  await crawlLanguage('ca', (p) => {
    if (p?.idArticulo == null) return;
    const row = products.get(String(p.idArticulo));
    if (!row) return;
    const nameCa = (p.descripcion || '').trim();
    if (nameCa && nameCa !== row.display_name) { row.display_name_ca = nameCa; caFilled++; }
  });

  // 4) Membership (hoja + ancestros) y product_count.
  const catCount = new Map();
  const rows = [];
  for (const det of products.values()) {
    const leaf = det._leaf && catName.has(det._leaf) ? det._leaf : null;
    delete det._leaf;
    const expanded = new Set();
    if (leaf) for (const a of ancestorsOf(leaf)) expanded.add(a);
    rows.push({
      ...det,
      category_ids: [...expanded],
      category_id: leaf,
      category_name: leaf ? catName.get(leaf) ?? null : null,
    });
    for (const c of expanded) catCount.set(c, (catCount.get(c) ?? 0) + 1);
  }
  for (const c of catRows) c.product_count = catCount.get(c.id) ?? 0;
  console.log(`[sorli] ${rows.length} productos únicos · ${caFilled} con nombre catalán`);

  if (DRY_RUN) {
    console.log('muestra (6):');
    for (const r of rows.slice(0, 6)) {
      console.log(`  ${r.id}  ${r.display_name}  [ca: ${r.display_name_ca ?? '—'}]  [${r.brand ?? '—'}]  ${r.price_format}  ${r.price_per_unit != null ? r.price_per_unit + ' €/' + r.price_per_unit_unit : '—'}  cat=${r.category_name ?? '—'}`);
    }
    if (rows[0]) console.log('category_ids[0]:', rows[0].category_ids.join(', '));
    console.log('ofertas (6):');
    for (const r of rows.filter((row) => row.promo_name).slice(0, 6)) {
      console.log(`  ${r.id}  ${r.promo_name}  ${r.promo_text ?? '—'}  ${r.promo_base_price != null ? `antes ${eurStr(r.promo_base_price)} €` : ''}`);
    }
    console.log('nulos →', {
      sin_precio: rows.filter((r) => r.unit_price == null).length,
      sin_ppu: rows.filter((r) => r.price_per_unit == null).length,
      sin_img: rows.filter((r) => !r.thumbnail).length,
      sin_ca: rows.filter((r) => !r.display_name_ca).length,
      sin_categoria: rows.filter((r) => r.category_ids.length === 0).length,
      con_oferta: rows.filter((r) => r.promo_name != null).length,
    });
    return;
  }
  if (rows.length === 0) throw new Error('0 productos (¿cambió la API o la sesión?)');

  await upsert('sorli_categories', catRows);
  await upsert('sorli_products', rows);
  await markStale('sorli_products');
  await markStale('sorli_categories');
  console.log('[sorli] OK');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error('[sorli] ERROR', e); process.exit(1); });
}

export { compactSorliOfferName, sorliOfferColumns };
