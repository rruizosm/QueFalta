import { useEffect, useState, type RefObject } from 'react';
import { Image, type ImageSource } from 'expo-image';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fonts } from '../constants/typography';
import { isHttpsUrl } from '../lib/sponsorCampaign';

interface Props {
  source: ImageSource | number;
  label: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  destinationUrl?: string;
  onOpenError?: () => void;
  onClick?: () => void;
  onImageReady?: (ready: boolean) => void;
  bannerRef?: RefObject<View | null>;
  style?: StyleProp<ViewStyle>;
}

// Las campañas de Inicio usan una creatividad 3:1. El ancho se adapta al
// dispositivo y se limita a 372 pt para que la altura nunca supere los 124 pt
// acordados para este espacio publicitario.
export default function ResponsivePromotionCard({
  source,
  label,
  accessibilityLabel,
  accessibilityHint,
  destinationUrl,
  onOpenError,
  onClick,
  onImageReady,
  bannerRef,
  style,
}: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    onImageReady?.(false);
    return () => onImageReady?.(false);
  }, [onImageReady]);
  if (failed) return null;
  const content = (
    <>
      <Image source={source} style={styles.image} contentFit="contain" cachePolicy="memory-disk"
        onLoad={() => onImageReady?.(true)} onError={() => { onImageReady?.(false); setFailed(true); }} />
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.labelPill}
      >
        <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.label}>
          {label}
        </Text>
      </View>
    </>
  );

  if (!destinationUrl) {
    return (
      <View
        ref={bannerRef}
        collapsable={false}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
        style={[styles.frame, style]}
      >
        {content}
      </View>
    );
  }

  const openDestination = () => {
    if (!isHttpsUrl(destinationUrl)) { onOpenError?.(); return; }
    onClick?.();
    Linking.openURL(destinationUrl).catch(() => onOpenError?.());
  };

  return (
    <Pressable
      ref={bannerRef}
      collapsable={false}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={openDestination}
      style={({ pressed }) => [styles.frame, style, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    maxWidth: 372,
    aspectRatio: 3,
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: '#0b2618',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  labelPill: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.66)',
  },
  label: {
    fontSize: 8,
    lineHeight: 10,
    fontFamily: fonts.bold,
    letterSpacing: 0.7,
    color: '#ffffff',
    textTransform: 'uppercase',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
});
