interface FreePriceAlertCandidate {
  id: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function isFreePriceAlertLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { message?: unknown; details?: unknown; hint?: unknown };
  return [value.message, value.details, value.hint]
    .some((part) => typeof part === 'string' && part.includes('free_price_alert_limit_reached'));
}

/** Regla que conserva el hueco gratuito cuando una cuenta tiene varias reglas
 * heredadas de una suscripción caducada. Debe coincidir con free_rule_id() en SQL. */
export function freePriceAlertRule<T extends FreePriceAlertCandidate>(rules: T[]): T | null {
  return [...rules].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    const updated = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    if (updated !== 0) return updated;
    const created = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (created !== 0) return created;
    return left.id.localeCompare(right.id);
  })[0] ?? null;
}
