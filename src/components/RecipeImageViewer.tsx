import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  ActivityIndicator, Modal, Pressable, StatusBar,
  StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import Animated, { cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts } from '../constants/typography';
import { useTranslation } from '../context/LanguageContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import GlassSurface from './GlassSurface';

interface Props {
  uri: string;
  title: string;
  onClose: () => void;
  sourceRef: RefObject<View | null>;
  imageRatio: number;
  progress: SharedValue<number>;
}

export default function RecipeImageViewer({ uri, title, onClose, sourceRef, imageRatio, progress }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const rootRef = useRef<View>(null);
  const mounted = useRef(true);
  const source = useSharedValue<{ x: number; y: number; width: number; height: number } | null>(null);
  const closing = useRef(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelAnimation(progress); };
  }, [progress]);

  const measureSource = (done: () => void) => {
    const root = rootRef.current;
    const image = sourceRef.current;
    if (!root || !image) { done(); return; }
    root.measureInWindow((rootX, rootY) => {
      if (!mounted.current) return;
      image.measureInWindow((x, y, width, height) => {
        if (!mounted.current) return;
        source.set(width > 0 && height > 0
          ? { x: x - rootX, y: y - rootY, width, height } : null);
        done();
      });
    });
  };

  const open = () => {
    measureSource(() => {
      if (closing.current) return;
      progress.set(withTiming(1, {
        duration: reducedMotion ? 0 : 380,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
      }));
    });
  };

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    measureSource(() => {
      progress.set(withTiming(0, {
        duration: reducedMotion ? 0 : 360,
        easing: Easing.bezier(0.65, 0, 0.35, 1),
      }, (finished) => {
        if (finished) scheduleOnRN(onClose);
      }));
    });
  };

  const availableHeight = Math.max(1, size.height - insets.top - insets.bottom - 136);
  const targetWidth = Math.min(size.width, availableHeight * imageRatio);
  const targetHeight = targetWidth / imageRatio;
  const targetX = (size.width - targetWidth) / 2;
  const targetY = insets.top + 64 + (availableHeight - targetHeight) / 2;
  const fadeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const frameStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const origin = source.value;
    if (!origin || reducedMotion) {
      return { left: targetX, top: targetY, width: targetWidth, height: targetHeight, opacity: p };
    }
    return {
      left: origin.x + (targetX - origin.x) * p,
      top: origin.y + (targetY - origin.y) * p,
      width: origin.width + (targetWidth - origin.width) * p,
      height: origin.height + (targetHeight - origin.height) * p,
      opacity: interpolate(p, [0, 0.15, 1], [0, 1, 1], 'clamp'),
    };
  });
  const imageStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const origin = source.value;
    if (!origin || reducedMotion) {
      return { left: 0, top: 0, width: targetWidth, height: targetHeight };
    }
    // Interpolate one uniform scale inside a clipping frame: cover at the
    // recipe header, contain at full screen, without stretching the photo.
    const coverWidth = Math.max(origin.width, origin.height * imageRatio);
    const coverHeight = coverWidth / imageRatio;
    return {
      left: (origin.width - coverWidth) / 2 * (1 - p),
      top: (origin.height - coverHeight) / 2 * (1 - p),
      width: coverWidth + (targetWidth - coverWidth) * p,
      height: coverHeight + (targetHeight - coverHeight) * p,
    };
  });

  return (
    <Modal
      visible transparent animationType="none" presentationStyle="overFullScreen"
      statusBarTranslucent navigationBarTranslucent
      onShow={open} onRequestClose={close}
    >
      <View ref={rootRef} collapsable={false} style={styles.root}
        onLayout={(event) => setSize(event.nativeEvent.layout)}
        accessibilityViewIsModal onAccessibilityEscape={close}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <Animated.View pointerEvents="none" style={[styles.backdrop, fadeStyle]} />
        <Animated.View style={[styles.imageArea, frameStyle]}>
          <Animated.Image
            key={attempt}
            source={{ uri }} style={[styles.image, imageStyle]} resizeMode="contain"
            accessible accessibilityLabel={title}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setFailed(true); }}
          />
          {loading && <ActivityIndicator color="#ffffff" />}
          {failed && (
            <Pressable
              onPress={() => { setFailed(false); setLoading(true); setAttempt((value) => value + 1); }}
              style={styles.retry} accessibilityRole="button"
            >
              <Ionicons name="refresh" size={24} color="#ffffff" />
              <Text style={styles.message}>{t('queCocino.imageLoadError')}</Text>
            </Pressable>
          )}
        </Animated.View>
        <Animated.View style={[
          styles.header, { top: insets.top + 8, right: Math.max(insets.right, 16) }, fadeStyle,
        ]}>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <GlassSurface
              style={styles.closeButton} tintColor="rgba(30,30,30,0.5)"
              fallbackColor="rgba(40,40,40,0.95)" interactive
            >
              <Ionicons name="close" size={23} color="#ffffff" />
            </GlassSurface>
          </Pressable>
        </Animated.View>
        <Animated.Text numberOfLines={2} style={[
          styles.title,
          { bottom: insets.bottom + 20, left: Math.max(insets.left, 24), right: Math.max(insets.right, 24) }, fadeStyle,
        ]}>{title}</Animated.Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#080808' },
  imageArea: { position: 'absolute', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { position: 'absolute' },
  header: { position: 'absolute' },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { position: 'absolute', color: '#ffffff', fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  retry: { minHeight: 44, padding: 20, gap: 12, alignItems: 'center', backgroundColor: '#080808' },
  message: { color: '#ffffff', fontFamily: fonts.medium, fontSize: 14, textAlign: 'center' },
});
