import { createContext } from 'react';
import type { PanGesture } from 'react-native-gesture-handler';

// null outside the real tab navigator: screens also work in standalone stacks/modals.
export const PagerGestureContext = createContext<PanGesture | null>(null);
export const FloatingPagerContext = createContext(false);
export const PagerMotionContext = createContext<{ createPan: () => PanGesture; enabled: boolean } | null>(null);
