// ─── Interruptores de funciones (monetización + comparador) ──────────────────
// Fuente ÚNICA de los kill-switches de "QuéFalta Plus" (paywall) y del comparador
// de precios. El paywall está habilitado localmente para desarrollo y el
// comparador funciona bajo demanda desde las fichas de producto.
//
// - Paywall: mientras PAYWALL_ENABLED sea false la app se comporta como siempre
//   (sin límites ni hoja de venta). Los gates NO comprueban isPremium directo:
//   usan limitsApply(isPremium) para que el flag apague todo de golpe. Su gemelo
//   en servidor es paywall_enabled() (paywall_on.sql); deben estar igual.
// - Comparador: SimilarProductsSection solo consulta cuando el usuario pulsa el
//   botón; abrir una ficha no dispara búsquedas ni coste adicional.
// Plan completo por fases: MONETIZACION.md · COMPARATIVA.md.

/** Kill-switch global del modelo freemium "QuéFalta Plus". ACTIVADO para
 *  desarrollo: la app aplica límites y muestra el paywall. Antes de lanzarlo,
 *  alinear paywall_enabled() en servidor y dar Plus a los testers. */
export const PAYWALL_ENABLED = true;

/** Kill-switch del comparador bajo demanda. ACTIVADO para validación en dispositivo. */
export const PRICE_COMPARISON_ENABLED = true;

/** Cupos incluidos en una cuenta gratuita; el servidor replica estos valores. */
export const FREE_PRICE_ALERT_LIMIT = 1;
export const FREE_COMPARATOR_SEARCH_LIMIT = 3;

/** QuéCocino vuelve a formar parte del árbol de navegación mientras se desarrolla
 *  su contenido real sobre la implementación preliminar existente. */
export const QUE_COCINO_ENABLED = true;

/** Fuente única para autorizar Plus en el cliente. `verified` es solo el reflejo
 * público de este estado para pintar la insignia, nunca un gate de acceso. */
export const hasActivePremium = (
  premiumUntil: string | null | undefined,
  now = Date.now(),
): boolean => {
  if (!premiumUntil) return false;
  const expiresAt = new Date(premiumUntil).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
};

/** true si los límites free aplican a este usuario (gate estándar de Fase 2). */
export const limitsApply = (isPremium: boolean): boolean =>
  PAYWALL_ENABLED && !isPremium;
