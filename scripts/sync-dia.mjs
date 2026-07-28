#!/usr/bin/env node
// Sincroniza el catálogo de Dia → Supabase (catálogo + búsqueda), 1×/semana.
// Sin dependencias npm. Usa fetch nativo de Node 18+ (dia.es no tiene Cloudflare
// ni pide cookies para LEER, pero SÍ hace falta sesión para fijar código postal).
//
// dia.es es una SPA Vike (vite-plugin-ssr). Desde 2026-07-11 el sync usa su API
// REST JSON abierta (antes /api/v1/plp-back daba 422; ya NO). Es MÁS ROBUSTA que
// raspar el SSR (versionada /api/v1/, ~20 KB JSON/página vs ~150 KB de HTML) — la
// lección de Eroski (retiraron ?pageNumber=N y rompió el scraper) empuja a ello.
//
//   GET /api/v1/plp-back/products?navigation=L1           (Origin/Referer de dia.es)
//   → { category_data.categories: árbol N1→N2 COMPLETO (31 N1, ~296 N2, con id+link+name),
//       products[]: productos estructurados de la página (object_id, sku_id, display_name,
//         brand, image, prices{price, price_per_unit, measure_unit, strikethrough_price,
//         is_promo_price, discount_percentage}, units_in_stock, url),
//       pagination.pagination.total_pages }
//   navigation=L1 NO filtra por categoría: devuelve el CATÁLOGO ENTERO paginado
//   (~20/página). La categoría de cada producto se deriva de su `url`
//   (/frutas/platanos-y-bananas/p/42070 → N2 "platanos-y-bananas") casada contra
//   los `link` del árbol (verificado: 100% de las urls mapean).
//
// (Los endpoints filtrados por categoría —/api/v1/plp-back/l1/all/{N1}/reduced?
//  category_id={N2}— existen pero OMITEN `brand`, por eso se usa el catálogo
//  completo, que sí lo trae. /api/v1/search-back/search?q= es API de búsqueda
//  abierta con items estructurados + l1/l2_category_description — no usada aquí.)
//
// MULTI-ZONA (2026-07-14): dia.es adapta el SURTIDO al código postal (lo anuncia
// el propio sitio: "¿Sabes que podemos adaptar nuestro surtido a tu código
// postal?"), igual que Mercadona por almacén. Verificado en vivo: el mismo
// catálogo va de 204 a 295 páginas según la zona (Madrid/Barcelona/Sevilla/A
// Coruña…), y CPs cercanos de una misma ciudad comparten `physical_store_id`
// (28041 y 28001 Madrid → mismo id) → un CP representativo por provincia basta,
// como Mercadona con sus almacenes. Flujo de sesión (anónima, por cookie):
//   1. GET /            → Set-Cookie session_id (crea sesión).
//   2. GET /api/v1/common-aggregator/check-service?postal_code=CP
//      → { physical_store_id } (o sin cuerpo/206 si esa zona no tiene servicio;
//        verificado: Canarias no responde con id — se salta esa provincia).
//   3. PUT /api/v1/common-aggregator/save-shipping-address?new_postal_code=CP
//      → 204, fija el CP en la sesión (rota session_id; hay que seguir
//        actualizando cookies de las respuestas).
//   4. GET plp-back/products?navigation=L1 con esa misma cookie → catálogo de la zona.
// Este sync barre un CP por provincia (01–52, igual que sync-catalog.mjs de
// Mercadona), deduplica por `physical_store_id` (varias provincias pueden
// compartir tienda/zona) y une los productos por `object_id` (id GLOBAL: un id
// = el mismo producto en toda España, si aparece). Guarda en `regions` la(s)
// CCAA donde un producto está disponible, o null si aparece en TODAS las CCAA
// con servicio (nacional) — misma semántica que `mercadona_products.regions`
// (null = sin restricción; lista = "solo disponible en esas CCAA"). OJO: a
// diferencia de Mercadona, la nacionalidad NO se decide por "estar en la zona de
// Madrid" (esa tienda NO es superconjunto nacional en Dia → marcaría cientos de
// productos comunes como falsos regionales), sino por aparecer en todas las CCAA
// barridas (ver computeRegions). La CCAA no se usa aún para filtrar nada en la
// app (queda para más adelante); hoy solo se guarda junto con el catálogo para
// no tener que rehacer este barrido después.
//
// La FICHA (ingredientes/nutrición/…) sigue viniendo del SSR de cada producto
// (raw.url → vike_pageContext): la API de listado no la expone, y no depende de
// la zona (la url del producto es la misma en toda España). Ver más abajo.
//
// Estrategia:
//   1. Resolver zonas: 1 CP por provincia → physical_store_id (check-service),
//      deduplicado. Madrid primero solo para que sus datos (precio/nombre) sean
//      los "por defecto" de los productos nacionales.
//   2. Por cada zona: sesión nueva, fijar su CP, paginar el catálogo entero
//      (page=1..total_pages) → todos los products, acumulando en qué zonas
//      aparece cada producto (para `regions`). El árbol de categorías se toma
//      solo de la primera zona (taxonomía nacional, no varía por zona).
//   3. Normalizar + calcular `regions` + upsert en Supabase (soft-delete de lo
//      ausente vía markStale).
//
// Notas:
//  - prices.price ya lleva la promo aplicada (strikethrough_price = original; flags
//    is_promo_price/is_club_price en raw). price_per_unit sigue a la promo.
//  - measure_unit viene en castellano ("KILO", "LITRO", "UNIDAD") → base canónica
//    l/kg/ud vía lib/price.mjs.
//  - Los precios de cada producto son los de la PRIMERA zona que lo trae (por
//    orden de barrido, Madrid primero) — igual que Mercadona con `mad1`.
//  - La N1 "Novedades y recomendados" (L128) se salta: es marketing rotatorio, no
//    taxonomía; sus productos viven también en su categoría real.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      CONCURRENCY=4       (páginas procesadas en paralelo, por zona)
//      DRY_RUN=1           (no escribe en Supabase; imprime resumen)
//      MAX_PAGES=N         (limita nº de páginas de CADA zona, para pruebas)
//      MAX_ZONES=N         (limita nº de zonas a barrer, para pruebas)
//      SKIP_N1=csv         (ids de N1 a excluir; por defecto "L128")
import { canonicalPricePerUnit } from './lib/price.mjs';
import { markStale as markStaleBatched } from './lib/stale.mjs';
import { PROVINCE_COMMUNITY } from './lib/province-community.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);
// MAX_PAGES limita las páginas del catálogo entero (antes MAX_CATEGORIES, cuando
// se recorría por N2); se acepta el nombre viejo por compatibilidad.
const MAX_PAGES = process.env.MAX_PAGES ? Number(process.env.MAX_PAGES)
  : process.env.MAX_CATEGORIES ? Number(process.env.MAX_CATEGORIES) : Infinity;
