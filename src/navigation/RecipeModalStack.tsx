import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { SlideOutRight, useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { createNavigatorFactory, StackRouter, useNavigationBuilder } from '@react-navigation/native';
import type { NativeStackNavigatorProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AppStackParamList } from './recipeCreator';
import { useReducedMotion } from '../hooks/useReducedMotion';

// A native ScreenStack inside RN Modal loses its touch surface on iOS.
// Keep navigation state in StackRouter, but render ordinary views in the modal.
function RecipeModalStack(props: NativeStackNavigatorProps) {
  const { state, descriptors, describe, NavigationContent } = useNavigationBuilder(StackRouter, props);
  const reducedMotion = useReducedMotion();
  const routes = [...state.routes, ...state.preloadedRoutes.filter(
    (route) => !state.routes.some((active) => active.key === route.key),
  )];
  return <NavigationContent><View style={{ flex: 1 }}>
    {routes.map((route) => (
      <RecipeLayer key={route.key} editor={route.name === 'EditRecipe'}
        active={state.routes[state.index].key === route.key} reducedMotion={reducedMotion}>
        {(descriptors[route.key] ?? describe(route, true)).render()}
      </RecipeLayer>
    ))}
  </View></NavigationContent>;
}

function RecipeLayer({ active, editor, reducedMotion, children }: {
  active: boolean; editor: boolean; reducedMotion: boolean; children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const wasPresented = useRef(false);
  const progress = useSharedValue(editor ? 0 : 1);
  useEffect(() => {
    if (active) wasPresented.current = true;
    if (editor && active) progress.set(withTiming(1, {
      duration: reducedMotion ? 0 : 260, easing: Easing.out(Easing.cubic),
    }));
  }, [active, editor, progress, reducedMotion]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: width * (1 - progress.value) }] }));
  return <Animated.View pointerEvents={active ? 'auto' : 'none'}
    accessibilityElementsHidden={!active}
    importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    exiting={editor && (active || wasPresented.current) && !reducedMotion ? SlideOutRight.duration(260) : undefined}
    style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

export const createRecipeModalStack = createNavigatorFactory(RecipeModalStack) as typeof createNativeStackNavigator<AppStackParamList>;
