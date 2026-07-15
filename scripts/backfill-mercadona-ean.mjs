#!/usr/bin/env node
// Backfill ÚNICO del EAN de Mercadona → mercadona_products.ean, SIN re-barrer los
// ~48 almacenes del catálogo: lee los productos que aún no tienen ean de la BD y
// pide su detalle (/products/{id}/), donde vive el EAN (los listados no lo traen).
//
// El sync (sync-catalog.mjs) ya trae una pasada de EAN incremental para el día a día;
// esto es solo para poblar de golpe lo existente sin esperar a varios lunes.
//
// RESUMABLE: filtra ean IS NULL, así que relanzarlo continúa donde iba (útil porque
// Mercadona suelta 403/429 bajo carga). El detalle se pide con el source_wh del
// producto (los regionales dan 404 en el almacén por defecto). Upsert parcial con
// display_name+raw (NOT NULL sin default) y SIN unit_price (no dispara el trigger de
// precios) — mismo patrón que la ficha de bonÀrea.
//
// Env: SUPABASE_URL / SUPABASE_SERVICE_ROLE (o se leen de ../.env.local).
//      CONCURRENCY=6   detalles en paralelo
//      LIMIT=N         tope de productos a resolver (debug)
import { readFileSync } from 'node:fs';

function loadEnvLocal() {
  try {
    const out = {};
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
      const t = line.trim(); if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('='); if (i < 1) continue;
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
    }
    return out;
  } catch { return {}; }
}
const env = loadEnvLocal();
const SUPABASE_URL = (process.env.SUPABASE_URL || env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const SERVICE_ROLE = (process.env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE || '').trim();
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
if (!SUPABASE_URL || !SERVICE_ROLE) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE'); process.exit(1); }

const MERCA = 'https://tienda.mercadona.es/api';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mercaHeaders = { Accept: 'application/json', 'Accept-Language': 'es-ES,es;q=0.9', 'User-Agent': 'Mozilla/5.0 (compatible; QueFaltaSync/1.0; +https://quefalta.es)' };

async function merca(path, wh) {
  const url = `${MERCA}${path}?lang=es&wh=${wh}`;
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** attempt + Math.random() * 300);
    const res = await fetch(url, { headers: mercaHeaders });
    if (res.ok) return res.json();
    last = res.status;
    if (res.status !== 403 && res.status !== 429 && res.status < 500) break; // 404: no reintentar
  }
  throw new Error(`Mercadona ${last} en ${path} (wh=${wh})`);
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]); }
  }));
}

// Productos publicados SIN ean (con su source_wh + los NOT NULL para el upsert parcial).
async function fetchPending() {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/mercadona_products?select=id,display_name,source_wh,raw&published=eq.true&ean=is.null`, {
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
    });
    if (!res.ok) throw new Error(`read pending ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function upsert(rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/mercadona_products`, {
      method: 'POST',
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`upsert ${res.status}: ${await res.text()}`);
  }
}

async function main() {
  console.log(`[ean-backfill] inicio ${new Date().toISOString()}`);
  const pending = (await fetchPending()).filter((r) => r.source_wh);
  const todo = pending.slice(0, LIMIT);
  console.log(`[ean-backfill] ${pending.length} sin ean · resuelvo ${todo.length}`);

  const eanRows = [];
  let done = 0, notfound = 0;
  await pool(todo, CONCURRENCY, async (r) => {
    await sleep(20 + Math.random() * 40);
    try {
      const d = await merca(`/products/${r.id}/`, r.source_wh);
      if (d?.ean) eanRows.push({ id: r.id, display_name: r.display_name, raw: r.raw, ean: String(d.ean) });
      else notfound++;
    } catch { notfound++; } // 404/403 persistente: se reintenta al relanzar (sigue con ean null)
    if (++done % 500 === 0) console.log(`[ean-backfill] ${done}/${todo.length} · ${eanRows.length} con ean`);
    // Escritura por lotes cada 1000 resueltos → resumable aunque se corte a media.
    if (eanRows.length >= 1000) { const b = eanRows.splice(0, eanRows.length); await upsert(b); console.log(`[ean-backfill] +${b.length} escritos`); }
  });
  if (eanRows.length) await upsert(eanRows);
  console.log(`[ean-backfill] FIN · ${todo.length} pedidos · ${notfound} sin ean/errores (relanza para reintentarlos)`);
}

main().catch((e) => { console.error('[ean-backfill] ERROR', e); process.exit(1); });
