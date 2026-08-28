const DEFAULT_NOW = () => Date.now();
const DEFAULT_SLEEP = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseRetryAfter(value, nowMs = Date.now()) {
  if (!value) return 0;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);

  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return 0;
  return Math.max(0, dateMs - nowMs);
}

export function createSharedCooldown({
  baseCooldownMs,
  now = DEFAULT_NOW,
  sleep = DEFAULT_SLEEP,
}) {
  let blockedUntil = 0;

  const block = (retryAfter) => {
    const nowMs = now();
    const retryAfterMs = parseRetryAfter(retryAfter, nowMs);
    const cooldownMs = Math.max(baseCooldownMs, retryAfterMs);
    const started = nowMs >= blockedUntil;

    // Varias respuestas ya en vuelo pueden llegar después del primer 403. No deben
    // alargar la misma ventana una vez por worker, salvo que el servidor pida una
    // espera explícita mayor mediante Retry-After.
    if (started) blockedUntil = nowMs + cooldownMs;
    else if (retryAfterMs > 0) blockedUntil = Math.max(blockedUntil, nowMs + retryAfterMs);

    return { blockedUntil, cooldownMs, retryAfterMs, started };
  };

  const wait = async () => {
    while (true) {
      const remainingMs = blockedUntil - now();
      if (remainingMs <= 0) return;
      await sleep(remainingMs);
    }
  };

  return {
    block,
    wait,
    remainingMs: () => Math.max(0, blockedUntil - now()),
  };
}
