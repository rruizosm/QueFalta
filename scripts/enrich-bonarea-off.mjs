#!/usr/bin/env node
// Vincula bonarea_products ↔ OpenFoodFacts por NOMBRE → escribe off_code/off_name.
// bonÀrea NO expone EAN en ningún sitio (ni la API ShoppingBody ni el HTML de la
// ficha — verificado 2026-07-14), así que el vínculo se hace matcheando nombres
// contra el universo bonÀrea de OFF. One-off (no forma parte del sync semanal).
//
// Fases:
//  1. Universo OFF de la marca: GET /api/v2/search?brands_tags=bonarea paginado.
//     Va por v2 A PROPÓSITO: la v3 NO tiene buscador (su doc: "Structured search →
//     Not available"; v2 "deprecated, still supported" es la ÚNICA búsqueda
//     estructurada; Search-a-licious lleva días 502). Las consultas POR EAN de un
//     futuro job (Nutri-Score…) sí deben ir a v3: GET /api/v3/product/{code}.
//     → caché en scripts/logs/off-bonarea-universe.json (OFF_REFRESH=1 re-descarga).
//     Límite de OFF en búsqueda ~10 req/min → throttle 6,5 s/página + backoff en
//     429/5xx (el server suelta 503 intermitentes aunque la petición sea válida).
//  2. Lee bonarea_products (id, display_name, published=true) de Supabase.
//  3. Matching por CONJUNTO de tokens (sin acentos, sin formato "paq. de 6 brics"/
//     tamaños/envases). Con substring ingenuo "semidesnatada" contiene "desnatada"
//     → por tokens son palabras distintas y no se confunden. Niveles:
//       ALTA    igualdad exacta de token-set con UN solo candidato OFF → se escribe
//       REVISAR mejor Jaccard ≥ 0.75, o empate exacto entre varios (dupes de OFF)
//               → solo al informe, NUNCA se escribe
//       SIN     el resto (bonÀrea tiene mucho fresco propio que OFF no cubre)
//     El código OFF es el EAN del producto UNITARIO: en multipacks el vínculo
//     apunta al bric/lata individual (misma ficha nutricional) — por eso va en
//     off_code y NO en ean (ver supabase/migrations/bonarea_off_code.sql).
//  4. Informe SIEMPRE en scripts/logs/off-bonarea-report.csv + resumen en consola.
//     Escritura SOLO con WRITE=1: upsert de {id, off_code, off_name, off_matched_at}
//     (merge-duplicates: no toca el resto de columnas; el sync semanal tampoco toca
//     estas → el vínculo sobrevive a los lunes).
//
// Env: SUPABASE_URL / SUPABASE_SERVICE_ROLE (si faltan, se leen de ../.env.local
//        como hace run-bonarea-sync.ps1 → `node scripts/enrich-bonarea-off.mjs` a pelo)
//      WRITE=1        escribir los ALTA en Supabase (por defecto SOLO informe)
//      OFF_REFRESH=1  re-descargar el universo OFF ignorando la caché
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, 'logs');
const CACHE = join(LOG_DIR, 'off-bonarea-universe.json');
const REPORT = join(LOG_DIR, 'off-bonarea-report.csv');
mkdirSync(LOG_DIR, { recursive: true });

// ── Credenciales: env > .env.local (mismo fichero que usa run-bonarea-sync.ps1) ──
function loadEnvLocal() {
  const p = join(__dirname, '..', '.env.local');
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
  }
  return out;
}
const envFile = loadEnvLocal();
const SUPABASE_URL = process.env.SUPABASE_URL || envFile.SUPABASE_URL || envFile.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || envFile.SUPABASE_SERVICE_ROLE;
const WRITE = process.env.WRITE === '1';
const OFF_REFRESH = process.env.OFF_REFRESH === '1';
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE (env o .env.local)');
  process.exit(1);
}

const OFF_UA = 'QueFalta/1.0 (rruizosma@gmail.com)'; // OFF exige UA identificativo (ASCII: header seguro)
const runStart = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ── Fase 1: universo bonÀrea de OFF (descarga REANUDABLE con caché en disco) ──
// El server de OFF suelta rachas de 503 (sobrecarga/rate-limit encubierto): la
// descarga guarda el progreso cada pocas páginas y, si una página agota los
// reintentos, el script sale con el progreso a salvo → RELANZAR reanuda donde iba.
// El matching solo corre con el universo COMPLETO (un universo a medias daría
// "sin match" falsos y podría dar por único un candidato que no lo es).
const HOSTS = ['https://es.openfoodfacts.org', 'https://world.openfoodfacts.org'];

