#!/usr/bin/env node
// Sincroniza el catálogo de Mercadona → Supabase (catálogo + búsqueda).
// Pensado para correr 1×/día (GitHub Action). Sin dependencias: fetch global de Node 18+.
//
// Variables de entorno necesarias:
//   SUPABASE_URL            p.ej. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE   service_role key (¡secreta! nunca en la app)
//   MERCADONA_WH            opcional, almacén/postal (por defecto "mad1" = Madrid)
//
// Probar en local:  SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node scripts/sync-catalog.mjs

import { canonicalPricePerUnit } from './lib/price.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const WH = process.env.MERCADONA_WH || 'mad1';

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

const MERCA = 'https://tienda.mercadona.es/api';
const runStart = new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mercaHeaders = (lang) => ({
  Accept: 'application/json',
  'Accept-Language': lang === 'ca' ? 'ca-ES,ca;q=0.9,es;q=0.8' : 'es-ES,es;q=0.9',
  'User-Agent': 'Mozilla/5.0 (compatible; QueFaltaSync/1.0; +https://quefalta.es)',
});

async function merca(path, lang = 'es') {
  const url = `${MERCA}${path}${path.includes('?') ? '&' : '?'}lang=${lang}&wh=${WH}`;
  const res = await fetch(url, { headers: mercaHeaders(lang) });
  if (!res.ok) throw new Error(`Mercadona ${res.status} en ${path}`);
  return res.json();
}

// upsert vía REST de Supabase (merge-duplicates = ON CONFLICT DO UPDATE por PK).
async function upsert(table, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`upsert ${table} ${res.status}: ${await res.text()}`);
  }
}

// Lo que no apareció en esta pasada se marca como no publicado (soft-delete).
async function markStale(table) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?synced_at=lt.${encodeURIComponent(runStart)}&published=eq.true`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ published: false, synced_at: runStart }),
    },
  );
  if (!res.ok) throw new Error(`markStale ${table} ${res.status}: ${await res.text()}`);
}

async function main() {
  console.log(`[sync] inicio ${runStart} (wh=${WH})`);

  // 1) Categorías → tabla de categorías + lista de N2 que hay que recorrer.
  const cats = (await merca('/categories/')).results;
  const catRows = [];
  const n2 = [];
  for (const n1 of cats) {
    catRows.push({ id: n1.id, name: n1.name, parent_id: null, sort_order: n1.order, published: true, synced_at: runStart });
    for (const sub of n1.categories ?? []) {
      catRows.push({ id: sub.id, name: sub.name, parent_id: n1.id, sort_order: sub.order, published: sub.published ?? true, synced_at: runStart });
      n2.push({ id: sub.id, name: sub.name });
    }
  }
  console.log(`[sync] ${cats.length} categorías N1, ${n2.length} subcategorías N2`);

  // 2) Recorrer cada N2 y juntar productos (dedupe por id).
  const products = new Map();
  let done = 0;
  for (const sub of n2) {
    try {
      const detail = await merca(`/categories/${sub.id}/`);
      for (const group of detail.categories ?? []) {
        for (const p of group.products ?? []) {
          if (!p.published) continue;
          const pi = p.price_instructions ?? {};
          // €/unidad canónico: Mercadona da reference_price (€/medida) + reference_format.
          const ppu = canonicalPricePerUnit(pi.reference_price, pi.reference_format);
          products.set(p.id, {
            id: String(p.id),
            display_name: p.display_name,
            slug: p.slug ?? null,
            packaging: p.packaging ?? null,
            thumbnail: p.thumbnail ?? null,
            category_id: sub.id,
            category_name: sub.name,
            unit_price: pi.unit_price != null ? Number(pi.unit_price) : null,
            price_per_unit: ppu?.value ?? null,
            price_per_unit_unit: ppu?.unit ?? null,
            published: true,
            raw: p,
            synced_at: runStart,
          });
        }
      }
    } catch (e) {
      console.warn(`[sync] subcategoría ${sub.id} falló: ${e.message}`);
    }
    if (++done % 20 === 0) console.log(`[sync] ${done}/${n2.length} subcategorías`);
    await sleep(120); // educado con la API
  }

  // 2b) Segunda pasada en CATALÁN (bilingüe, Fase 2): mismos N2 con lang=ca,
  // capturamos solo el nombre por id → columna display_name_ca. Solo Mercadona
  // ofrece catalán por API; mismos ids/precios, solo cambia el texto.
  const caNames = new Map();
  let doneCa = 0;
  for (const sub of n2) {
    try {
      const detail = await merca(`/categories/${sub.id}/`, 'ca');
      for (const group of detail.categories ?? []) {
        for (const p of group.products ?? []) {
          if (p.display_name) caNames.set(String(p.id), p.display_name);
        }
      }
    } catch (e) {
      console.warn(`[sync] subcategoría ${sub.id} (ca) falló: ${e.message}`);
    }
    if (++doneCa % 20 === 0) console.log(`[sync] ca ${doneCa}/${n2.length} subcategorías`);
    await sleep(120); // educado con la API
  }
  console.log(`[sync] ${caNames.size} nombres en català`);
  for (const row of products.values()) {
    row.display_name_ca = caNames.get(row.id) ?? null;
  }

  const rows = [...products.values()];
  console.log(`[sync] ${rows.length} productos únicos`);

  if (rows.length === 0) throw new Error('0 productos: la API no devolvió nada (¿IP bloqueada / wh inválido?)');

  // 3) Volcar a Supabase y marcar lo que ya no existe.
  await upsert('mercadona_categories', catRows);
  await upsert('mercadona_products', rows);
  await markStale('mercadona_products');
  await markStale('mercadona_categories');

  console.log('[sync] OK');
}

main().catch((e) => {
  console.error('[sync] ERROR', e);
  process.exit(1);
});
