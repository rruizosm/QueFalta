#!/usr/bin/env node
// Nota de salud 0-100 estilo Yuka para Mercadona (función Plus).
// Proceso INCREMENTAL: por cada producto de mercadona_products al que le falte la
// nutrición (o cuya etiqueta cambió, o cuyo intento previo falló), lee la foto de
// la etiqueta trasera con visión (Claude Haiku), calcula el score y lo guarda.
// Sin dependencias npm (igual que el resto de syncs): fetch nativo + HTTP a la
// API de Anthropic (no se usa el SDK para no añadir un npm install al workflow).
//
// De dónde sale cada dato (verificado 2026-06-13):
//   - Tabla nutricional → SOLO en la foto: GET /api/products/{id}/ → photos[1].zoom
//     (la [0] es el frontal). La visión extrae los 7 números por 100g.
//   - Ingredientes + EAN → texto en la misma respuesta (nutrition_information.ingredients
//     en HTML, y campo `ean`). No hace falta la foto para eso.
//   - El score (Nutri-Score + aditivos + bonus eco) lo calcula lib/health-score.mjs.
//
// Incremental (barato en régimen permanente):
//   Se procesan los productos publicados donde nutrition_status IS NULL (nunca leído)
//   OR nutrition_status='failed' (reintento) OR el imageId de photos[1] cambió
//   (reformulación). La 1ª pasada es el backfill (~miles); luego solo nuevos.
//   nutrition_status: 'ok' | 'no_label' (sin 2ª foto / no alimentación) | 'failed'.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE, ANTHROPIC_API_KEY
//      MERCADONA_WH=mad1     almacén para el GET de detalle
//      MODEL=claude-haiku-4-5    modelo de visión
//      CONCURRENCY=4         productos en paralelo
//      MAX_PRODUCTS=N        limita (pruebas / primer backfill por tandas)
//      DRY_RUN=1             no escribe en Supabase; imprime el resultado
import { healthScore } from './lib/health-score.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const WH = process.env.MERCADONA_WH || 'mad1';
const MODEL = process.env.MODEL || 'claude-haiku-4-5';
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);
const MAX_PRODUCTS = process.env.MAX_PRODUCTS ? Number(process.env.MAX_PRODUCTS) : Infinity;
const DRY_RUN = process.env.DRY_RUN === '1';

if (!SUPABASE_URL || !SERVICE_ROLE) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('Falta ANTHROPIC_API_KEY (clave de la API de Anthropic)'); process.exit(1); }

const MERCA = 'https://tienda.mercadona.es/api';
const runStart = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (compatible; QueFaltaSync/1.0; +https://quefalta.es)';

// ── Mercadona detalle ────────────────────────────────────────────────────────
async function mercaDetail(id, { tries = 3 } = {}) {
  const url = `${MERCA}/products/${id}/?lang=es&wh=${WH}`;
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.json();
      if (res.status === 404 || res.status === 410) return null; // descatalogado
    } catch { /* reintenta */ }
    await sleep(600 * (t + 1));
  }
  throw new Error(`detalle ${id} falló`);
}

// La API devuelve ingredientes/alérgenos como HTML → texto plano.
const cleanHtml = (t) => !t ? null : t
  .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&deg;/g, '°')
  .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
  .replace(/\s+/g, ' ').trim() || null;

// Reduce la foto a ~1100px vía imgix (el zoom es 3600²): legible y barato en tokens.
const labelUrl = (zoom) => zoom ? zoom.replace(/([?&])(h|w)=\d+/g, '$1$2=1100') : null;

// ── Visión: extraer la tabla por 100g (JSON estructurado) ────────────────────
const NUTRI_SCHEMA = {
  type: 'object',
  properties: {
    has_table: { type: 'boolean', description: 'true si la imagen muestra una tabla de información nutricional' },
    kcal: { type: ['number', 'null'] }, kj: { type: ['number', 'null'] },
    grasas: { type: ['number', 'null'] }, saturadas: { type: ['number', 'null'] },
    hidratos: { type: ['number', 'null'] }, azucares: { type: ['number', 'null'] },
    fibra: { type: ['number', 'null'] }, proteinas: { type: ['number', 'null'] }, sal: { type: ['number', 'null'] },
  },
  required: ['has_table', 'kcal', 'kj', 'grasas', 'saturadas', 'hidratos', 'azucares', 'fibra', 'proteinas', 'sal'],
  additionalProperties: false,
};
const VISION_PROMPT =
  'Extrae la información nutricional POR 100 g (o por 100 ml) de la etiqueta de la imagen. ' +
  'Devuelve solo números (usa punto decimal); null si un valor no aparece. ' +
  'kj = energía en kilojulios, kcal = en kilocalorías. fibra suele faltar → null. ' +
  'Si la imagen NO contiene una tabla nutricional, has_table=false y todo null.';

