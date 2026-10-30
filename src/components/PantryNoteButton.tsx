import type { ViewInstance } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Anchor = { x: number; y: number; width: number; height: number };

/** Native modal keeps the note above shelves, signs, adjacent products and scrolling content. */
export default function PantryNoteButton({ notes, name, testID, enabled = true }: {
  notes: string;
  name: string;
  testID: string;
  enabled?: boolean;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const buttonRef = useRef<ViewInstance>(null);
  const request = useRef(0);
  const closing = useRef(false);
  const reducedMotion = useReducedMotion();
  const reveal = useSharedValue(0);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const finishClose = useCallback((generation: number) => {
    if (request.current !== generation) return;
    closing.current = false;
    setAnchor(null);
  }, []);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const generation = ++request.current;
    if (reducedMotion) { reveal.set(0); finishClose(generation); return; }
    reveal.set(withTiming(0, { duration: 180, easing: Easing.inOut(Easing.cubic) }, finished => {
      if (finished) runOnJS(finishClose)(generation);
    }));
  };
  useEffect(() => {
    request.current++;
    closing.current = false;
    cancelAnimation(reveal);
    reveal.set(0);
    setAnchor(null);
    // Cancellation generation, not a native view ref: invalidate the latest request on cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { request.current++; cancelAnimation(reveal); };
  }, [enabled, notes, name, width, height, reveal]);
  useEffect(() => {
    if (!anchor || !cardHeight || closing.current) return;
    reveal.set(withTiming(1, { duration: reducedMotion ? 0 : 240, easing: Easing.out(Easing.cubic) }));
  }, [anchor, cardHeight, reducedMotion, reveal]);
  const bubbleAnimation = useAnimatedStyle(() => ({
    opacity: cardHeight > 0 ? reveal.value : 0,
    transform: [{ scale: reducedMotion ? 1 : reveal.value }],
  }));
  if (!enabled || !notes.trim()) return null;
  const leftLimit = insets.left + 12;
  const topLimit = insets.top + 12;
  const bottomLimit = height - insets.bottom - 12;
  const cardWidth = Math.min(320, width - leftLimit - insets.right - 12);
  const tipSize = 14;
  const aboveTip = (anchor?.y ?? topLimit) + (anchor?.height ?? 0) / 2 - 14;
  const belowTip = (anchor?.y ?? topLimit) + (anchor?.height ?? 0) / 2 + 14;
  const aboveSpace = Math.max(0, aboveTip - tipSize - topLimit);
  const belowSpace = Math.max(0, bottomLimit - belowTip - tipSize);
  // Near the top edge, put the bubble below the button so its tip still meets the product.
  const opensBelow = aboveSpace < Math.min(cardHeight || 160, 160) && belowSpace > aboveSpace;
  const maxHeight = Math.min(360, Math.max(aboveSpace, opensBelow ? belowSpace : 0));
  const left = anchor ? Math.max(leftLimit, Math.min(width - insets.right - 12 - cardWidth,
    anchor.x + anchor.width / 2 - cardWidth + 24)) : leftLimit;
  const top = opensBelow ? belowTip + tipSize : Math.max(topLimit, aboveTip - tipSize - cardHeight);
  const tailX = Math.max(24, Math.min(cardWidth - 24, (anchor?.x ?? left) + (anchor?.width ?? 0) / 2 - left));
  const tipY = opensBelow ? -tipSize : cardHeight + tipSize;
  return <>
    <Pressable ref={buttonRef} collapsable={false} testID={testID}
      accessibilityRole="button" accessibilityLabel={t('pantry.readProductNote', { name })}
      accessibilityState={{ expanded: !!anchor }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={(event) => {
        event.stopPropagation();
        const current = ++request.current;
        buttonRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
          if (request.current !== current || measuredWidth <= 0 || measuredHeight <= 0) return;
          closing.current = false;
          cancelAnimation(reveal);
          reveal.set(0);
          setCardHeight(0);
          setAnchor({ x, y, width: measuredWidth, height: measuredHeight });
        });
      }}>
      <View style={styles.face}><Ionicons name="document-text-outline" size={14.4} color={colors.accent} /></View>
    </Pressable>
    {anchor && <Modal transparent visible animationType="none" presentationStyle="overFullScreen"
      statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable testID={`${testID}-backdrop`} style={StyleSheet.absoluteFill} accessible={false} onPress={close} />
        <Animated.View testID={`${testID}-bubble`} style={[styles.bubble,
          { left, top, width: cardWidth, transformOrigin: [tailX, tipY, 0] }, bubbleAnimation]}>
        <View testID={`${testID}-tail`} pointerEvents="none" style={[styles.tail,
          opensBelow ? styles.tailUp : styles.tailDown, { left: tailX - 12, top: opensBelow ? -tipSize + 1 : cardHeight - 1 }]} />
        <View pointerEvents="none" style={[styles.tailInner, opensBelow ? styles.tailInnerUp : styles.tailInnerDown,
          { left: tailX - 11, top: opensBelow ? -tipSize + 3 : cardHeight - 2 }]} />
        <View testID={`${testID}-popup`} accessibilityViewIsModal onAccessibilityEscape={close}
          onLayout={({ nativeEvent }) => setCardHeight(nativeEvent.layout.height)}
          style={[styles.card, { maxHeight }]}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.noteContent}>
            <Text selectable style={styles.note}>{notes}</Text>
          </ScrollView>
        </View>
        </Animated.View>
      </View>
    </Modal>}
  </>;
}

const themedStyles = () => StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  face: { width: 23.76, height: 23.76, borderRadius: 11.88, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  pressed: { opacity: 0.5 },
  overlay: { flex: 1 },
  bubble: { position: 'absolute', shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 12 },
  card: { minHeight: 48, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  tail: { position: 'absolute', width: 0, height: 0, borderLeftWidth: 12, borderRightWidth: 12,
    borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  tailDown: { borderTopWidth: 14, borderTopColor: colors.border },
  tailUp: { borderBottomWidth: 14, borderBottomColor: colors.border },
  tailInner: { position: 'absolute', width: 0, height: 0, borderLeftWidth: 11, borderRightWidth: 11,
    borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  tailInnerDown: { borderTopWidth: 13, borderTopColor: colors.white },
  tailInnerUp: { borderBottomWidth: 13, borderBottomColor: colors.white },
  scroll: { flexShrink: 1 },
  noteContent: { paddingHorizontal: 14, paddingVertical: 12 },
  note: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.ink },
});