async function offPage(page, sort = '') {
  const qs = `brands_tags=bonarea&page_size=100&page=${page}`
    + (sort ? `&sort_by=${sort}` : '')
    + `&fields=code,product_name,product_name_es,brands,brands_tags,quantity`;
  for (let t = 0; t < 8; t++) {
    const host = HOSTS[t % HOSTS.length]; // alterna es/world (mismos datos; a veces solo un frontal está caído)
    try {
      const res = await fetch(`${host}/api/v2/search?${qs}`, { headers: { 'User-Agent': OFF_UA } });
      if (res.ok) return await res.json();
      // 4xx = tope de paginación profunda de OFF (~10k docs): fin legítimo, no fallo.
      if (res.status >= 400 && res.status < 500) return { cut: res.status };
      console.warn(`[off] página ${page} (${host.includes('world') ? 'world' : 'es'}): HTTP ${res.status} (intento ${t + 1}/8)`);
    } catch (e) {
      console.warn(`[off] página ${page}: ${String(e).slice(0, 80)} (intento ${t + 1}/8)`);
    }
    await sleep(Math.min(30000 * (t + 1), 90000)); // backoff LARGO: las rachas de 503 duran minutos
  }
  return null; // agotado → el caller guarda progreso y sale (reanudable)
}

// OFF capa la paginación anónima en 1.000 resultados por consulta (HTTP 401 en la
// página 11) y el universo bonÀrea son ~12.200. Truco: cada `sort_by` distinto abre
// SU PROPIA ventana de 1.000 → se descargan varias ventanas y se une por code.
// 'unique_scans_n' es la mejor para nosotros (los más escaneados = envasados con
// EAN real y ficha rica; las bandejas de peso variable de 1 escaneo van al fondo).
const WINDOWS = ['unique_scans_n', 'created_t', 'product_name', ''];

function loadCache() {
  if (!existsSync(CACHE)) return null;
  try {
    const c = JSON.parse(readFileSync(CACHE, 'utf8'));
    if (Array.isArray(c.products) && Array.isArray(c.windows)) return c;
    // Formato de una sola ventana (versión anterior): migrar conservando lo bajado.
    if (Array.isArray(c.products) && c.complete) {
      return { fetched_at: c.fetched_at, count: c.count, products: c.products,
        windows: WINDOWS.map((sort) => ({ sort, next_page: 1, done: sort === '' })) };
    }
    return null;
  } catch { return null; }
}
const saveCache = (c) => writeFileSync(CACHE, JSON.stringify(c));

async function fetchOffUniverse() {
  let cache = OFF_REFRESH ? null : loadCache();
  if (cache && cache.windows.every((w) => w.done)) {
    console.log(`[off] universo desde caché (${cache.products.length} productos únicos, bajado ${cache.fetched_at})`);
    return cache.products;
  }
  if (!cache) cache = { fetched_at: runStart, count: null, products: [],
    windows: WINDOWS.map((sort) => ({ sort, next_page: 1, done: false })) };
  const codes = new Set(cache.products.map((p) => String(p.code)));

  for (const w of cache.windows) {
    if (w.done) continue;
    const label = w.sort || 'default';
    if (w.next_page > 1) console.log(`[off] ventana ${label}: reanudando en página ${w.next_page}`);
    for (;;) {
      const page = w.next_page;
      if (cache.count != null && (page - 1) * 100 >= cache.count) { w.done = true; break; }
      const r = await offPage(page, w.sort);
      if (r === null) {
        saveCache(cache);
        throw new Error(`OFF agotó los reintentos (ventana ${label}, página ${page}); progreso guardado (${cache.products.length} únicos) — RELANZA el script para reanudar`);
      }
      if (r.cut) { console.log(`[off] ventana ${label}: HTTP ${r.cut} en página ${page} (tope anónimo de 1.000) → ventana agotada`); w.done = true; break; }
      if (cache.count == null) console.log(`[off] ${(cache.count = r.count ?? 0)} productos con brands_tags=bonarea; ${WINDOWS.length} ventanas de ≤1.000`);
      const got = r.products || [];
      let nuevos = 0;
      for (const p of got) {
        if (!p.code || codes.has(String(p.code))) continue;
        codes.add(String(p.code));
        cache.products.push(p);
        nuevos++;
      }
      w.next_page = page + 1;
      if (!got.length) { w.done = true; break; } // página vacía = fin real de la ventana
      if (page % 5 === 0) { saveCache(cache); console.log(`[off] ventana ${label}: pág. ${page} · ${cache.products.length} únicos (+${nuevos} en esta pág.)`); }
      await sleep(8000); // 7,5 req/min: margen bajo el límite de 10/min (a 9,2 nos llovían 503)
    }
    saveCache(cache);
  }
  console.log(`[off] universo COMPLETO (las ${WINDOWS.length} ventanas): ${cache.products.length} productos únicos de ${cache.count} anunciados en ${CACHE}`);
  return cache.products;
}

