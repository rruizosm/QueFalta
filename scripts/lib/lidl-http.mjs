const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retry only idempotent requests. Never use this for a queue claim/schedule.
export async function lidlRequest(url, init = {}, {
  label = 'Lidl', json = true, attempts = 5,
  fetchImpl = fetch, wait = sleep, random = Math.random,
} = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await wait(Math.min(30_000, 1000 * 2 ** (attempt - 1)) + Math.floor(random() * 500));
    try {
      const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(30_000) });
      const body = await response.text();
      if (!response.ok) {
        let code;
        try { code = JSON.parse(body).code; } catch { /* HTML errors have no SQL code. */ }
        lastError = new Error(`${label}: HTTP ${response.status}${code ? ` ${code}` : ''} ${body.slice(0, 600)}`);
        if (response.status !== 429 && response.status < 500 && !['40P01', '40001'].includes(code)) {
          throw Object.assign(lastError, { permanent: true });
        }
        continue;
      }
      if (!json) return null;
      if (response.status === 204) {
        throw Object.assign(new Error(`${label}: HTTP 204 sin contenido; catálogo no disponible en la fuente`), { permanent: true });
      }
      try { return JSON.parse(body); } catch {
        lastError = new Error(`${label}: JSON incompleto o inválido (${body.length} bytes)`);
      }
    } catch (error) {
      if (error.permanent) throw error;
      lastError = new Error(`${label}: ${error.message}`, { cause: error });
    }
  }
  throw lastError;
}

export function sortedLidlRows(rows) {
  const key = (row) => [row.store_id ?? '', row.id ?? row.product_id ?? row.category_id ?? ''].join('\u0000');
  return [...rows].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
}

export function isLidlAccessFailure(message) {
  return /(?:categor|ofertas|\/products).*HTTP (403|429)\b/i.test(message);
}
