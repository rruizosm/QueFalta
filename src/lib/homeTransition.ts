let pendingOnboardingTransition = false;

/** Solicita que el primer montaje de Inicio quede cubierto hasta estabilizarse. */
export function requestHomeTransition(): void {
  pendingOnboardingTransition = true;
}

/** Consume la solicitud una sola vez; los arranques normales no muestran cover. */
export function consumeHomeTransition(): boolean {
  const pending = pendingOnboardingTransition;
  pendingOnboardingTransition = false;
  return pending;
}
