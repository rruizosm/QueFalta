import type { OnboardingStackParamList } from '../types';

export type OnboardingRoute = keyof OnboardingStackParamList;

const ROUTES: readonly OnboardingRoute[] = [
  'Username',
  'Stores',
  'Avatar',
  'Friends',
  'Group',
  // Done necesita el timestamp devuelto por el servidor y solo se alcanza por
  // navegación explícita. Un paso 5 incoherente vuelve al último paso seguro.
  'Group',
];

export function normalizeOnboardingStep(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.trunc(value)));
}

export function onboardingRouteForStep(value: unknown): OnboardingRoute {
  return ROUTES[normalizeOnboardingStep(value)];
}

export function canSubmitUsername(
  state: 'idle' | 'checking' | 'ok' | 'taken' | 'invalid',
  validatedUsername: string | null,
  currentUsername: string,
  hasValidPostalCode: boolean,
): boolean {
  return state === 'ok' && validatedUsername === currentUsername && hasValidPostalCode;
}
