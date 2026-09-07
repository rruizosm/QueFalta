export function shouldRevealProductDiscovery(
  nutritionActive: boolean,
  nutritionResolved: boolean,
): boolean {
  return !nutritionActive || nutritionResolved;
}

/** A list snapshot is usable only for the same product and Lidl store. */
export function peekLidlDetail<T extends { id: string; storeId: string }>(
  snapshot: { product: T; fetchedAt: number } | undefined,
  productId: string | undefined,
  storeId: string | null,
  now = Date.now(),
): T | null {
  return snapshot && snapshot.product.id === productId && snapshot.product.storeId === storeId
    && now >= snapshot.fetchedAt && now - snapshot.fetchedAt < 300000 ? snapshot.product : null;
}
