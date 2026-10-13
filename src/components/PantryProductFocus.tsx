import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { fonts } from '../constants/typography';
import { colors } from '../constants/colors';
import { STORE_META } from '../constants/stores';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { PantryProduct, PantrySection } from '../lib/pantryLayout';

type Rect = { x: number; y: number; width: number; height: number };
type Props = {
  product: PantryProduct;
  location: string;
  section?: PantrySection;
  onFinish: () => void;
  onAddToCart: () => Promise<void>;
  onShowDetails: () => void;
  sourceRef?: RefObject<View | null>;
  onReady: () => void;
  onClose: () => void;
};

/** A visual zoom only: the shelf layout and saved product size never change. */
export default function PantryProductFocus({ product, location, section = 'pantry', onFinish, onAddToCart, onShowDetails, sourceRef, onReady, onClose }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const [presented, setPresented] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [started, setStarted] = useState(false);
  const [origin, setOrigin] = useState<Rect | null>(null);
  const rootRef = useRef<View>(null);
  const mounted = useRef(true);
  const closing = useRef(false);
  const opening = useRef(false);
  const progress = useSharedValue(0);
  const addingRef = useRef(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const addToCart = async () => {
    if (addingRef.current || added || closing.current) return;
    addingRef.current = true;
    setAdding(true);
    setActionError(null);
    try {
      await onAddToCart();
      if (mounted.current) setAdded(true);
    } catch (error) {
      if (mounted.current) setActionError(error instanceof Error ? error.message : t('product.addErrorSingle'));
    } finally {
      addingRef.current = false;
      if (mounted.current) setAdding(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelAnimation(progress); };
  }, [progress]);

  const measureSource = useCallback((done: (rect: Rect | null) => void) => {
    const root = rootRef.current;
    const source = sourceRef?.current;
    if (!root || !source) { done(null); return; }
    root.measureInWindow((rootX, rootY) => {
      if (!mounted.current) return;
      source.measureInWindow((x, y, width, height) => {
        if (!mounted.current) return;
        done(width > 0 && height > 0 ? { x: x - rootX, y: y - rootY, width, height } : null);
      });
    });
  }, [sourceRef]);

  useEffect(() => {
    // Wait for the cached image before hiding the original to avoid an empty frame.
    if (!presented || !imageReady || opening.current || closing.current) return;
    opening.current = true;
    measureSource((rect) => {
      if (closing.current) return;
      setOrigin(rect);
      setStarted(true);
      onReady();
    });
  }, [presented, imageReady, measureSource, onReady]);

  useEffect(() => {
    if (!started || closing.current) return;
    progress.set(withTiming(1, {
      duration: reducedMotion ? 180 : 460,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      reduceMotion: ReduceMotion.Never,
    }));
  }, [started, progress, reducedMotion]);

  const close = (finished = false) => {
    if (closing.current) return;
    if (finished && addingRef.current) return;
    closing.current = true;
    const complete = finished ? onFinish : onClose;
    if (!started) { complete(); return; }
    // Remeasure after a rotation so the return still lands on the real product.
    measureSource((rect) => {
      setOrigin(finished ? null : rect);
      progress.set(withTiming(0, {
        duration: reducedMotion ? 160 : 340,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        reduceMotion: ReduceMotion.Never,
      }, (finished) => { if (finished) scheduleOnRN(complete); }));
    });
  };

  const panelWidth = Math.min(600, size.width - 24);
  const panelBottom = insets.bottom + 12;
  const top = insets.top + 56;
  const availableHeight = Math.max(1, size.height - top - panelBottom);
  const panelHeight = Math.min(440, availableHeight * 0.65);
  const panelTop = size.height - panelBottom - panelHeight;
  const imageSide = Math.max(1, Math.min(260, size.width - 64, panelTop - top - 20));
  const targetX = (size.width - imageSide) / 2;
  const targetY = top + (panelTop - top - imageSide) / 2;
  const fade = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panel = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reducedMotion ? 0 : (panelHeight + panelBottom) * (1 - progress.value) }],
  }));
  const zoom = useAnimatedStyle(() => {
    const p = progress.value;
    if (reducedMotion || !origin) return { opacity: started ? p : 0 };
    return {
      opacity: started ? 1 : 0,
      transform: [
        { translateX: (origin.x + origin.width / 2 - targetX - imageSide / 2) * (1 - p) },
        { translateY: (origin.y + origin.height / 2 - targetY - imageSide / 2) * (1 - p) },
        { scale: origin.width / imageSide + (1 - origin.width / imageSide) * p },
      ],
    };
  });

  return <Modal visible transparent animationType="none" presentationStyle="overFullScreen"
    statusBarTranslucent navigationBarTranslucent onShow={() => setPresented(true)} onRequestClose={() => close()}>
    <View ref={rootRef} collapsable={false} style={styles.root} accessibilityViewIsModal
      onAccessibilityEscape={() => close()} onLayout={({ nativeEvent: { layout } }) => setSize(layout)}>
      <Animated.View pointerEvents="none" style={[styles.backdrop, fade]} />
      <Pressable testID="pantry-focus-dismiss" style={StyleSheet.absoluteFill} onPress={() => close()} accessible={false} />
      <Animated.View testID="pantry-focus-panel" style={[styles.panel,
        { width: panelWidth, left: (size.width - panelWidth) / 2, top: panelTop, bottom: panelBottom }, panel]}>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.detailsScroll} contentContainerStyle={styles.details}>
          <View style={styles.storeRow}>
            <Text style={styles.storeName}>{STORE_META.mercadona.name}</Text>
            <Image source={STORE_META.mercadona.icon} style={styles.storeLogo} contentFit="contain" accessible={false} />
          </View>
          <View style={styles.nameRow}>
            <Text accessibilityRole="header" style={styles.name}>{product.name}</Text>
            <Pressable testID="pantry-focus-details" accessibilityRole="button"
              accessibilityLabel={t('pantry.productDetails')} accessibilityHint={t('pantry.productDetailsHint')}
              onPress={onShowDetails} hitSlop={6}
              style={({ pressed }) => [styles.detailsButton, pressed && styles.pressed]}>
              <Ionicons name="information-circle-outline" size={25} color={colors.accent} />
            </Pressable>
          </View>
          <View style={[styles.infoRow, window.fontScale > 1.4 && styles.infoColumn]}>
            <View style={styles.infoBlock}>
              <Text style={styles.label}>{t('pantry.quantity')}</Text>
              <Text style={styles.value}>{t('pantry.oneUnit')}</Text>
            </View>
            <View style={styles.infoBlock}>
              <Text style={styles.label}>{t('pantry.location')}</Text>
              <Text style={styles.value}>{location}</Text>
            </View>
          </View>
          <View style={styles.notesBlock}>
            <Text style={styles.label}>{t('pantry.notes')}</Text>
            <Text style={styles.note}>{t('pantry.noNotes')}</Text>
          </View>
          {actionError && <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
            testID="pantry-focus-error" style={styles.error}>{actionError}</Text>}
        </ScrollView>
        <View style={styles.actions}>
          <Pressable testID="pantry-focus-add-cart" accessibilityRole="button"
            accessibilityLabel={t(adding ? 'pantry.addingToCart' : added ? 'pantry.addedToCart' : 'pantry.addToCart')}
            accessibilityState={{ disabled: adding || added, busy: adding }} disabled={adding || added}
            onPress={addToCart} style={({ pressed }) => [styles.action, styles.primaryAction, pressed && styles.pressed]}>
            {adding ? <ActivityIndicator color={colors.white} />
              : <Ionicons name={added ? 'checkmark-circle-outline' : 'cart-outline'} size={21} color={colors.white} />}
            <Text accessibilityLiveRegion="polite" style={styles.primaryLabel}>
              {t(adding ? 'pantry.addingToCart' : added ? 'pantry.addedToCart' : 'pantry.addToCart')}
            </Text>
          </Pressable>
          <Pressable testID="pantry-focus-finished" accessibilityRole="button" accessibilityLabel={t('pantry.finished')}
            accessibilityHint={t(section === 'fridge' ? 'pantry.fridgeFinishHint' : 'pantry.finishHint')}
            accessibilityState={{ disabled: adding }} disabled={adding} onPress={() => close(true)}
            style={({ pressed }) => [styles.action, styles.secondaryAction, (pressed || adding) && styles.pressed]}>
            <Ionicons name="checkmark-done-outline" size={21} color={colors.ink} />
            <Text style={styles.secondaryLabel}>{t('pantry.finished')}</Text>
          </Pressable>
        </View>
      </Animated.View>
      <Animated.View testID="pantry-focus-product" pointerEvents="none"
        style={[styles.product, { left: targetX, top: targetY, width: imageSide, height: imageSide }, zoom]}>
        <Image source={product.illustrationUrl} style={StyleSheet.absoluteFill} contentFit="contain"
          cachePolicy="memory-disk" transition={0} accessible accessibilityLabel={product.name}
          onLoad={() => setImageReady(true)} onError={() => { setImageError(true); setImageReady(true); }} />
        {imageError && <Ionicons name="image-outline" size={48} color="#FFF0D4" />}
      </Animated.View>
      <Pressable testID="pantry-focus-close" accessibilityRole="button" accessibilityLabel={t('common.close')}
        onPress={() => close()} style={[styles.close, { top: insets.top + 12 }]}>
        <Ionicons name="close" size={24} color={colors.ink} />
      </Pressable>
    </View>
  </Modal>;
}

