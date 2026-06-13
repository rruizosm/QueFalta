// ─── Interruptores de funciones (monetización + comparador) ──────────────────
// Fuente ÚNICA de los kill-switches de "QuéFalta Plus" (paywall) y del comparador
// de precios. AMBOS están DESACTIVADOS a propósito (decisión de producto: se
// retoman más adelante con nuevas mejoras). Re-activar = volver a poner el flag
// en true; NO se ha borrado nada de código.
//
// - Paywall: mientras PAYWALL_ENABLED sea false la app se comporta como siempre
//   (sin límites ni hoja de venta). Los gates NO comprueban isPremium directo:
//   usan limitsApply(isPremium) para que el flag apague todo de golpe. Su gemelo
//   en servidor es paywall_enabled() (paywall_on.sql); deben estar igual.
// - Comparador: mientras PRICE_COMPARISON_ENABLED sea false, SimilarProductsSection
//   no consulta ni pinta nada en ningún modal de producto.
// Plan completo por fases: MONETIZACION.md · COMPARATIVA.md.

/** Kill-switch global del modelo freemium "QuéFalta Plus". DESACTIVADO: la app
 *  no aplica límites ni muestra paywall. Para relanzarlo: poner true (y alinear
 *  paywall_enabled() en servidor + regalar Plus a testers antes de repartir). */
export const PAYWALL_ENABLED = false;

/** Kill-switch del comparador "Más barato en otros súper". DESACTIVADO: el
 *  comparador no se consulta ni se muestra. Para relanzarlo: poner true. */
export const PRICE_COMPARISON_ENABLED = false;

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
