/** Una fecha futura suspende Palabra de hoy; valores ausentes o inválidos no
 * inventan un bloqueo local. El servidor vuelve a comprobarlo al escribir. */
export function hasActiveWordGameBlock(
  blockedUntil: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!blockedUntil) return false;
  const expiresAt = Date.parse(blockedUntil);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function formatWordGameBlockedUntil(blockedUntil: string, language: 'es' | 'ca'): string {
  return new Intl.DateTimeFormat(language === 'ca' ? 'ca-ES' : 'es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
    timeZoneName: 'short',
  }).format(new Date(blockedUntil));
}
