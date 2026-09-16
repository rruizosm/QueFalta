import type { ComponentProps, ReactNode } from 'react';
import type { Feather } from '@expo/vector-icons';
import type { PanGesture } from 'react-native-gesture-handler';

export type PageContext = {
  topInset: number;
  bottomInset: number;
  horizontalInset: number;
  pagerGesture: PanGesture;
};

export type PagerTab = {
  key: string;
  label: string;
  icon: ComponentProps<typeof Feather>['name'];
  renderPage: (context: PageContext) => ReactNode;
};

export type TabAnimation = ReturnType<typeof import('./useTabAnimation').useTabAnimation>;
