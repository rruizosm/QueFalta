// Scraper compartido de Eroski y Caprabo (MISMO backend, framework Apache
// Tapestry: mismos ids de categoría, mismo markup, misma paginación). Lo usan
// scripts/sync-eroski.mjs y scripts/sync-caprabo.mjs, que solo cambian la base
// URL, el nombre de tabla y la etiqueta de tienda.
//
// Cómo funciona (verificado 2026-07-11; paginación stateful desde la tarde del
// 2026-07-11, ver ⚠️ abajo):
//  1. GET home → mega-menú con el árbol de categorías completo como enlaces
//     /es/supermercado/{n1}/{n2}/{n3}[/{n4}]/. Se derivan las HOJAS (categorías
//     sin hijas) y el mapa hijo→padre por prefijo de ruta.
//  2. Por cada hoja: GET de su página SIN query (el SSR trae el 1er lote de 20)
//     guardando las cookies de sesión (JSESSIONID + supermarket.page); después,
//     el endpoint stateful de Tapestry: POST /es/supermarket:loadpage?t:ac={ruta}
//     con cuerpo `t:zoneid=productListZone&pageNumber=N` (N = lotes ya recibidos)
//     y cabeceras Origin/Referer/X-Requested-With — sin ellas responde redirect a
//     /es/error/general/. El JSON de respuesta trae en `content` el fragmento
//     HTML del siguiente lote de 20; `content` vacío = no hay más.
//     ⚠️ La paginación clásica `?pageNumber=N` (el diseño original) DEJÓ DE
//     FUNCIONAR el 2026-07-11: con el query param el server devuelve la página
//     entera con "No se obtuvieron resultados" (también en navegador real).
//  3. Cada "tile" trae un JSON `data-metrics` (evento select_item) con id, nombre,
//     marca, categoría (c1>c2>c3) y precio. Es la fuente limpia; el resto del
//     markup (comillas simples en el fragmento AJAX, dobles + HTML-escapado en la
//     página completa) se ignora. El parser tolera ambos estilos de comillas.
//  4. La ficha se completa incrementalmente con GET de
//     /es/productdetail/{id}-{slug}/. Guarda ingredientes, condiciones de
//     conservación, fabricante y la tabla nutricional normalizada por 100 g/ml.
//
// No hay precio por unidad (€/L) ni EAN en los listados; la ficha HTML tampoco
// expone un EAN verificable. price_per_unit queda null (como en otros súpers).
// Nombres solo en castellano (Caprabo /ca/ redirige; su data-locale=ca pero
// lang=es → los nombres de producto no se traducen).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// N1 no-alimentación que se excluyen (bazar/electro/textil): mantenemos el
// espejo como un catálogo de súper, como el resto de tiendas.
export const NON_FOOD_N1 = new Set([
  '6000072', // Papelería, libros y juguetes
  '6000124', // Hogar, bricolaje y textil
  '6000420', // Electrónica
  '6000457', // Descanso
  '6000510', // Electrohogar
]);

const htmlUnescape = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

// Jar de cookies mínimo (por hoja): el loadpage stateful necesita la sesión
// (JSESSIONID + supermarket.page) que reparte el GET de la página de categoría.
function makeJar() {
  const jar = new Map();
  return {
    absorb(res) {
      for (const c of res.headers.getSetCookie()) {
        const [kv] = c.split(';');
        const i = kv.indexOf('=');
        if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1));
      }
    },
    header() { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '); },
  };
}

async function fetchText(url, { tries = 4, jar = null } = {}) {
  let lastStatus = null;
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-ES,es;q=0.9',
          ...(jar && jar.header() ? { Cookie: jar.header() } : {}),
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
      });
      if (jar) jar.absorb(res);
      if (res.ok) return await res.text();
      // 404/redirect a error = categoría vacía/inexistente: no reintentar.
      if (res.status === 404) return '';
      lastStatus = res.status;
      console.warn(`[fetch] HTTP ${res.status} ${url} (intento ${t + 1}/${tries})`);
      // 429 = rate limit: backoff largo (Retry-After si viene; si no 5s·10s·15s),
      // en vez del genérico de abajo. Visto en vivo el 2026-07-11 al encadenar
      // crawls desde una misma IP.
      if (res.status === 429 && t < tries - 1) {
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        await sleep(Math.max(retryAfter * 1000, 5000 * (t + 1)));
        continue;
      }
    } catch (e) {
      if (t === tries - 1) throw e;
      console.warn(`[fetch] ${e.name}: ${e.message} ${url} (intento ${t + 1}/${tries})`);
    }
    await sleep(600 * (t + 1));
  }
  // Estado no-OK persistente (403 = bloqueo de IP/bot, 429/503 = carga…): lanzar
  // con el código para que el fallo diga QUÉ pasó (antes devolvía '' y el error
  // de la home era mudo). fetchTilesRetry ya captura y lo trata como página vacía.
  throw new Error(`HTTP ${lastStatus} en ${url} tras ${tries} intentos`);
}

