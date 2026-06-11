// ─── Monetización "QuéFalta Plus" (modelo freemium) ──────────────────────────
// Fuente ÚNICA del interruptor del paywall y de los límites del plan gratuito.
// Mientras PAYWALL_ENABLED sea false la app se comporta como siempre (sin
// límites). Los gates (Fase 2) NO comprueban isPremium directamente: usan
// limitsApply(isPremium) para que el flag apague todo de golpe.
// Plan completo por fases: MONETIZACION.md.

/** Interruptor global del modelo freemium — ENCENDIDO (Fase 4: se lanza con el
 *  modelo puesto desde el día 1). Su gemelo en servidor es paywall_enabled()
 *  (paywall_on.sql); deben estar igual. ⚠️ Antes de repartir un build a testers,
 *  regalarles Plus (supabase/ops/grant_plus_testers.sql) para no limitarles. */
export const PAYWALL_ENABLED = true;

/** Límites del plan gratuito (premium = sin límites). */
export const FREE_LIMITS = {
  /** Grupos que un usuario free puede CREAR. Unirse a grupos es ilimitado
   *  SIEMPRE: el enlace de invitación es el mecanismo viral, no se toca. */
  maxCreatedGroups: 1,
  /** Compras del historial (las N más recientes) que un free puede repetir. */
  maxRepeatableHistory: 3,
} as const;

/** true si los límites free aplican a este usuario (gate estándar de Fase 2). */
export const limitsApply = (isPremium: boolean): boolean =>
  PAYWALL_ENABLED && !isPremium;