// ── Fase 2: catálogo bonÀrea desde Supabase ──────────────────────────────────
async function fetchBonareaProducts() {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bonarea_products?select=id,display_name&published=eq.true`, {
      headers: {
        apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`,
        Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items',
      },
    });
    if (!res.ok) throw new Error(`read bonarea_products ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

// ── Fase 3: normalización y matching por token-set ───────────────────────────
const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'o', 'u', 'a', 'al', 'en', 'con', 'para', 'por']);
// OJO: 'sin' NO es stopword ("sin lactosa"/"sin gluten" discriminan producto).

function normTokens(name) {
  const s = stripAccents(String(name).toLowerCase())
    // packs: "paq. de 6", "paquete de 4", "pack 2", "lote de 3" (el envase cae después)
    .replace(/\bpaq(?:\.|uete)?\s*(?:de\s*)?\d+\b/g, ' ')
    .replace(/\b(?:pack|lote)\s*(?:de\s*)?\d+\b/g, ' ')
    // multiplicadores: "6x1l", "4 x 125 g"
    .replace(/\b\d+\s*x\s*\d+(?:[.,]\d+)?\s*(?:kg|g|gr|grs|l|ml|cl)?\b/g, ' ')
    // tamaños sueltos: "1 l", "500 g", "1,5 l", "70 cl", "6 uds", "250gr"
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|g|gr|grs|l|litros?|ml|cl|uds?|unidades|u)\b\.?/g, ' ')
    // envases: no discriminan el producto (sí su EAN → por eso off_code y no ean)
    .replace(/\b(?:brics?|briks?|botellas?|garrafas?|latas?|botes?|tarros?|frascos?|bolsas?|bandejas?|envases?|estuches?|paquetes?|granel|aprox)\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ');
  const tokens = new Set();
  for (const w of s.split(/\s+/)) {
    if (!w || STOP.has(w)) continue;
    if (/^\d+$/.test(w)) continue; // números huérfanos ("6" del pack ya sin unidad)
    tokens.add(w);
  }
  return tokens;
}
const tokenKey = (set) => [...set].sort().join('|');
// EAN "de verdad" = EAN-13/EAN-8 con prefijo GS1 de España (84…): bonÀrea envasado
// es 8413585…. Lo demás que trae OFF para la marca son códigos de BANDEJA de peso
// variable (18 dígitos o prefijo interno 2x) o códigos mal tecleados por usuarios
// (se vieron "941…"=Nueva Zelanda, EAN-8 "06…"): esos NUNCA se auto-escriben.
const isRealEan = (c) => /^84\d{11}$/.test(c) || /^84\d{6}$/.test(c);
const jaccard = (a, b) => {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
};

function matchAll(bonarea, off) {
  // Índices del universo OFF: token-set exacto e invertido (token → candidatos).
  const offNorm = [];
  const seenCodes = new Set(); // dedupe por code (una página repetida no debe fabricar "duplicados")
  for (const p of off) {
    const name = (p.product_name_es || p.product_name || '').trim();
    if (!name || !p.code || seenCodes.has(String(p.code))) continue;
    seenCodes.add(String(p.code));
    offNorm.push({ code: String(p.code), name, tokens: normTokens(name) });
  }
  const byKey = new Map(); // token-set exacto → [candidatos] (>1 = dupes en OFF)
  const inverted = new Map(); // token → [candidatos]
  for (const o of offNorm) {
    if (!o.tokens.size) continue;
    const k = tokenKey(o.tokens);
    (byKey.get(k) ?? byKey.set(k, []).get(k)).push(o);
    for (const t of o.tokens) (inverted.get(t) ?? inverted.set(t, []).get(t)).push(o);
  }

  const results = { alta: [], revisar: [], sin: [] };
  for (const b of bonarea) {
    const tokens = normTokens(b.display_name);
    if (!tokens.size) { results.sin.push({ id: b.id, name: b.display_name }); continue; }
    const exact = byKey.get(tokenKey(tokens)) ?? [];
    if (exact.length) {
      // Solo se auto-vincula a un EAN DE VERDAD. En OFF la carne fresca de bonÀrea
      // son escaneos de bandeja: códigos de peso variable (18 dígitos, o EAN-13 con
      // prefijo interno 2x/02x), UNO POR BANDEJA → mismo producto repetido N veces.
      // Si entre los candidatos exactos hay UN único EAN real, ese es el bueno.
      const conEan = exact.filter((x) => isRealEan(x.code));
      if (conEan.length === 1) {
        results.alta.push({ id: b.id, name: b.display_name, code: conEan[0].code, offName: conEan[0].name, score: 1 });
      } else if (conEan.length === 0) {
        results.revisar.push({ id: b.id, name: b.display_name, code: exact.map((x) => x.code).join(' / '), offName: `${exact[0].name} (solo códigos de bandeja/peso variable)`, score: 1 });
      } else {
        results.revisar.push({ id: b.id, name: b.display_name, code: conEan.map((x) => x.code).join(' / '), offName: `${conEan.length} duplicados en OFF con el mismo nombre`, score: 1 });
      }
      continue;
    }
    // Sin igualdad exacta: mejor candidato por Jaccard entre los que comparten algún token.
    const seen = new Set();
    let best = null;
    for (const t of tokens) {
      for (const o of inverted.get(t) ?? []) {
        if (seen.has(o)) continue;
        seen.add(o);
        const j = jaccard(tokens, o.tokens);
        if (!best || j > best.score) best = { id: b.id, name: b.display_name, code: o.code, offName: o.name, score: j };
      }
    }
    if (best && best.score >= 0.75) results.revisar.push(best);
    else results.sin.push({ id: b.id, name: b.display_name });
  }
  return results;
}

// ── Fase 4: informe + escritura opcional ─────────────────────────────────────
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function writeMatches(alta) {
  const payload = alta.map((m) => ({ id: m.id, off_code: m.code, off_name: m.offName, off_matched_at: runStart }));
  for (const c of chunk(payload, 500)) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bonarea_products`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(c),
    });
    if (!res.ok) {
      const msg = await res.text();
      if (msg.includes('off_code')) throw new Error(`upsert falló — ¿ejecutaste supabase/migrations/bonarea_off_code.sql? (${msg.slice(0, 160)})`);
      throw new Error(`upsert ${res.status}: ${msg.slice(0, 200)}`);
    }
  }
}

