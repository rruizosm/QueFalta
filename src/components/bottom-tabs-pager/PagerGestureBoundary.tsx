import { useContext, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { PagerGestureContext, PagerMotionContext } from './PagerGestureContext';

/** Attach inside each native screen's touch surface, rather than above its stack. */
export function PagerGestureBoundary({ children }: { children: ReactNode }) {
  const motion = useContext(PagerMotionContext);
  const createPan = motion?.createPan;
  const enabled = motion?.enabled ?? false;
  const pan = useMemo(() => createPan?.().enabled(enabled), [createPan, enabled]);
  if (!pan) return <>{children}</>;
  return <PagerGestureContext.Provider value={enabled ? pan : null}>
    <GestureDetector gesture={pan}>
      <View collapsable={false} style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  </PagerGestureContext.Provider>;
}