const SKIP_N1 = new Set((process.env.SKIP_N1 ?? 'L128').split(',').map((s) => s.trim()).filter(Boolean));
const MAX_ZONES = process.env.MAX_ZONES ? Number(process.env.MAX_ZONES) : Infinity;

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
// DIA puede publicar este BFF bajo /api/v1/ o, tras un cambio de despliegue,
// bajo /api/. Mantener el prefijo versionado primero y probar el alternativo
// solo ante 404 evita ocultar errores transitorios.
const API_PREFIXES = [...new Set([
  process.env.DIA_API_PREFIX,
  '/api/v1',
  '/api',
].filter(Boolean).map((prefix) => prefix.replace(/\/$/, '')))];
const DIA_PLP_PATH = process.env.DIA_PLP_PATH || 'plp-back/products';
const runStart = new Date().toISOString();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ── Sesión anónima (cookie jar) ──────────────────────────────────────────────
// dia.es guarda el CP fijado en la sesión (cookie `session_id`, HttpOnly). El
// jar es un objeto plano nombre→valor; se actualiza con el Set-Cookie de CADA
// respuesta porque save-shipping-address rota session_id.
async function newSession() {
  const res = await fetch(`${HOME}/`, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
  const jar = {};
  mergeSetCookies(jar, res);
  return jar;
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
function mergeSetCookies(jar, res) {
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of cookies) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
}

// Zona de un CP (o null si dia.es no sirve ahí — verificado: Canarias no
// devuelve physical_store_id). No muta la sesión (solo lectura).
async function checkService(jar, cp) {
  try {
    const res = await fetch(`${HOME}/api/v1/common-aggregator/check-service?postal_code=${cp}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json', Origin: HOME, Referer: `${HOME}/`, Cookie: cookieHeader(jar) },
      signal: AbortSignal.timeout(20000),
    });
    mergeSetCookies(jar, res);
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    return j?.physical_store_id ? String(j.physical_store_id) : null;
  } catch { return null; }
}

// Fija el CP en la sesión del jar (lo que hace el modal de "código postal" de
// la web). Tras esto, plp-back/products?navigation=L1 con las mismas cookies
// devuelve el catálogo de esa zona.
async function setPostalCode(jar, cp) {
  try {
    const res = await fetch(`${HOME}/api/v1/common-aggregator/save-shipping-address?new_postal_code=${cp}`, {
      method: 'PUT',
      headers: {
        'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json',
        Origin: HOME, Referer: `${HOME}/`, Cookie: cookieHeader(jar),
      },
      body: 'null',
      signal: AbortSignal.timeout(20000),
    });
    mergeSetCookies(jar, res);
    return res.ok;
  } catch { return false; }
}

// CP candidatos de una provincia (INE 01–52) a probar con check-service hasta
// que uno responda con physical_store_id (algunos no existen/no tienen reparto).
const zoneSuffixes = ['001', '002', '004', '010', '500'];

// Resuelve 1 zona (physical_store_id) por provincia + el mapa zona→provincias
// que cubre (para derivar sus CCAA). Madrid (28) se barre primero solo para que
// sus datos (precio/nombre) sean los "por defecto" de los productos nacionales,
// como Mercadona con mad1 — pero, a diferencia de Mercadona, la tienda de Madrid
// NO es superconjunto nacional, así que la nacionalidad NO se decide por "estar
// en Madrid" sino por "aparecer en todas las CCAA con servicio" (ver
// computeRegions). Provincias sin servicio (verificado: Canarias 35/38, Melilla
// 52) se quedan fuera del barrido.
async function resolveZones() {
  const jar = await newSession();
  const zoneProvinces = new Map(); // physical_store_id -> Set(provincia)
  const zoneCp = new Map();        // physical_store_id -> CP representativo (para el crawl)
  const note = (zone, prov, cp) => {
    if (!zone) return;
    if (!zoneProvinces.has(zone)) zoneProvinces.set(zone, new Set());
    zoneProvinces.get(zone).add(prov);
    if (!zoneCp.has(zone)) zoneCp.set(zone, cp);
  };

  const provinces = Array.from({ length: 52 }, (_, i) => String(i + 1).padStart(2, '0'));
  provinces.sort((a, b) => (a === '28' ? -1 : b === '28' ? 1 : 0)); // 28 (Madrid) primero

  for (const prov of provinces) {
    let found = false;
    for (const suf of zoneSuffixes) {
      const cp = prov + suf;
      const zone = await checkService(jar, cp);
      if (zone) { found = true; note(zone, prov, cp); break; }
      await sleep(120);
    }
    if (!found) console.warn(`[dia] provincia ${prov}: sin servicio (Canarias/Melilla), se salta`);
  }

  // Reordena las zonas para que la de Madrid vaya primero (sus datos —precio,
  // nombre— quedan como los "por defecto" de los productos que trae).
  const zones = [...zoneProvinces.keys()].sort(
    (a, b) => (zoneProvinces.get(b).has('28') ? 1 : 0) - (zoneProvinces.get(a).has('28') ? 1 : 0),
  );
  return { zones: zones.slice(0, MAX_ZONES), zoneProvinces, zoneCp };
}

// Zona → comunidades que cubre (unión de las CCAA de sus provincias).
function buildZoneCommunities(zoneProvinces) {
  const zoneCommunities = new Map();
  for (const [zone, provs] of zoneProvinces) {
    const set = new Set();
    for (const prov of provs) { const c = PROVINCE_COMMUNITY[prov]; if (c) set.add(c); }
    zoneCommunities.set(zone, set);
  }
  return zoneCommunities;
}

// Dado el conjunto de zonas donde aparece un producto, devuelve la(s) CCAA donde
// está disponible, o null si es NACIONAL (aparece en TODAS las CCAA con servicio)
// — misma semántica que mercadona_products.regions: null = sin restricción; una
// lista = "solo disponible en esas CCAA". A diferencia de Mercadona, la
// nacionalidad NO se decide por estar en una zona de referencia (la tienda de
// Madrid muestreada no es superconjunto nacional en Dia → daría cientos de
// falsos regionales), sino comparando con `allCommunities` (las CCAA que cubre
// el barrido completo). Fallback seguro: sin CCAA atribuibles → null (nacional).
function computeRegions(zoneSet, zoneCommunities, allCommunities) {
  const communities = new Set();
  for (const zone of zoneSet) for (const c of zoneCommunities.get(zone) ?? []) communities.add(c);
  if (communities.size === 0) return null;                 // sin atribución → nacional
  if (communities.size >= allCommunities.size) return null; // en todas las CCAA → nacional
  return [...communities].sort((a, b) => a.localeCompare(b, 'es'));
}

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
// obligatorio ("navigation in query is required") y devuelve el catálogo entero
// DE LA ZONA fijada en la sesión del `jar` (ver setPostalCode).
async function getApi(path, { tries = 4, jar } = {}) {
  for (const prefix of API_PREFIXES) {
    const url = `${HOME}${prefix}/${path}`;
    for (let t = 0; t < tries; t++) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': UA, Accept: 'application/json',
            Origin: HOME, Referer: `${HOME}/`, 'Accept-Language': 'es-ES,es;q=0.9',
            ...(jar ? { Cookie: cookieHeader(jar) } : {}),
          },
          signal: AbortSignal.timeout(40000),
        });
        if (jar) mergeSetCookies(jar, res);
        if (res.ok) return await res.json();
        console.warn(`[dia] API ${prefix}/${path} → ${res.status} (intento ${t + 1})`);
        // No consumir los cuatro reintentos si el prefijo ya no existe.
        if (res.status === 404) break;
      } catch (e) {
        console.warn(`[dia] API ${prefix}/${path} falló: ${e.message} (intento ${t + 1})`);
      }
      await sleep(800 * (t + 1));
    }
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

const promotionDescriptions = (p) => (Array.isArray(p?.promotions) ? p.promotions : [])
  .map((promotion) => typeof promotion?.description === 'string' ? promotion.description.trim() : '')
  .filter(Boolean);

function compactPromotionName(description, promotion, prices) {
  if (description) {
    const multiBuy = description.match(/\b(\d+)\s*[xX]\s*(\d+)\b/);
    if (multiBuy) return `${multiBuy[1]}x${multiBuy[2]}`;

    const unitDiscount = description.match(/\b(\d+)[ªa]?\s*(?:UD(?:\.|S)?|UNIDAD(?:ES)?)\s+(?:AL\s+)?(\d+)\s*%/i);
    if (unitDiscount) return `${unitDiscount[1]}ª unidad al ${unitDiscount[2]}%`;

    const fixedBundle = description.match(/\b(\d+)\s*UD(?:\.|S)?\s+POR\s+([0-9]+(?:[.,][0-9]+)?)\s*EUROS?\b/i);
    if (fixedBundle) return `${fixedBundle[1]} uds. por ${fixedBundle[2].replace('.', ',')} €`;

    return promotion?.exclusive_online ? 'Oferta online' : 'Promoción CLUB Dia';
  }

  const discount = Number(prices?.discount_percentage);
  if (Number.isFinite(discount) && discount > 0) {
    return prices?.is_club_price ? `CLUB Dia · ${discount}%` : `Oferta · ${discount}%`;
  }
  return prices?.is_club_price ? 'Oferta CLUB Dia' : 'Oferta';
}

/** Normaliza la señal explícita de oferta que Dia incluye también en el PLP
 * general. Cubre tanto rebajas directas (precio tachado + porcentaje) como
 * promociones de lote/online (promotions[].description: 3x2, 2ª unidad, etc.). */
function diaOfferColumns(p) {
  const prices = p?.prices ?? {};
  const price = typeof prices.price === 'number' ? prices.price : null;
  const strikethrough = typeof prices.strikethrough_price === 'number'
    ? prices.strikethrough_price
    : null;
  const descriptions = promotionDescriptions(p);
  const promotion = Array.isArray(p?.promotions) ? p.promotions[0] : null;
  const hasDirectDiscount = Boolean(prices.is_promo_price)
    || (price != null && strikethrough != null && strikethrough > price);
  const hasBundlePromotion = descriptions.length > 0;
  const hasOfferHeadband = p?.headband_promotion === 'exclusive_offer'
    || p?.headband_promotion === 'exclusive_online';
  if (!hasDirectDiscount && !hasBundlePromotion && !hasOfferHeadband) return null;

  const promoText = descriptions.join(' · ') || null;
  return {
    promo_name: compactPromotionName(descriptions[0] ?? null, promotion, prices),
    promo_text: promoText,
    promo_base_price: price != null && strikethrough != null && strikethrough > price
      ? strikethrough
      : null,
  };
}

function diaOfferSnapshot(p) {
  const offer = diaOfferColumns(p);
  if (!offer) return null;
  const prices = p?.prices ?? {};
  const price = typeof prices.price === 'number' ? prices.price : null;
  const ppu = canonicalPricePerUnit(prices.price_per_unit, (prices.measure_unit || '').toLowerCase());
  return {
    n: offer.promo_name,
    t: offer.promo_text,
    bp: offer.promo_base_price,
    p: price,
    pf: price != null ? `${eurStr(price)} €` : null,
    ppu: ppu?.value ?? null,
    ppuu: ppu?.unit ?? null,
  };
}

function normalize(p) {
  const prices = p.prices ?? {};
  const price = typeof prices.price === 'number' ? prices.price : null;
  const offer = diaOfferColumns(p);
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
    promo_name: offer?.promo_name ?? null,
    promo_text: offer?.promo_text ?? null,
    promo_base_price: offer?.promo_base_price ?? null,
    offer_regions: offer ? null : [],
    regional_offers: {},
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

// Una página del catálogo entero (navigation=L1) de la zona del `jar`. Devuelve
// { items, totalPages }.
async function catalogPage(page, jar) {
  const j = await getApi(`${DIA_PLP_PATH}?navigation=L1${page > 1 ? `&page=${page}` : ''}`, { jar });
  // La API devuelve pagination.total_pages PLANO (el SSR lo anidaba en
  // pagination.pagination; no confundir). Tolera ambas por si acaso.
  const pg = j.pagination ?? {};
  return {
    // El BFF antiguo devolvía plp_items; el endpoint /products actual devuelve
    // products. Aceptar ambos facilita una vuelta atrás del despliegue de DIA.
    items: j.products ?? j.plp_items ?? j.items ?? [],
    totalPages: pg.total_pages ?? pg.pagination?.total_pages ?? 1,
    tree: j.category_data?.categories ?? null,
  };
}

async function main() {
  console.log(`[dia] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} conc=${CONCURRENCY}`);

  // 0) Resolver zonas: 1 CP por provincia → physical_store_id, deduplicado
  //    (Madrid primero, para que sus datos sean los "por defecto").
  const { zones, zoneProvinces, zoneCp } = await resolveZones();
  if (zones.length === 0) throw new Error('no se resolvió ninguna zona (¿cambió check-service?)');
  console.log(`[dia] ${zones.length} zonas a barrer`);

  // catRows/slugToN2/catName/parentOf: el árbol de categorías es taxonomía
  // nacional (no varía por zona) → se construye solo con la 1ª zona barrida.
  let catRows = null, seen = null, slugToN2 = null, catName = null, parentOf = null;
  const products = new Map();        // object_id → producto normalizado (datos de la 1ª zona que lo trae)
  const membership = new Map();      // object_id → Set<id N2>
  const zonesOfProduct = new Map();  // object_id → Set<physical_store_id>
  const offersOfProduct = new Map(); // object_id → Map<physical_store_id, oferta normalizada>
  const sweptZones = new Set();      // zonas que fijaron CP y barrieron (para allCommunities)

  for (const zone of zones) {
    const cp = zoneCp.get(zone);
    const jar = await newSession();
    const ok = await setPostalCode(jar, cp);
    if (!ok) { console.warn(`[dia] zona ${zone} (CP ${cp}): no se pudo fijar el CP, se salta`); continue; }
    sweptZones.add(zone);

    const first = await catalogPage(1, jar);

    if (!catRows) {
      // Árbol de categorías (category_data): N1→N2 (con id, name, link). Se
      // saltan los N1 de SKIP_N1 (L128 "Novedades y recomendados" = marketing).
      const n1s = (first.tree ?? []).filter((c) => c?.id && !SKIP_N1.has(c.id));
      if (n1s.length === 0) throw new Error('no encuentro category_data.categories en la API');
      catRows = []; seen = new Set(); slugToN2 = new Map();
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
      catName = new Map(catRows.map((c) => [c.id, c.name]));
      parentOf = new Map(catRows.map((c) => [c.id, c.parent_id]));
      console.log(`[dia] ${n1s.length} N1 · ${catRows.length} categorías (árbol tomado de la zona ${zone})`);
    }

    const totalPages = Math.min(first.totalPages, MAX_PAGES === Infinity ? first.totalPages : MAX_PAGES);

    const ingest = (items) => {
      for (const p of items) {
        if (p?.object_id == null) continue;
        const id = String(p.object_id);
        if (!products.has(id)) {
          const norm = normalize(p);
          if (!norm.display_name) continue;
          products.set(id, norm);
        }
        let zs = zonesOfProduct.get(id);
        if (!zs) zonesOfProduct.set(id, (zs = new Set()));
        zs.add(zone);
        const offer = diaOfferSnapshot(p);
        if (offer) {
          let byZone = offersOfProduct.get(id);
          if (!byZone) offersOfProduct.set(id, (byZone = new Map()));
          byZone.set(zone, offer);
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

    // Resto de páginas de esta zona, en paralelo (pool de workers).
    const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    let done = 1;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const page = pages.shift();
        if (page == null) break;
        try { ingest((await catalogPage(page, jar)).items); }
        catch (e) { console.warn(`[dia] zona ${zone} página ${page} falló: ${e.message}`); }
        if (++done % 50 === 0) console.log(`[dia] zona ${zone}: ${done}/${totalPages} páginas`);
        await sleep(80);
      }
    }));
    console.log(`[dia] zona ${zone} (CP ${cp}): ${totalPages} páginas · ${products.size} productos acumulados`);
  }

  if (!catRows) throw new Error('ninguna zona barrió con éxito (¿fallaron todos los save-shipping-address?)');

  // regions: CCAA donde cada producto está disponible; null = nacional (en todas
  // las CCAA con servicio), misma semántica que mercadona_products.regions. No se
  // usa aún para filtrar nada en la app — se guarda para no rehacer este barrido
  // después (filtrado por CP/comunidad autónoma del usuario, ver regions.ts).
  const zoneCommunities = buildZoneCommunities(zoneProvinces);
  // allCommunities = CCAA cubiertas por las zonas efectivamente barridas (no las
  // que fallaron al fijar CP): el umbral para considerar "nacional".
  const allCommunities = new Set();
  for (const zone of sweptZones) for (const c of zoneCommunities.get(zone) ?? []) allCommunities.add(c);
  let regionalCount = 0;
  let offerCount = 0;
  let regionalOfferCount = 0;
  for (const [id, det] of products) {
    det.regions = computeRegions(zonesOfProduct.get(id) ?? new Set(), zoneCommunities, allCommunities);
    if (det.regions) regionalCount++;

    // La promoción puede variar por zona aunque el producto sea nacional. Se
    // conserva un snapshot por CCAA para que la app muestre tanto la etiqueta
    // como el precio de oferta de la región seleccionada.
    const regionalOffers = {};
    for (const [zone, offer] of offersOfProduct.get(id) ?? []) {
      for (const community of zoneCommunities.get(zone) ?? []) {
        if (!regionalOffers[community]) regionalOffers[community] = offer;
      }
    }
    const offerRegions = Object.keys(regionalOffers);
    if (offerRegions.length > 0) {
      const baseOffer = regionalOffers['Comunidad de Madrid'] ?? regionalOffers[offerRegions[0]];
      det.promo_name = baseOffer.n;
      det.promo_text = baseOffer.t;
      det.promo_base_price = baseOffer.bp;
      det.offer_regions = offerRegions.length === allCommunities.size ? null : offerRegions;
      det.regional_offers = regionalOffers;
      offerCount++;
      if (det.offer_regions) regionalOfferCount++;
    } else {
      det.promo_name = null;
      det.promo_text = null;
      det.promo_base_price = null;
      det.offer_regions = [];
      det.regional_offers = {};
    }
  }
  console.log(`[dia] ${allCommunities.size} CCAA con servicio · ${regionalCount} productos con disponibilidad regional limitada`);
  console.log(`[dia] ${offerCount} productos en oferta · ${regionalOfferCount} con oferta limitada por CCAA`);

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
      con_oferta: rows.filter((r) => r.promo_name).length,
    });
    const unidades = new Set(rows.map((r) => r.raw.prices?.measure_unit).filter(Boolean));
    console.log('measure_units vistas:', [...unidades].join(', '));
    const regional = rows.filter((r) => r.regions?.length);
    console.log(`disponibilidad regional limitada: ${regional.length}. Muestra:`);
    for (const r of regional.slice(0, 12)) console.log(`         ${r.id}  ${r.display_name}  → ${r.regions.join(', ')}`);
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

export { diaDetailColumns, diaOfferColumns, diaOfferSnapshot, findProductObj, nutritionText, htmlToText };
