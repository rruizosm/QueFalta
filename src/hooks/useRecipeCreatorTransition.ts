import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  cancelAnimation, Easing, interpolate, ReduceMotion, runOnJS,
  useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from './useReducedMotion';
import { measureRecipeButton as measure, recipeLocalOrigin, shouldDismissRecipe } from '../lib/recipeCreatorMotion';
import { useRecipeCreatorSource, type RecipeButtonBounds } from '../context/RecipeCreatorContext';

// Physical spring settles in approximately 420 ms, with no visible bounce.
const OPEN_SPRING = { mass: 1, damping: 22, stiffness: 180, overshootClamping: true };
const RETURN_SPRING = { mass: 0.8, damping: 20, stiffness: 200, overshootClamping: true };
const FADE = { duration: 200, reduceMotion: ReduceMotion.Never };

/** Sheet and pill share a UI-thread timeline; never resize/reflow the form per frame. */
export function useRecipeCreatorTransition(
  origin: RecipeButtonBounds | null,
  onClose: () => void,
  dismissDisabled: boolean,
) {
  const window = useWindowDimensions();
  const { sourceRef, sourceHidden } = useRecipeCreatorSource();
  const rootRef = useRef<View>(null);
  const initialized = useRef(false);
  const layoutReady = useRef(false);
  const formReady = useRef(false);
  const presented = useRef(false);
  const openingStarted = useRef(false);
  const presentationFrame = useRef<number | null>(null);
  const mounted = useRef(true);
  const closingRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [closing, setClosing] = useState(false);
  const progress = useSharedValue(0);
  const source = useSharedValue<RecipeButtonBounds | null>(null);
  const target = useSharedValue<RecipeButtonBounds | null>(null);
  const size = useSharedValue({ width: window.width, height: window.height });
  const closingUI = useSharedValue(false);
  const dragging = useSharedValue(false);
  const canDrag = useSharedValue(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelAnimation(progress);
      if (presentationFrame.current !== null) cancelAnimationFrame(presentationFrame.current);
      sourceHidden.set(false);
    };
  }, [progress, sourceHidden]);

  const localSource = useCallback(async (button: RecipeButtonBounds | null) => {
    const root = await measure(rootRef.current);
    return recipeLocalOrigin(button, root);
  }, []);

  const startWhenPresented = useCallback(() => {
    if (!layoutReady.current || !formReady.current || !presented.current || openingStarted.current || closingRef.current) return;
    openingStarted.current = true;
    progress.set(reducedMotion
      ? withTiming(1, FADE, (done) => { if (done) canDrag.set(true); })
      : withSpring(1, OPEN_SPRING, (done) => { if (done) canDrag.set(true); }));
  }, [canDrag, progress, reducedMotion]);

  const onPresented = useCallback(() => {
    presented.current = true;
    startWhenPresented();
  }, [startWhenPresented]);

  const onLayout = async ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    const previousSize = size.get();
    size.set({ width: layout.width, height: layout.height });
    if (initialized.current) {
      // Do not fly to stale coordinates when the window changes mid-animation.
      if (previousSize.width !== layout.width || previousSize.height !== layout.height) source.set(null);
      return;
    }
    initialized.current = true;
    const bounds = await localSource(origin);
    if (!mounted.current || closingRef.current) return;
    source.set(bounds);
    layoutReady.current = true;
    // Mount the form below the viewport first. Its initial native layout must
    // finish before the spring, otherwise that work consumes visible frames.
    setStarted(true);
    // Native-stack can lay out the screen before presenting its native surface.
    // Starting then consumes the spring offscreen and looks like a hard cut.
    startWhenPresented();
    // Some screens versions omit transitionEnd for animation: 'none'. Two
    // committed frames also signal presentation, so that path never hangs.
    presentationFrame.current = requestAnimationFrame(() => {
      presentationFrame.current = requestAnimationFrame(onPresented);
    });
  };

  const close = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    closingUI.set(true);
    setClosing(true);
    Keyboard.dismiss();
    cancelAnimation(progress);
    const bounds = await localSource(await measure(sourceRef.current));
    if (!mounted.current) return;
    source.set(bounds);
    // If the CTA disappeared, the same sheet exits without a ghost destination.
    progress.set(withTiming(0, reducedMotion ? FADE : {
      duration: 340, easing: Easing.bezier(0.4, 0, 0.2, 1),
    }, (done) => {
      if (done) {
        sourceHidden.set(false);
        runOnJS(onClose)();
      }
    }));
  }, [closingUI, localSource, onClose, progress, reducedMotion, source, sourceHidden, sourceRef]);

  // The header owns this gesture: dragging fields, images and the ingredient
  // picker keeps normal scrolling/selection. Taps remain native Pressables.
  const dismissGesture = Gesture.Pan()
    .enabled(!dismissDisabled && !closing)
    .activeOffsetY(12).failOffsetX([-18, 18]).maxPointers(1)
    .onStart(() => {
      if (!canDrag.value || closingUI.value) return;
      dragging.value = true;
      cancelAnimation(progress);
    })
    .onUpdate((event) => {
      if (!dragging.value) return;
      if (!reducedMotion) progress.set(1 - Math.min(0.85, Math.max(0, event.translationY) / size.value.height));
    })
    .onEnd((event) => {
      if (!dragging.value) return;
      dragging.value = false;
      if (shouldDismissRecipe(event.translationY, event.velocityY, size.value.height)) {
        runOnJS(close)();
      } else {
        progress.set(reducedMotion ? 1 : withSpring(1, RETURN_SPRING));
      }
    })
    .onFinalize(() => {
      if (!dragging.value) return;
      dragging.value = false;
      progress.set(reducedMotion ? 1 : withSpring(1, RETURN_SPRING));
    });

  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? progress.value : 1,
    borderRadius: reducedMotion ? 0 : 24 * (1 - progress.value),
    transform: [{ translateY: reducedMotion ? 0 : size.value.height * (1 - progress.value) }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: 0.28 * progress.value }));
  const pillStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const from = source.value;
    const to = target.value;
    if (reducedMotion || !from || !to) return { opacity: 0 };
    return {
      left: from.x, top: from.y, width: from.width, height: from.height,
      borderRadius: from.height / 2,
      opacity: interpolate(p, [0, 0.6, 0.9, 1], [1, 1, 0, 0], 'clamp'),
      transform: [
        { translateX: (to.x + to.width / 2 - from.x - from.width / 2) * p },
        { translateY: (to.y + to.height / 2 - from.y - from.height / 2) * p },
        { scaleX: interpolate(p, [0, 0.1, 1], [1.035, 1.04, to.width / from.width]) },
        { scaleY: interpolate(p, [0, 0.1, 1], [1.035, 1.04, to.height / from.height]) },
      ],
    };
  });
  const pillLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.18, 1], [1, 0, 0], 'clamp'),
  }));
  const publishStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 1 : interpolate(progress.value, [0, 0.6, 0.85, 1], [0, 0, 1, 1], 'clamp'),
    transform: [{ scale: reducedMotion ? 1 : interpolate(progress.value, [0.6, 1], [0.92, 1], 'clamp') }],
  }));

  return { rootRef, onLayout, onPresented, started, closing, close, progress, reducedMotion,
    surfaceStyle, backdropStyle, pillStyle, pillLabelStyle, publishStyle, dismissGesture,
    onPublishLayout: ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      target.set(layout);
      formReady.current = true;
      startWhenPresented();
      sourceHidden.set(!reducedMotion && !!source.get());
    },
  };
}
