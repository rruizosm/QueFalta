#!/usr/bin/env node
// Sincroniza el catálogo de Consum → Supabase (catálogo + búsqueda), 1×/día.
// Sin dependencias npm. Usa fetch nativo de Node 18+ (Consum no está tras
// Cloudflare ni necesita cookies de sesión, a diferencia de Carrefour/bonÀrea).
//
// Consum expone una API REST JSON abierta (verificada 2026-06-12):
//
//   GET /api/rest/V1.0/shopping/category/menu
//   → árbol de categorías anidado completo (id, nombre, url, level 1-4, subcategories)
//
//   GET /api/rest/V1.0/catalog/product?offset=N&limit=100
//   → { totalCount, hasMore, products:[...] } con el producto YA estructurado:
//     code (id público), ean, productData{name,brand,imageURL,description,availability},
//     priceData{prices[{id:PRICE|OFFER_PRICE, value:{centAmount,centUnitAmount}}],
//     unitPriceUnitType}, categories[{id,name}] (hojas a las que pertenece).
//
// Estrategia (distinta de bonÀrea/Carrefour: NO hace falta recorrer hojas):
//   1. GET menu → árbol completo (se salta la N1 promocional "Ahora más barato",
//      id 99999, que duplica productos ya presentes en su categoría real).
//   2. Paginar el catálogo ENTERO con offset/limit (~9.400 productos, ~94 páginas;
//      el límite real por página es 100 aunque pidas más).
//   3. La membership viene embebida: categories[] del producto (hojas). Se expande
//      con los ancestros del árbol para poder navegar por cualquier nivel.
//   4. Normalizar + upsert en Supabase (soft-delete de lo ausente vía markStale).
//
// Notas:
//  - El precio va en céntimos "de nombre" pero en EUROS de valor (centAmount: 1.45
//    = 1,45 €). Si hay oferta, prices trae PRICE y OFFER_PRICE → se guarda el
//    OFFER_PRICE (lo que paga el cliente) y el raw conserva ambos.
//  - centUnitAmount + unitPriceUnitType ("1 Kg", "1 L"…) dan el €/unidad de medida
//    → price_per_unit canónico (l/kg/ud) vía lib/price.mjs, como el resto de supers.
//  - Consum es el ÚNICO súper que da EAN y marca estructurados → se guardan.
//  - Los precios son los de la zona por defecto (sesión anónima, sin código postal).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      CONCURRENCY=4       (páginas descargadas en paralelo)
//      DRY_RUN=1           (no escribe en Supabase; imprime resumen)
//      MAX_PAGES=N         (limita nº de páginas, para pruebas)
//      SKIP_N1=csv         (ids de N1 a excluir; por defecto "99999" = Ahora más barato)
import { canonicalPricePerUnit } from './lib/price.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);
const MAX_PAGES = process.env.MAX_PAGES ? Number(process.env.MAX_PAGES) : Infinity;
const SKIP_N1 = new Set((process.env.SKIP_N1 ?? '99999').split(',').map((s) => s.trim()).filter(Boolean));

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
  process.exit(1);
}

const API = 'https://tienda.consum.es/api/rest/V1.0';
const PAGE_SIZE = 100; // límite real del endpoint (limit>100 devuelve 100 igualmente)
const runStart = new Date().toISOString();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function getJson(path, { tries = 4 } = {}) {
  const url = `${API}${path}`;
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
      if (res.ok) return await res.json();
      console.warn(`[consum] GET ${path} → ${res.status} (intento ${t + 1})`);
    } catch (e) {
      console.warn(`[consum] GET ${path} falló: ${e.message} (intento ${t + 1})`);
    }
    await sleep(700 * (t + 1));
  }
  throw new Error(`no se pudo GET ${path}`);
}

// ── Árbol de categorías ──────────────────────────────────────────────────────
// El menú es un array de N1 con `subcategories` anidadas (hasta level 4).
// Devuelve filas para consum_categories y un mapa id→parent para expandir ancestros.
function walkTree(nodes, parentId, catRows, seen) {
  for (const n of nodes || []) {
    const id = n?.id != null ? String(n.id) : null;
    if (!id || (parentId === null && SKIP_N1.has(id))) continue;
    if (!seen.has(id)) {
      seen.add(id);
      catRows.push({
        id, name: (n.nombre || n.name || '').trim(), parent_id: parentId,
        url: n.url || null, product_count: null, published: true, synced_at: runStart,
      });
    }
    walkTree(n.subcategories, id, catRows, seen);
  }
}

// ── Normalización de un producto ─────────────────────────────────────────────
const eurStr = (n) => (typeof n === 'number' ? n.toFixed(2).replace('.', ',') : null);

