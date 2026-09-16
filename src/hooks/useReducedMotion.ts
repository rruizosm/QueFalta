import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion as useInitialReducedMotion } from 'react-native-reanimated';

/**
 * Sigue la preferencia del sistema "Reducir movimiento". El valor inicial
 * síncrono evita animar el primer frame antes de resolver el ajuste asíncrono.
 */
export function useReducedMotion(): boolean {
  const initialReducedMotion = useInitialReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);

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