async function extractTable(imageUrl, { tries = 3 } = {}) {
  const body = {
    model: MODEL,
    max_tokens: 400,
    output_config: { format: { type: 'json_schema', schema: NUTRI_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url: imageUrl } },
        { type: 'text', text: VISION_PROMPT },
      ],
    }],
  };
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (t + 1)); continue; }
      const data = await res.json();
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
      const text = (data.content || []).find((b) => b.type === 'text')?.text;
      if (!text) return null;
      return JSON.parse(text);
    } catch (e) {
      if (t === tries - 1) throw e;
      await sleep(1500 * (t + 1));
    }
  }
  return null;
}

// ── Supabase REST ────────────────────────────────────────────────────────────
const sbHeaders = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' };

// Productos a procesar: sin estado, fallidos, o con la foto cambiada. Para el
// chequeo del imageId pedimos raw->photos; lo comparamos tras el detalle.
async function fetchPending() {
  const cols = 'id,nutrition_status,nutrition_image_id';
  const q = `${SUPABASE_URL}/rest/v1/mercadona_products` +
    `?select=${cols}&published=eq.true` +
    `&or=(nutrition_status.is.null,nutrition_status.eq.failed)` +
    `&order=id&limit=${Number.isFinite(MAX_PRODUCTS) ? MAX_PRODUCTS : 100000}`;
  const res = await fetch(q, { headers: sbHeaders });
  if (!res.ok) throw new Error(`fetchPending ${res.status}: ${await res.text()}`);
  return res.json();
}

async function patch(id, row) {
  if (DRY_RUN) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/mercadona_products?id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  if (!res.ok) throw new Error(`patch ${id} ${res.status}: ${await res.text()}`);
}

// ── Procesar un producto ─────────────────────────────────────────────────────
async function processOne(p, stats) {
  const detail = await mercaDetail(p.id);
  if (!detail) { await patch(p.id, { nutrition_status: 'no_label', nutrition_synced_at: runStart }); stats.no_label++; return; }

  const photos = detail.photos || [];
  const back = photos[1]; // la 2ª foto es la etiqueta trasera
  const ean = detail.ean || null;
  const ingredients = cleanHtml(detail.nutrition_information?.ingredients);
  const base = { ean13: ean, ingredients, nutrition_synced_at: runStart };

  if (!back?.zoom) { // no alimentación / sin etiqueta trasera
    await patch(p.id, { ...base, nutrition_status: 'no_label' }); stats.no_label++; return;
  }
  const imageId = back.zoom; // sirve de huella para detectar reformulaciones

  const table = await extractTable(labelUrl(back.zoom));
  if (!table || table.has_table === false) {
    await patch(p.id, { ...base, nutrition_image_id: imageId, nutrition_status: 'no_label' }); stats.no_label++; return;
  }
  const nutrition = {
    kcal: table.kcal, kj: table.kj, grasas: table.grasas, saturadas: table.saturadas,
    hidratos: table.hidratos, azucares: table.azucares, fibra: table.fibra,
    proteinas: table.proteinas, sal: table.sal,
  };
  const health = healthScore({ nutrition, ingredients: ingredients || '', displayName: detail.display_name || '' });

  if (!health) { // tabla incompleta (faltan núcleo) → guarda valores, sin score
    await patch(p.id, { ...base, nutrition, nutrition_image_id: imageId, nutrition_status: 'ok' }); stats.partial++; return;
  }
  await patch(p.id, {
    ...base, nutrition, nutrition_image_id: imageId, nutrition_status: 'ok',
    health_score: health.score, health_grade: health.grade,
    health: { tier: health.tier, nutriScore: health.nutriScore, estimated: health.estimated, components: health.components, additives: health.additives, breakdown: health.breakdown },
  });
  stats.scored++;
  if (DRY_RUN && stats.scored <= 8) console.log(`  ${p.id} ${detail.display_name} → ${health.score} (${health.tier}, NS ${health.grade})${health.estimated ? ' [est]' : ''}`);
}

async function main() {
  console.log(`[health] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} model=${MODEL} conc=${CONCURRENCY}`);
  const pending = await fetchPending();
  // nutrition_image_id distinto se detecta dentro (necesita el detalle); aquí solo
  // procesamos los que faltan/fallaron. Para forzar refresco de reformulaciones,
  // un PATCH externo a nutrition_status=null los re-encola.
  const todo = pending.slice(0, MAX_PRODUCTS);
  console.log(`[health] ${todo.length} productos a procesar`);

  const stats = { scored: 0, partial: 0, no_label: 0, failed: 0 };
  const queue = [...todo];
  let done = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const p = queue.shift();
      if (!p) break;
      try { await processOne(p, stats); }
      catch (e) {
        stats.failed++;
        try { await patch(p.id, { nutrition_status: 'failed', nutrition_synced_at: runStart }); } catch {}
        console.warn(`[health] ${p.id} falló: ${e.message}`);
      }
      if (++done % 50 === 0) console.log(`[health] ${done}/${todo.length} · ${stats.scored} con nota · ${stats.no_label} sin etiqueta · ${stats.failed} err`);
      await sleep(60);
    }
  }));

  console.log(`[health] FIN · con nota: ${stats.scored} · parciales: ${stats.partial} · sin etiqueta: ${stats.no_label} · fallidos: ${stats.failed}`);
}

main().catch((e) => { console.error('[health] ERROR', e); process.exit(1); });
