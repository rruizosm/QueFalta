/* Reanimated shared values are mutable UI-runtime handles. Gesture builder callbacks
 * run as worklets, not during React render; React Compiler's rules misclassify them. */
/* eslint-disable react-hooks/immutability */
import { useCallback, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  cancelAnimation, runOnJS, runOnUI, useDerivedValue, useFrameCallback,
  useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { TAB_MOTION as M } from './constants';
import { clamp, fastMotion, releaseTarget } from './physics';

export function useTabAnimation({ width, count, initialIndex, reducedMotion, onSettled, swipeEnabled = true }: {
  width: number;
  count: number;
  initialIndex: number;
  reducedMotion: boolean;
  onSettled: (index: number) => void;
  swipeEnabled?: boolean;
}) {
  const progress = useSharedValue(initialIndex);
  const dragStart = useSharedValue(initialIndex);
  const origin = useSharedValue(initialIndex);
  const dragging = useSharedValue(false);
  const activeHandler = useSharedValue(-1);
  const velocity = useSharedValue(0);
  const lastMotion = useSharedValue(0);
  const blurSigma = useSharedValue(0);
  const stretch = useSharedValue(0);
  const pillLead = useSharedValue(0);
  const layoutWidth = useSharedValue(width);
  const gestureWidth = useSharedValue(width);
  const scrollX = useDerivedValue(() => progress.value * layoutWidth.value);

  const settle = useCallback((index: number, releaseSpeed = 0) => {
    'worklet';
    const target = clamp(index, 0, count - 1);
    dragging.value = false;
    cancelAnimation(progress);
    blurSigma.value = withTiming(0, { duration: M.blurReleaseMs });
    stretch.value = withSpring(0, M.pillSpring);
    const fast = Math.abs(releaseSpeed) > M.blurVelocity && target !== progress.value;
    pillLead.value = !reducedMotion && fast
      ? Math.sign(target - progress.value) * M.maxPillLead : 0;
    pillLead.value = withSpring(0, { ...M.pillSpring, velocity: fast ? Math.sign(releaseSpeed) * 0.8 : 0 });
    velocity.value = 0;

    const complete = () => {
      'worklet';
      // Accessibility and business state change once, after landing. No React work per frame.
      runOnJS(onSettled)(target);
    };
    if (reducedMotion) {
      progress.value = target;
      blurSigma.value = 0;
      stretch.value = 0;
      pillLead.value = 0;
      complete();
    } else {
      progress.value = withSpring(target, {
        ...M.pageSpring,
        velocity: clamp(releaseSpeed / Math.max(1, layoutWidth.value), -8, 8),
      }, (finished) => { if (finished) complete(); });
    }
  }, [count, dragging, progress, blurSigma, stretch, pillLead, reducedMotion, velocity, onSettled, layoutWidth]);

  // No timers/JS callbacks: a held finger must not leave an old high velocity or blur behind.
  useFrameCallback((frame) => {
    if (!dragging.value) return;
    const speed = performance.now() - lastMotion.value > M.staleVelocityMs ? 0 : Math.abs(velocity.value);
    const amount = reducedMotion ? 0 : fastMotion(speed, M.blurVelocity, M.fullBlurVelocity);
    const dt = Math.min(frame.timeSincePreviousFrame ?? 16, 32);
    const targetSigma = amount * M.maxBlurSigma;
    const duration = targetSigma > blurSigma.value ? M.blurAttackMs : M.blurReleaseMs;
    blurSigma.value += (targetSigma - blurSigma.value) * (1 - Math.exp(-dt / (duration / 3)));
    if (amount === 0 && blurSigma.value < 0.02) blurSigma.value = 0;
    stretch.value += (amount * M.maxStretch - stretch.value) * (1 - Math.exp(-dt / 35));
  });

  // Native-stack screens own separate touch surfaces on iOS. Each surface can
  // attach its own recognizer while sharing this single animation state.
  const createPan = useCallback(() => Gesture.Pan()
    .enabled(width > 0 && swipeEnabled)
    .activeOffsetX([-M.horizontalActivation, M.horizontalActivation])
    .failOffsetY([-M.verticalFailure, M.verticalFailure])
    .maxPointers(1)
    .onStart((event) => {
      activeHandler.value = event.handlerTag;
      cancelAnimation(progress);
      cancelAnimation(blurSigma);
      cancelAnimation(stretch);
      cancelAnimation(pillLead);
      pillLead.value = 0;
      velocity.value = 0;
      dragStart.value = progress.value;
      origin.value = clamp(Math.round(progress.value), 0, count - 1);
      gestureWidth.value = layoutWidth.value;
      dragging.value = true;
    })
    .onUpdate((event) => {
      if (!dragging.value || activeHandler.value !== event.handlerTag || gestureWidth.value !== layoutWidth.value) return;
      const next = clamp(dragStart.value - event.translationX / layoutWidth.value, 0, count - 1);
      velocity.value = next === progress.value ? 0 : -event.velocityX;
      lastMotion.value = performance.now();
      progress.value = next;
    })
    .onEnd((event) => {
      if (!dragging.value || activeHandler.value !== event.handlerTag) return;
      const speed = -event.velocityX;
      settle(releaseTarget(progress.value, origin.value, speed, count, M.distanceThreshold, M.releaseVelocity), speed);
    })
    .onFinalize((event) => {
      // A failed recognizer on another native surface must not cancel this drag.
      // Only the recognizer that started it can handle OS cancellation.
      if (dragging.value && activeHandler.value === event.handlerTag) settle(Math.round(progress.value));
    }), [width, swipeEnabled, progress, blurSigma, stretch, pillLead, velocity, dragStart, origin, count, gestureWidth, layoutWidth, dragging, activeHandler, lastMotion, settle]);
  const pan = useMemo(createPan, [createPan]);

  useEffect(() => {
    runOnUI((nextWidth: number) => {
      'worklet';
      layoutWidth.value = nextWidth;
      // Also handles resizing during a gesture or spring without stale pixel offsets.
      settle(Math.round(progress.value));
    })(width);
  }, [width, count, reducedMotion, layoutWidth, progress, settle]);

  const goTo = useCallback((index: number) => {
    if (Number.isInteger(index)) runOnUI(settle)(index);
  }, [settle]);

  useEffect(() => {
    const stop = () => {
      'worklet';
      dragging.value = false;
      cancelAnimation(progress);
      cancelAnimation(blurSigma);
      cancelAnimation(stretch);
      cancelAnimation(pillLead);
      progress.value = Math.round(progress.value);
      blurSigma.value = 0;
      stretch.value = 0;
      pillLead.value = 0;
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') runOnUI(() => {
        'worklet';
        stop();
        runOnJS(onSettled)(progress.value);
      })();
    });
    return () => { subscription.remove(); runOnUI(stop)(); };
  }, [dragging, progress, blurSigma, stretch, pillLead, onSettled]);

  return { progress, scrollX, blurSigma, stretch, pillLead, pan, createPan, goTo };
}