const themedStyles = () => StyleSheet.create({
  root: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(29, 19, 13, 0.48)' },
  panel: { position: 'absolute', borderRadius: 28, backgroundColor: colors.paper,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#24170E', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  detailsScroll: { flex: 1, minHeight: 0 },
  details: { padding: 20, gap: 14 },
  storeRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 7 },
  storeName: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 13 },
  storeLogo: { width: 24, height: 24 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, color: colors.ink, fontFamily: fonts.bold, fontSize: 20, lineHeight: 25 },
  detailsButton: { width: 44, height: 44, marginVertical: -8, marginRight: -8, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center' },
  infoRow: { flexDirection: 'row', gap: 10 },
  infoColumn: { flexDirection: 'column' },
  infoBlock: { flex: 1, gap: 5, padding: 12, borderRadius: 16, backgroundColor: colors.surfaceAlt },
  notesBlock: { gap: 5, paddingHorizontal: 2 },
  label: { color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 12 },
  value: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  note: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 14 },
  error: { color: colors.red, fontFamily: fonts.medium, fontSize: 13 },
  actions: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8, gap: 8 },
  action: { minHeight: 48, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryAction: { backgroundColor: colors.accent },
  primaryLabel: { flexShrink: 1, color: colors.white, fontFamily: fonts.semibold, fontSize: 15, textAlign: 'center' },
  secondaryAction: { backgroundColor: colors.surfaceAlt },
  secondaryLabel: { flexShrink: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 15, textAlign: 'center' },
  pressed: { opacity: 0.65 },
  product: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
});