function normalize(p) {
  const pd = p.productData ?? {};
  // Precio que paga el cliente: OFFER_PRICE si hay oferta activa, si no PRICE.
  // OJO: centAmount viene en EUROS pese al nombre (1.45 = 1,45 €).
  const prices = p.priceData?.prices ?? [];
  const entry = prices.find((x) => x.id === 'OFFER_PRICE') ?? prices.find((x) => x.id === 'PRICE') ?? prices[0];
  const price = typeof entry?.value?.centAmount === 'number' ? entry.value.centAmount : null;
  const ppu = canonicalPricePerUnit(entry?.value?.centUnitAmount, p.priceData?.unitPriceUnitType);
  // "Rabanito Bolsa 250 Gr" (description) = name + formato → el resto es el envase.
  const name = (pd.name || '').trim();
  const desc = (pd.description || '').trim();
  const packaging = desc.toLowerCase().startsWith(name.toLowerCase()) && desc.length > name.length
    ? desc.slice(name.length).trim() || null
    : null;
  // raw sin attributeGroups/attributes: son códigos internos (hidden.*, filter.*)
  // que engordan el jsonb sin aportar nada a la UI.
  const { attributeGroups, attributes, ...pdSlim } = pd;
  return {
    id: String(p.code),
    retailer_product_id: p.id != null ? String(p.id) : null,
    display_name: name,
    brand: (pd.brand?.name || '').trim() || null,
    packaging,
    thumbnail: pd.imageURL || null,
    ean13: p.ean || null,
    unit_price: price,
    price_format: price != null ? `${eurStr(price)} €` : null,
    price_per_unit: ppu?.value ?? null,
    price_per_unit_unit: ppu?.unit ?? null,
    available: pd.availability === '1' && pd.temporaryOutOfStock !== true,
    published: true,
    raw: { ...p, productData: pdSlim },
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

async function main() {
  console.log(`[consum] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} conc=${CONCURRENCY}`);

  const menu = await getJson('/shopping/category/menu');
  const topLevel = Array.isArray(menu) ? menu : Object.values(menu)[0];
  const catRows = [];
  walkTree(topLevel, null, catRows, new Set());
  const n1Names = catRows.filter((c) => c.parent_id === null).map((c) => c.name);
  console.log(`[consum] ${catRows.length} categorías · N1: ${n1Names.join(', ')}`);

  // Primera página → totalCount; el resto en paralelo por offset.
  const first = await getJson(`/catalog/product?offset=0&limit=${PAGE_SIZE}`);
  const total = first.totalCount ?? 0;
  const pages = Math.min(Math.ceil(total / PAGE_SIZE), MAX_PAGES);
  console.log(`[consum] ${total} productos anunciados · ${pages} páginas`);

  const products = new Map(); // code → producto normalizado (con categorías hoja crudas en _leaves)
  const ingest = (list) => {
    for (const p of list || []) {
      if (p?.code == null || p.type === 'recipe') continue;
      const id = String(p.code);
      if (products.has(id)) continue;
      const norm = normalize(p);
      if (!norm.display_name) continue;
      norm._leaves = (p.categories || []).map((c) => String(c.id));
      products.set(id, norm);
    }
  };
  ingest(first.products);

  const offsets = Array.from({ length: pages - 1 }, (_, i) => (i + 1) * PAGE_SIZE);
  let done = 1;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const off = offsets.shift();
      if (off == null) break;
      try { ingest((await getJson(`/catalog/product?offset=${off}&limit=${PAGE_SIZE}`)).products); }
      catch (e) { console.warn(`[consum] página offset=${off} falló: ${e.message}`); }
      if (++done % 20 === 0) console.log(`[consum] ${done}/${pages} páginas · ${products.size} productos`);
      await sleep(120);
    }
  }));

  // category_ids = hojas conocidas + TODOS sus ancestros (como bonÀrea): la app
  // navega N1→N2 y consulta por la N2; con los ancestros incluidos un producto de
  // una hoja level-4 también responde a su N2 y N1. Las hojas fuera del árbol
  // (p.ej. la promo 99999 excluida) se descartan de la membership.
  const catName = new Map(catRows.map((c) => [c.id, c.name]));
  const parentOf = new Map(catRows.map((c) => [c.id, c.parent_id]));
  const ancestorsOf = (id) => {
    const chain = [];
    for (let cur = id; cur; cur = parentOf.get(cur) ?? null) chain.push(cur);
    return chain;
  };
  const catCount = new Map();
  const rows = [];
  for (const det of products.values()) {
    const leaves = det._leaves.filter((id) => catName.has(id));
    delete det._leaves;
    const expanded = new Set();
    for (const leaf of leaves) for (const a of ancestorsOf(leaf)) expanded.add(a);
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
  console.log(`[consum] ${rows.length} productos únicos`);

  if (DRY_RUN) {
    console.log('muestra (5):');
    for (const r of rows.slice(0, 5)) console.log(`  ${r.id}  ${r.display_name}  [${r.brand ?? '—'}]  ${r.price_format}  ${r.price_per_unit != null ? r.price_per_unit + ' €/' + r.price_per_unit_unit : '—'}  ean=${r.ean13 ?? '—'}`);
    if (rows[0]) console.log('category_ids[0] (hojas + ancestros):', rows[0].category_ids.join(', '));
    console.log('nulos →', {
      sin_precio: rows.filter((r) => r.unit_price == null).length,
      sin_ppu: rows.filter((r) => r.price_per_unit == null).length,
      sin_img: rows.filter((r) => !r.thumbnail).length,
      sin_ean: rows.filter((r) => !r.ean13).length,
      sin_categoria: rows.filter((r) => r.category_ids.length === 0).length,
      con_oferta: rows.filter((r) => (r.raw.priceData?.prices ?? []).some((p) => p.id === 'OFFER_PRICE')).length,
    });
    return;
  }
  if (rows.length === 0) throw new Error('0 productos (¿cambió la API?)');

  await upsert('consum_categories', catRows);
  await upsert('consum_products', rows);
  await markStale('consum_products');
  await markStale('consum_categories');
  console.log('[consum] OK');
}

main().catch((e) => { console.error('[consum] ERROR', e); process.exit(1); });
