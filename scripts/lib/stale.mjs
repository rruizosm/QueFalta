// Soft-delete compartido de los syncs: lo que un run ya no ha visto se marca
// published=false (filas con synced_at anterior al inicio del run).
//
// Antes cada script hacía UN solo PATCH de PostgREST sobre toda la tabla
// (`?synced_at=lt.X&published=eq.true`). Ese UPDATE único no tiene cota: si la
// instancia de Supabase anda cargada (los 6 syncs corren el lunes por la mañana
// y se solapan) Postgres lo cancela por statement_timeout → 57014 y el run
// muere en el último paso (visto en bonÀrea, 2026-07-06). Aquí se trocea:
//   1. SELECT de hasta `batch` ids pendientes (mismo filtro).
//   2. PATCH solo de esos ids (`id=in.(…)` + el filtro, por idempotencia).
//   3. Repetir hasta que el SELECT venga vacío.
// Cada sentencia toca ≤ batch filas → no puede agotar el timeout. Cada lote
// deja de casar el filtro (recibe synced_at=runStart) → el bucle termina.
// Además, cada petición reintenta con backoff: un 57014/5xx suelto ya no tira
// el run entero.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRetry(url, init, what, tries = 4) {
  let last;
  for (let t = 0; t < tries; t++) {
    if (t) await sleep(1500 * 2 ** (t - 1));
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      last = new Error(`${what} ${res.status}: ${await res.text()}`);
    } catch (e) { last = e; }
    console.warn(`[markStale] ${String(last.message).split('\n')[0]} (intento ${t + 1}/${tries})`);
  }
  throw last;
}

// Los ids son texto y algunos llevan caracteres especiales ("13*5304" en
// bonÀrea, "VC4AECOMM-367090" en Carrefour) → SIEMPRE entrecomillados para
// `in.()`, escapando \ y " como pide PostgREST.
const quoteId = (id) => `"${String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export async function markStale({ url, key, table, runStart, batch = 200 }) {
  const base = `${url}/rest/v1/${table}`;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const stale = `synced_at=lt.${encodeURIComponent(runStart)}&published=eq.true`;
  let total = 0;
  for (;;) {
    const sel = await fetchRetry(`${base}?select=id&${stale}&limit=${batch}`, { headers }, `select ${table}`);
    const ids = await sel.json();
    if (!ids.length) break;
    await fetchRetry(
      `${base}?id=in.(${encodeURIComponent(ids.map((r) => quoteId(r.id)).join(','))})&${stale}`,
      {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ published: false, synced_at: runStart }),
      },
      `patch ${table}`,
    );
    total += ids.length;
    if (ids.length < batch) break; // era el último lote
  }
  if (total) console.log(`[markStale] ${table}: ${total} filas despublicadas`);
}