async function main() {
  console.log(`[enrich] inicio ${runStart}${WRITE ? ' (WRITE=1: escribe los ALTA)' : ' (solo informe; WRITE=1 para escribir)'}`);
  const off = await fetchOffUniverse();
  const conMarca = off.filter((p) => (p.brands_tags || []).some((t) => String(t).includes('bonarea')));
  console.log(`[off] ${conMarca.length}/${off.length} con brands_tags bonarea de verdad (resto = ruido del filtro, se descarta)`);

  const bonarea = await fetchBonareaProducts();
  console.log(`[supabase] ${bonarea.length} productos bonÀrea publicados`);

  const { alta, revisar, sin } = matchAll(bonarea, conMarca);
  const pct = (n) => `${((n / Math.max(1, bonarea.length)) * 100).toFixed(1)}%`;
  console.log(`\n=== RESULTADO ===`);
  console.log(`  ALTA (se escriben con WRITE=1): ${alta.length} (${pct(alta.length)})`);
  console.log(`  REVISAR (solo informe):         ${revisar.length} (${pct(revisar.length)})`);
  console.log(`  SIN MATCH:                      ${sin.length} (${pct(sin.length)})`);

  const lines = ['nivel;id;nombre_bonarea;off_code;nombre_off;jaccard'];
  for (const [nivel, arr] of [['ALTA', alta], ['REVISAR', revisar], ['SIN', sin]]) {
    for (const m of arr) lines.push([nivel, m.id, m.name, m.code, m.offName, m.score?.toFixed(2)].map(csvCell).join(';'));
  }
  writeFileSync(REPORT, '﻿' + lines.join('\n')); // BOM para que Excel abra UTF-8 bien
  console.log(`\n[informe] ${REPORT}`);

  console.log('\nmuestra ALTA (10):');
  for (const m of alta.slice(0, 10)) console.log(`  ${m.id}  "${m.name}"  →  [${m.code}] "${m.offName}"`);
  console.log('\nmuestra REVISAR (10):');
  for (const m of revisar.slice(0, 10)) console.log(`  ${m.id}  "${m.name}"  →  [${m.code}] "${m.offName}" (J=${m.score?.toFixed(2)})`);

  if (WRITE) {
    await writeMatches(alta);
    console.log(`\n[supabase] ${alta.length} vínculos escritos (off_code/off_name/off_matched_at)`);
  } else {
    console.log('\n(no se ha escrito nada: revisa el CSV y relanza con WRITE=1)');
  }
}

main().catch((e) => { console.error('[enrich] ERROR', e); process.exit(1); });
