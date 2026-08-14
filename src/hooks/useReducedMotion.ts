import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Sigue la preferencia del sistema "Reducir movimiento". El valor inicial es
 * conservador y se actualiza en cuanto React Native resuelve el ajuste nativo.
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReducedMotion(enabled);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}
