export function shouldRevealProductDiscovery(
  nutritionActive: boolean,
  nutritionResolved: boolean,
): boolean {
  return !nutritionActive || nutritionResolved;
}