// ── Árbol de categorías desde el mega-menú de la home ────────────────────────
// Devuelve { catRows:[{id,name,parent_id}], leaves:[pathArray], catName, parentOf }.
// `path` es el array de ids [n1,n2,n3…]; la URL de la hoja se reconstruye con los
// slugs, que también se guardan (los necesita el GET de la categoría).
export function parseCategoryTree(homeHtml, { skipN1 = NON_FOOD_N1 } = {}) {
  // Cada enlace de categoría: /{locale}/supermercado/{seg}/{seg}/…  seg = id-slug
  const segRe = /\/(?:es|ca)\/supermercado\/((?:\d+-[a-z0-9-]+\/)+)/g;
  const paths = new Map(); // key "id/id/id" → array de segmentos "id-slug"
  for (const m of homeHtml.matchAll(segRe)) {
    const segs = m[1].replace(/\/$/, '').split('/');
    const key = segs.map((s) => s.split('-')[0]).join('/');
    if (!paths.has(key)) paths.set(key, segs);
  }
  const keys = [...paths.keys()];
  const keySet = new Set(keys);
  // Nombre de cada categoría a partir del slug ("2059700-naranjas-y-otros-citricos"
  // → "Naranjas y otros cítricos"): capitaliza la 1ª palabra y deja el resto en
  // minúsculas (los slugs no llevan acentos, se acepta esa pérdida). Los nombres
  // reales del mega-menú irían con tildes, pero el slug es suficiente para la UI.
  const CONNECTORS = new Set(['y', 'e', 'o', 'u', 'de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'para', 'a', 'al', 'en', 'por']);
  const slugName = (seg) => {
    const words = seg.split('-').slice(1);
    return words.map((w, i) => (i > 0 && CONNECTORS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ').trim();
  };

  const idToSeg = new Map();
  for (const segs of paths.values()) for (const s of segs) idToSeg.set(s.split('-')[0], s);

  // Filas de categoría (id, name, parent_id), excluyendo los N1 no-alimentación.
  const catRows = [];
  const seen = new Set();
  const parentOf = new Map();
  const catName = new Map();
  for (const key of keys) {
    const ids = key.split('/');
    if (skipN1.has(ids[0])) continue;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const parent = i === 0 ? null : ids[i - 1];
      if (!seen.has(id)) {
        seen.add(id);
        const seg = idToSeg.get(id);
        const name = seg ? slugName(seg) : id;
        catRows.push({ id, name, parent_id: parent });
        catName.set(id, name);
        parentOf.set(id, parent);
      }
    }
  }
  // Hojas = rutas que ningún otro path extiende, y cuyo N1 es alimentación.
  const leaves = keys
    .filter((k) => !skipN1.has(k.split('/')[0]))
    .filter((k) => !keys.some((q) => q !== k && q.startsWith(k + '/')))
    .map((k) => paths.get(k)); // array de segmentos id-slug

  return { catRows, leaves, catName, parentOf };
}

const ancestorsOf = (parentOf, id) => {
  const chain = [];
  for (let cur = id; cur; cur = parentOf.get(cur) ?? null) chain.push(cur);
  return chain;
};

// ── Parseo de tiles de una página de categoría ───────────────────────────────
// Extrae los productos del JSON data-metrics (evento select_item). Tolera
// comillas simples (fragmento AJAX) y dobles + HTML-escapado (página completa).
export function parseTiles(html) {
  const out = [];
  const seen = new Set();
  for (const m of html.matchAll(/data-metrics=(['"])(.*?)\1/gs)) {
    let d;
    try { d = JSON.parse(htmlUnescape(m[2])); } catch { continue; }
    if (d?.event !== 'select_item') continue;
    const it = d?.ecommerce?.items?.[0];
    if (!it?.item_id || seen.has(it.item_id)) continue;
    seen.add(it.item_id);
    out.push(it);
  }
  return out;
}

// ── Ficha de producto: tabla nutricional SSR ────────────────────────────────
// La web publica una lista HTML del tipo:
//   Cantidad <span>100 gramos</span>
//   Energía <span>177 kilojulios</span>
//   Grasas <span>0.4 gramos</span>
// La convertimos al contrato textual común de los espejos para que el cliente
// pueda pasar `nutrition` directamente a `parseCatalogNutrition`.
const stripHtml = (value) => htmlUnescape((value ?? '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ')
  .trim();

const nutritionKey = (value) => stripHtml(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[:\s]+$/g, '')
  .trim();

function canonicalNutritionLabel(value) {
  const clean = stripHtml(value).replace(/:\s*$/, '');
  const key = nutritionKey(clean);
  if (/^(energia|valor energetico)$/.test(key)) return 'Valor energético';
  if (/^(acidos? grasos? saturados?|grasas? saturadas?)$/.test(key)) return 'Grasas saturadas';
  if (/^grasas?$/.test(key)) return 'Grasas';
  if (/^(hidratos? de carbono|carbohidratos?)$/.test(key)) return 'Hidratos de carbono';
  if (/^(de los cuales )?azucares?$/.test(key)) return 'Azúcares';
  if (/^fibra( alimentaria)?$/.test(key)) return 'Fibra';
  if (/^proteinas?$/.test(key)) return 'Proteínas';
  if (/^sal$/.test(key)) return 'Sal';
  return clean;
}

function canonicalNutritionValue(value) {
  return stripHtml(value)
    .replace(/kilocalor(?:ía|ia)(?:\s+it\s*\([^)]*\))?s?/gi, 'kcal')
    .replace(/kilojulios?/gi, 'kJ')
    .replace(/microgramos?/gi, 'µg')
    .replace(/miligramos?/gi, 'mg')
    .replace(/mililitros?/gi, 'ml')
    .replace(/gramos?/gi, 'g')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrae la nutrición de una PDP y devuelve texto por 100 g/ml reutilizable
 * por el Índice Alimentario. Devuelve null cuando la ficha no publica tabla. */
export function parseNutritionHtml(html) {
  if (typeof html !== 'string' || !html) return null;
  const title = html.match(
    /<span[^>]*class=(['"])[^'"]*\btitle\b[^'"]*\1[^>]*>\s*Informaci[oó]n\s+Nutricional\s*<\/span>/i,
  );
  if (!title || title.index == null) return null;
  const afterTitle = html.slice(title.index + title[0].length);
  const list = afterTitle.match(/<ul[^>]*class=(['"])[^'"]*\blist\b[^'"]*\1[^>]*>([\s\S]*?)<\/ul>/i);
  if (!list) return null;

  let perQuantity = null;
  const nutrients = [];
  for (const item of list[2].matchAll(/<li[^>]*>([\s\S]*?)<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/li>/gi)) {
    const label = stripHtml(item[1]);
    const value = canonicalNutritionValue(item[2]);
    if (!label || !value) continue;
    if (nutritionKey(label) === 'cantidad') {
      perQuantity = value;
      continue;
    }
    nutrients.push(`${canonicalNutritionLabel(label)}: ${value}`);
  }
  if (nutrients.length === 0) return null;
  return [perQuantity ? `Valores medios por ${perQuantity}` : 'Valores medios por 100 g', ...nutrients].join('\n');
}

function featureText(html, titlePattern) {
  if (typeof html !== 'string' || !html) return null;
  const titleRe = /<span[^>]*class=(['"])[^'"]*\btitle\b[^'"]*\1[^>]*>([\s\S]*?)<\/span>/gi;
  for (const match of html.matchAll(titleRe)) {
    if (!titlePattern.test(stripHtml(match[2]))) continue;
    const afterTitle = html.slice((match.index ?? 0) + match[0].length);
    const nextFeature = afterTitle.search(/<div[^>]*class=(['"])[^'"]*\bfeature\b[^'"]*\1[^>]*>/i);
    const section = afterTitle.slice(0, nextFeature >= 0 ? nextFeature : 1600);
    const paragraphs = [...section.matchAll(
      /<p[^>]*class=(['"])[^'"]*\btext\b[^'"]*\1[^>]*>([\s\S]*?)<\/p>/gi,
    )]
      .map((paragraph) => stripHtml(paragraph[2]))
      .filter(Boolean);
    return paragraphs.length > 0 ? paragraphs.join('\n') : null;
  }
  return null;
}

/** Extrae los campos de ficha que publican Eroski y Caprabo en bloques feature. */
export function parseProductDetailHtml(html) {
  return {
    ingredients: featureText(html, /^ingredientes$/i),
    conservation: featureText(html, /^condiciones\s+de\s+conservaci[oó]n$/i),
    manufacturer: featureText(html, /^fabricante$/i),
    nutrition: parseNutritionHtml(html),
  };
}

const productSlug = (name) => (name ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 140) || 'producto';

const productDetailUrl = (base, row) =>
  `${base}/es/productdetail/${encodeURIComponent(row.id)}-${productSlug(row.display_name)}/`;

async function fetchProductDetail(base, row) {
  const html = await fetchText(productDetailUrl(base, row), { tries: 3 });
  // Un 200 de Tapestry puede ser una página de error genérica. Este id solo
  // aparece en la ficha real y permite distinguirla de una respuesta vacía.
  if (!html || !html.includes(`item-detail-main-${row.id}`)) {
    return { ok: false, ingredients: null, conservation: null, manufacturer: null, nutrition: null };
  }
  return { ok: true, ...parseProductDetailHtml(html) };
}

// ── Paginación stateful (Tapestry `supermarket:loadpage`) ────────────────────
// Devuelve el fragmento HTML del siguiente lote ('' si la categoría está agotada)
// o null si el server respondió error/redirect (sesión perdida, carga…) — el
// llamante decide si reintenta. `n` = nº de lotes ya recibidos (el SSR cuenta 1).
async function fetchLoadpage(base, urlPath, n, jar) {
  const res = await fetch(`${base}/es/supermarket:loadpage?t:ac=${urlPath}`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Accept': '*/*',
      'Accept-Language': 'es-ES,es;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      // Sin Origin/Referer, Tapestry responde {_tapestry:{redirectURL:…/error/general/}}.
      Origin: base,
      Referer: `${base}/es/supermercado/${urlPath}/`,
      Cookie: jar.header(),
    },
    body: `t%3Azoneid=productListZone&pageNumber=${n}`,
    signal: AbortSignal.timeout(30000),
  });
  jar.absorb(res);
  if (!res.ok) return null;
  let payload;
  try { payload = JSON.parse(await res.text()); } catch { return null; }
  if (payload?._tapestry?.redirectURL) return null;
  return payload?.content ?? '';
}

// ── Crawl completo de un catálogo (Eroski o Caprabo) ─────────────────────────
// base: 'https://supermercado.eroski.es' | 'https://www.capraboacasa.com'
// normalize(item, { leafId, categoryPath }) → fila para la tabla *_products.
export async function crawlCatalog({
  base, normalize, concurrency = 5, maxPagesPerLeaf = 60, maxLeaves = Infinity,
  skipN1 = NON_FOOD_N1, log = () => {}, ctxExtra = {},
}) {
  // La home es la petición crítica (de ella sale todo el árbol): más reintentos
  // que una página de categoría. Si falla, fetchText lanza ya con el estado HTTP.
  const home = await fetchText(`${base}/es/`, { tries: 6 });
  if (!home) throw new Error('home vacía (404 o 200 sin cuerpo)');
  const { catRows, leaves, catName, parentOf } = parseCategoryTree(home, { skipN1 });
  log(`${catRows.length} categorías · ${leaves.length} hojas`);

  const products = new Map(); // id → fila normalizada
  const catCount = new Map();
  const queue = leaves.slice(0, maxLeaves);
  let doneLeaves = 0;
  // Señal de throttling = hojas cuya página 1 llegó SIN NINGÚN tile tras los
  // reintentos. OJO: no confundir con hojas cuyos tiles son todos productos ya
  // vistos en otras hojas (solapamiento del árbol) — esas el server las sirvió
  // bien y se cuentan aparte (shadowedLeaves, solo informativo). El run de CI
  // del 2026-07-11 abortó con "56% vacías" mezclando ambas cosas.
  let noTileLeaves = 0;
  let shadowedLeaves = 0;

  // OJO throttling: cuando el servidor va cargado devuelve la página de categoría
  // COMPLETA (200, título correcto, con productListZone) pero SIN los tiles de
  // producto. Es indistinguible de una categoría vacía mirando una sola página,
  // así que la página 1 con 0 productos se REINTENTA con backoff; si tras los
  // reintentos sigue vacía se cuenta como hoja vacía. runSync aborta si la
  // fracción de hojas vacías es anómala (no escribe → markStale no despublica
  // medio catálogo por un pico de carga).
  async function fetchTilesRetry(url, retriesIfEmpty, jar) {
    for (let t = 0; ; t++) {
      let html = '';
      try { html = await fetchText(url, { jar }); } catch { html = ''; }
      const tiles = parseTiles(html);
      if (tiles.length > 0 || t >= retriesIfEmpty) return tiles;
      await sleep(1200 * (t + 1)); // 1,2s · 2,4s · 3,6s…
    }
  }

  async function crawlLeaf(segs) {
    const leafId = segs[segs.length - 1].split('-')[0];
    const urlPath = segs.join('/');
    const ancestors = ancestorsOf(parentOf, leafId);
    const jar = makeJar(); // sesión propia de la hoja (la necesita el loadpage)
    let leafProducts = 0;

    const ingest = (tiles) => {
      let added = 0;
      for (const it of tiles) {
        if (products.has(it.item_id)) continue;
        const row = normalize(it, { leafId, ancestors, catName, ...ctxExtra });
        if (!row) continue;
        products.set(it.item_id, row);
        added++;
        for (const a of ancestors) catCount.set(a, (catCount.get(a) ?? 0) + 1);
      }
      return added;
    };

    // Lote 1: SSR de la página de categoría (sin query), reintentando ante
    // 0 tiles (una categoría real casi siempre tiene productos → throttling).
    const first = await fetchTilesRetry(`${base}/es/supermercado/${urlPath}/`, 3, jar);
    if (first.length === 0) { noTileLeaves++; return; }
    leafProducts += ingest(first);

    // Lotes siguientes vía loadpage, solo si el SSR vino lleno (20 = puede haber
    // más). null (error/redirect) se reintenta con backoff; '' es el fin normal.
    if (first.length >= 20 && leafProducts > 0) {
      for (let n = 1; n <= maxPagesPerLeaf; n++) {
        let content = null;
        for (let t = 0; t < 3 && content == null; t++) {
          if (t > 0) await sleep(1200 * t);
          try { content = await fetchLoadpage(base, urlPath, n, jar); } catch { content = null; }
        }
        if (!content) break; // '' = categoría agotada; null = error persistente
        const tiles = parseTiles(content);
        const added = ingest(tiles);
        leafProducts += added;
        if (added === 0) break;        // lote sin ids nuevos
        if (tiles.length < 20) break;  // último lote parcial
        await sleep(80);
      }
    }
    if (leafProducts === 0) shadowedLeaves++; // tiles OK pero todos ya vistos
  }

  // Pool de workers.
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (;;) {
      const segs = queue.shift();
      if (!segs) break;
      try { await crawlLeaf(segs); }
      catch (e) { log(`hoja ${segs.join('/')} falló: ${e.message}`); }
      if (++doneLeaves % 100 === 0) log(`${doneLeaves}/${leaves.length} hojas · ${products.size} productos`);
    }
  }));

  // product_count por categoría en las filas del árbol.
  const catOut = catRows.map((c) => ({ ...c, product_count: catCount.get(c.id) ?? 0 }));
  return { products, catRows: catOut, catName, noTileLeaves, shadowedLeaves, totalLeaves: doneLeaves };
}

export { fetchText };

// ── Normalización de un producto (común a Eroski y Caprabo) ──────────────────
const eurStr = (n) => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : null);
const cleanBrand = (b) => {
  const s = (b ?? '').replace(/\.+$/, '').trim(); // "EROSKI." → "EROSKI"
  return s && s !== '—' ? s : null;
};

// Devuelve la función normalize para un `base` dado (fija la URL de imagen y el
// runStart). La imagen grande es /images/{id}_x.jpg (~50 KB vs 7 KB la normal).
function makeNormalize(base, runStart) {
  return (it, { leafId, ancestors, catName }) => {
    const price = typeof it.price === 'number' ? it.price : null;
    const name = (it.item_name || '').trim();
    if (!name) return null;
    return {
      id: String(it.item_id),
      display_name: name,
      brand: cleanBrand(it.item_brand),
      thumbnail: `${base}/images/${it.item_id}_x.jpg`,
      category_id: leafId,
      category_name: catName.get(leafId) ?? null,
      category_ids: ancestors,
      unit_price: price,
      price_format: price != null ? `${eurStr(price)} €` : null,
      price_per_unit: null,       // el €/unidad no está en el listado (solo en la ficha)
      price_per_unit_unit: null,
      available: true,
      published: true,
      raw: it,
      synced_at: runStart,
    };
  };
}

// ── Driver de sync completo (lo llaman sync-eroski.mjs y sync-caprabo.mjs) ────
// opts: { base, store, table, catTable, envPrefix } + flags de entorno.
export async function runSync({ base, store, table, catTable }) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  const DRY_RUN = process.env.DRY_RUN === '1';
  const CONCURRENCY = Number(process.env.CONCURRENCY || 5);
  const MAX_LEAVES = process.env.MAX_LEAVES ? Number(process.env.MAX_LEAVES) : Infinity;
  const SKIP_DETAIL = process.env.SKIP_DETAIL === '1';
  const DETAIL_CONCURRENCY = Math.max(1, Number(process.env.DETAIL_CONCURRENCY || 3));
  const DETAIL_TTL_DAYS = Math.max(1, Number(process.env.DETAIL_TTL_DAYS || 90));
  const DETAIL_MAX = process.env.DETAIL_MAX ? Number(process.env.DETAIL_MAX) : 1000;
  const DRY_DETAIL_MAX = Math.max(0, Number(process.env.DRY_DETAIL_MAX || 3));
  const runStart = new Date().toISOString();
  const tag = `[${store}]`;
  const log = (m) => console.log(`${tag} ${m}`);
  const DETAIL_COLS = ['ingredients', 'conservation', 'manufacturer', 'nutrition'];

  if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
    process.exit(1);
  }

  const { markStale } = await import('./stale.mjs');
  const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  async function upsert(tbl, rows) {
    for (const c of chunk(rows, 500)) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${tbl}`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`,
          'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(c),
      });
      if (!res.ok) throw new Error(`upsert ${tbl} ${res.status}: ${await res.text()}`);
    }
  }

  // Lee la ficha ya guardada para no descargar decenas de miles de PDP cada
  // semana. `detail_synced_at` también recuerda fichas válidas sin información.
  async function fetchExistingDetails() {
    const map = new Map();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?select=id,${DETAIL_COLS.join(',')},detail_synced_at&order=id.asc`,
        {
          headers: {
            apikey: SERVICE_ROLE,
            Authorization: `Bearer ${SERVICE_ROLE}`,
            Range: `${from}-${from + PAGE - 1}`,
            'Range-Unit': 'items',
          },
        },
      );
      if (!res.ok) throw new Error(`read detail ${table} ${res.status}: ${await res.text()}`);
      const batch = await res.json();
      for (const row of batch) map.set(String(row.id), row);
      if (batch.length < PAGE) break;
    }
    return map;
  }

  async function loadExistingDetails(rows) {
    const existing = await fetchExistingDetails();
    const ttlMs = DETAIL_TTL_DAYS * 86400000;
    const now = Date.now();
    const stale = [];
    for (const row of rows) {
      const previous = existing.get(row.id);
      for (const column of DETAIL_COLS) row[column] = previous?.[column] ?? null;
      row.detail_synced_at = previous?.detail_synced_at ?? null;
      const detailTime = row.detail_synced_at ? new Date(row.detail_synced_at).getTime() : NaN;
      if (!Number.isFinite(detailTime) || now - detailTime >= ttlMs) stale.push(row);
    }
    return stale;
  }

  async function downloadDetails(stale, max = DETAIL_MAX) {
    const batch = stale.slice(0, max);
    const queue = [...batch];
    const updated = [];
    let done = 0;
    let withDetails = 0;
    let withoutDetails = 0;
    log(`ficha: ${batch.length} productos a descargar · ${stale.length - batch.length} pospuestos`);
    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, async () => {
      for (;;) {
        const row = queue.shift();
        if (!row) break;
        try {
          const detail = await fetchProductDetail(base, row);
          if (detail.ok) {
            const hadDetails = DETAIL_COLS.some((column) => !!row[column]);
            const foundDetails = DETAIL_COLS.some((column) => !!detail[column]);
            // Un null nuevo es válido si la ficha nunca publicó datos. Para no
            // borrar información conocida ante un cambio puntual de markup, solo
            // se reemplaza una columna cuando la respuesta trae ese campo.
            if (foundDetails || !hadDetails) {
              for (const column of DETAIL_COLS) {
                if (detail[column] != null || row[column] == null) row[column] = detail[column];
              }
              row.detail_synced_at = runStart;
              updated.push(row);
              if (foundDetails) withDetails++;
              else withoutDetails++;
            }
          }
        } catch (e) {
          log(`ficha ${row.id} falló: ${e.message.split('\n')[0]}`);
        }
        if (++done % 100 === 0) log(`ficha ${done}/${batch.length}`);
        await sleep(120);
      }
    }));
    log(`ficha: ${withDetails} con datos · ${withoutDetails} sin datos · ${updated.length} comprobadas`);
    return updated;
  }

  log(`inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} conc=${CONCURRENCY} base=${base}`);
  const { products, catRows, noTileLeaves, shadowedLeaves, totalLeaves } = await crawlCatalog({
    base, normalize: makeNormalize(base, runStart),
    concurrency: CONCURRENCY, maxLeaves: MAX_LEAVES, log,
  });
  const rows = [...products.values()];
  const catOut = catRows.map((c) => ({ ...c, published: true, synced_at: runStart }));
  const noTilePct = totalLeaves ? Math.round((noTileLeaves / totalLeaves) * 100) : 0;
  log(`${rows.length} productos · ${catOut.length} categorías · ${noTileLeaves}/${totalLeaves} hojas sin tiles (${noTilePct}%) · ${shadowedLeaves} hojas solo-duplicados`);

  // Guardarraíl anti-throttling: si demasiadas hojas llegaron SIN NINGÚN tile,
  // el servidor estaba sirviendo páginas sin productos (carga) o cambió el
  // markup. Escribir + markStale con un catálogo a medias despublicaría
  // productos vivos → se aborta sin tocar nada. Las hojas solo-duplicados
  // (solapamiento del árbol) NO cuentan: el server las sirvió bien.
  const EMPTY_ABORT_PCT = Number(process.env.EMPTY_ABORT_PCT || 20);
  if (!DRY_RUN && noTilePct > EMPTY_ABORT_PCT) {
    throw new Error(`abortado: ${noTilePct}% de hojas sin tiles (> ${EMPTY_ABORT_PCT}%), probable throttling o cambio de markup; no se escribe para no despublicar productos vivos`);
  }

  if (DRY_RUN) {
    console.log('muestra (6):');
    for (const r of rows.slice(0, 6)) {
      console.log(`  ${r.id}  ${r.display_name}  [${r.brand ?? '—'}]  ${r.price_format}  cat=${r.category_name ?? '—'}  (${r.category_ids.length} niveles)`);
    }
    console.log('nulos →', {
      sin_precio: rows.filter((r) => r.unit_price == null).length,
      sin_img: rows.filter((r) => !r.thumbnail).length,
      sin_categoria: rows.filter((r) => r.category_ids.length === 0).length,
      sin_marca: rows.filter((r) => !r.brand).length,
    });
    if (!SKIP_DETAIL && DRY_DETAIL_MAX > 0) {
      const checked = await downloadDetails(rows, Math.min(DRY_DETAIL_MAX, rows.length));
      for (const row of checked) {
        console.log(`\nficha ${row.id} — ${row.display_name}`);
        for (const column of DETAIL_COLS) console.log(`  ${column}: ${row[column] ?? '—'}`);
      }
    }
    return;
  }
  if (rows.length === 0) throw new Error('0 productos (¿cambió el markup o el árbol?)');

  let staleDetails = [];
  if (!SKIP_DETAIL) staleDetails = await loadExistingDetails(rows);

  // Guardamos primero el catálogo: si la pasada incremental de fichas se corta,
  // precios/disponibilidad y soft-delete ya quedan actualizados.
  await upsert(catTable, catOut);
  await upsert(table, rows);
  await markStale({ url: SUPABASE_URL, key: SERVICE_ROLE, table, runStart });
  await markStale({ url: SUPABASE_URL, key: SERVICE_ROLE, table: catTable, runStart });

  if (!SKIP_DETAIL) {
    const updated = await downloadDetails(staleDetails);
    if (updated.length > 0) await upsert(table, updated);
  }
  log('OK');
}
