// Scraper compartido de Eroski y Caprabo (MISMO backend, framework Apache
// Tapestry: mismos ids de categoría, mismo markup, misma paginación). Lo usan
// scripts/sync-eroski.mjs y scripts/sync-caprabo.mjs, que solo cambian la base
// URL, el nombre de tabla y la etiqueta de tienda.
//
// Cómo funciona (verificado 2026-07-11):
//  1. GET home → mega-menú con el árbol de categorías completo como enlaces
//     /es/supermercado/{n1}/{n2}/{n3}[/{n4}]/. Se derivan las HOJAS (categorías
//     sin hijas) y el mapa hijo→padre por prefijo de ruta.
//  2. Por cada hoja: GET de su página con ?pageNumber=1,2,… (paginación clásica,
//     SIN sesión ni el endpoint stateful `loadpage`; 20 productos/página) hasta
//     que una página no aporta ids nuevos.
//  3. Cada "tile" trae un JSON `data-metrics` (evento select_item) con id, nombre,
//     marca, categoría (c1>c2>c3) y precio. Es la fuente limpia; el resto del
//     markup (comillas simples en el fragmento AJAX, dobles + HTML-escapado en la
//     página completa) se ignora. El parser tolera ambos estilos de comillas.
//
// No hay precio por unidad (€/L) ni EAN en los listados (solo en la ficha), así
// que price_per_unit queda null en v1 (como algunos productos de otros súpers).
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
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

async function fetchText(url, { tries = 4 } = {}) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-ES,es;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return await res.text();
      // 404/redirect a error = categoría vacía/inexistente: no reintentar.
      if (res.status === 404) return '';
    } catch (e) {
      if (t === tries - 1) throw e;
    }
    await sleep(600 * (t + 1));
  }
  return '';
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

// ── Crawl completo de un catálogo (Eroski o Caprabo) ─────────────────────────
// base: 'https://supermercado.eroski.es' | 'https://www.capraboacasa.com'
// normalize(item, { leafId, categoryPath }) → fila para la tabla *_products.
export async function crawlCatalog({
  base, normalize, concurrency = 5, maxPagesPerLeaf = 60, maxLeaves = Infinity,
  skipN1 = NON_FOOD_N1, log = () => {}, ctxExtra = {},
}) {
  const home = await fetchText(`${base}/es/`);
  if (!home) throw new Error('no se pudo cargar la home');
  const { catRows, leaves, catName, parentOf } = parseCategoryTree(home, { skipN1 });
  log(`${catRows.length} categorías · ${leaves.length} hojas`);

  const products = new Map(); // id → fila normalizada
  const catCount = new Map();
  const queue = leaves.slice(0, maxLeaves);
  let doneLeaves = 0;
  let emptyLeaves = 0; // hojas que acaban con 0 productos (posible throttling)

  // OJO throttling: cuando el servidor va cargado devuelve la página de categoría
  // COMPLETA (200, título correcto, con productListZone) pero SIN los tiles de
  // producto. Es indistinguible de una categoría vacía mirando una sola página,
  // así que la página 1 con 0 productos se REINTENTA con backoff; si tras los
  // reintentos sigue vacía se cuenta como hoja vacía. runSync aborta si la
  // fracción de hojas vacías es anómala (no escribe → markStale no despublica
  // medio catálogo por un pico de carga).
  async function fetchTilesRetry(url, retriesIfEmpty) {
    for (let t = 0; ; t++) {
      let html = '';
      try { html = await fetchText(url); } catch { html = ''; }
      const tiles = parseTiles(html);
      if (tiles.length > 0 || t >= retriesIfEmpty) return tiles;
      await sleep(1200 * (t + 1)); // 1,2s · 2,4s · 3,6s…
    }
  }

  async function crawlLeaf(segs) {
    const leafId = segs[segs.length - 1].split('-')[0];
    const urlPath = segs.join('/');
    const ancestors = ancestorsOf(parentOf, leafId);
    let leafProducts = 0;
    for (let page = 1; page <= maxPagesPerLeaf; page++) {
      const url = `${base}/es/supermercado/${urlPath}/?pageNumber=${page}`;
      // Solo la página 1 reintenta ante 0 tiles (una categoría real casi siempre
      // tiene productos); las siguientes con 0 son el fin normal de la categoría.
      const tiles = await fetchTilesRetry(url, page === 1 ? 3 : 0);
      if (tiles.length === 0) break;
      let added = 0;
      for (const it of tiles) {
        if (products.has(it.item_id)) continue;
        const row = normalize(it, { leafId, ancestors, catName, ...ctxExtra });
        if (!row) continue;
        products.set(it.item_id, row);
        added++;
        for (const a of ancestors) catCount.set(a, (catCount.get(a) ?? 0) + 1);
      }
      leafProducts += added;
      if (added === 0) break;        // página sin ids nuevos (wrap fuera de rango)
      if (tiles.length < 20) break;  // última página parcial
      await sleep(80);
    }
    if (leafProducts === 0) emptyLeaves++;
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
  return { products, catRows: catOut, catName, emptyLeaves, totalLeaves: doneLeaves };
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
  const runStart = new Date().toISOString();
  const tag = `[${store}]`;
  const log = (m) => console.log(`${tag} ${m}`);

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

  log(`inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} conc=${CONCURRENCY} base=${base}`);
  const { products, catRows, emptyLeaves, totalLeaves } = await crawlCatalog({
    base, normalize: makeNormalize(base, runStart),
    concurrency: CONCURRENCY, maxLeaves: MAX_LEAVES, log,
  });
  const rows = [...products.values()];
  const catOut = catRows.map((c) => ({ ...c, published: true, synced_at: runStart }));
  const emptyPct = totalLeaves ? Math.round((emptyLeaves / totalLeaves) * 100) : 0;
  log(`${rows.length} productos · ${catOut.length} categorías · ${emptyLeaves}/${totalLeaves} hojas vacías (${emptyPct}%)`);

  // Guardarraíl anti-throttling: si demasiadas hojas salieron vacías, el servidor
  // estaba sirviendo páginas sin productos (carga). Escribir + markStale con un
  // catálogo a medias despublicaría productos vivos → se aborta sin tocar nada.
  const EMPTY_ABORT_PCT = Number(process.env.EMPTY_ABORT_PCT || 20);
  if (!DRY_RUN && emptyPct > EMPTY_ABORT_PCT) {
    throw new Error(`abortado: ${emptyPct}% de hojas vacías (> ${EMPTY_ABORT_PCT}%), probable throttling; no se escribe para no despublicar productos vivos`);
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
    return;
  }
  if (rows.length === 0) throw new Error('0 productos (¿cambió el markup o el árbol?)');

  await upsert(catTable, catOut);
  await upsert(table, rows);
  await markStale({ url: SUPABASE_URL, key: SERVICE_ROLE, table, runStart });
  await markStale({ url: SUPABASE_URL, key: SERVICE_ROLE, table: catTable, runStart });
  log('OK');
}
