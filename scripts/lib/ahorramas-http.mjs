const DEFAULT_SLEEP = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const compactResponse = (value = '') => value.replace(/\s+/g, ' ').trim().slice(0, 180);

export function parseRetryAfter(value, nowMs = Date.now()) {
  if (!value) return 0;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);

  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return 0;
  return Math.max(0, dateMs - nowMs);
}

export function ahorramasRetryDelay({
  attempt,
  retryAfter,
  baseDelayMs,
  maxDelayMs,
  nowMs = Date.now(),
  random = Math.random,
  jitterRatio = 0.15,
}) {
  const exponentialMs = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
  const jitterMs = Math.floor(exponentialMs * jitterRatio * random());
  const retryAfterMs = parseRetryAfter(retryAfter, nowMs);
  return Math.min(maxDelayMs, Math.max(retryAfterMs, exponentialMs + jitterMs));
}

export function createAhorramasRequester({
  baseUrl,
  fetchImpl = fetch,
  sleep = DEFAULT_SLEEP,
  now = Date.now,
  random = Math.random,
  logger = console,
  requestDelayMs = 3_000,
  maxAttempts = 6,
  baseRetryDelayMs = 60_000,
  maxRetryDelayMs = 300_000,
  timeoutMs = 60_000,
} = {}) {
  if (!baseUrl) throw new Error('baseUrl es obligatorio');

  const cookies = new Map();
  let nextRequestAt = 0;

  const waitForRequestSlot = async () => {
    const remainingMs = nextRequestAt - now();
    if (remainingMs > 0) await sleep(remainingMs);
    nextRequestAt = now() + requestDelayMs;
  };

  const absorbCookies = (response) => {
    for (const header of response.headers?.getSetCookie?.() ?? []) {
      const [pair] = header.split(';');
      const separator = pair.indexOf('=');
      if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  };

  return async function request(path) {
    const target = path.startsWith('http') ? path : `${baseUrl}${path}`;
    let lastError;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await waitForRequestSlot();

      let response;
      try {
        response = await fetchImpl(target, {
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': 'QueFalta catalog sync/1.0 (+https://quefalta.es)',
            ...(cookies.size
              ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') }
              : {}),
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts - 1) break;

        const delayMs = ahorramasRetryDelay({
          attempt,
          retryAfter: null,
          baseDelayMs: baseRetryDelayMs,
          maxDelayMs: maxRetryDelayMs,
          nowMs: now(),
          random,
        });
        logger.warn(
          `[ahorramas] ${error?.name ?? 'Error'} en ${target}; `
            + `reintento ${attempt + 2}/${maxAttempts} en ${Math.ceil(delayMs / 1000)} s`,
        );
        await sleep(delayMs);
        continue;
      }

      absorbCookies(response);
      if (response.ok) return response.text();

      const retryAfter = response.headers?.get?.('retry-after');
      const sample = compactResponse(await response.text());
      const details = `HTTP ${response.status} ${target}`
        + (retryAfter ? ` · Retry-After=${retryAfter}` : '')
        + (sample ? ` · ${sample}` : '');
      lastError = new Error(details);
      const retryable = response.status === 408
        || response.status === 425
        || response.status === 429
        || response.status >= 500;

      if (!retryable || attempt === maxAttempts - 1) break;

      const delayMs = ahorramasRetryDelay({
        attempt,
        retryAfter,
        baseDelayMs: baseRetryDelayMs,
        maxDelayMs: maxRetryDelayMs,
        nowMs: now(),
        random,
      });
      logger.warn(
        `[ahorramas] HTTP ${response.status} en ${target}; `
          + `reintento ${attempt + 2}/${maxAttempts} en ${Math.ceil(delayMs / 1000)} s`,
      );
      await sleep(delayMs);
    }

    throw lastError ?? new Error(`Sin respuesta de ${target}`);
  };
}
