import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useDerivedValue, withTiming,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import GlassSurface from './GlassSurface';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { OpenFoodFactsNutrition } from '../api/openFoodFacts';
import { nutritionValueRows, structureNutritionText } from '../lib/nutritionDisplay';
import { useTranslation } from '../context/LanguageContext';

// LayoutAnimation necesita habilitarse a mano en Android para animar el desplegado.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface ProductInfoItem {
  /** Clave estable para el `key` de React. */
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Texto de la característica. Si viene vacío/nulo, la fila no se pinta. */
  text?: string | null;
  /** Nutrición normalizada para mostrarla dentro de la tarjeta de características. */
  nutritionInfo?: OpenFoodFactsNutrition | null;
  onPress?: () => void;
}

/**
 * Lista de características del producto al estilo "ficha": una tarjeta redondeada
 * con filas (icono + título + valor) separadas por hairlines. Cada fila se
 * despliega al tocarla (el valor se trunca a una línea mientras está plegada).
 * Las filas sin texto se descartan; si no queda ninguna, no pinta nada.
 */
export default function ProductInfoSections({ items }: { items: ProductInfoItem[] }) {
  const styles = useThemedStyles(themedStyles);
  const visible = items
    .filter((i) => (i.text && i.text.trim().length > 0) || i.nutritionInfo || i.onPress)
    .sort((a, b) => {
      if (a.key === 'nutrition') return -1;
      if (b.key === 'nutrition') return 1;
      return 0;
    });
  if (visible.length === 0) return null;

  return (
    <GlassSurface style={styles.card} fallbackColor={colors.white}>
      {visible.map((item, idx) => (
        <View key={item.key}>
          {idx > 0 ? <View style={styles.separator} /> : null}
          <Row item={item} />
        </View>
      ))}
    </GlassSurface>
  );
}

function Row({ item }: { item: ProductInfoItem }) {
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [nutritionHeight, setNutritionHeight] = useState(0);
  const value = item.text?.trim() ?? null;
  const structuredNutrition = item.key === 'nutrition' && (!!value || !!item.nutritionInfo);
  const revealProgress = useDerivedValue(() => {
    const target = expanded ? 1 : 0;
    return reducedMotion
      ? target
      : withTiming(target, { duration: 360, easing: Easing.inOut(Easing.cubic) });
  }, [expanded, reducedMotion]);
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${revealProgress.value * 90}deg` }],
  }));
  const nutritionRevealStyle = useAnimatedStyle(() => ({
    height: nutritionHeight * revealProgress.value,
    opacity: revealProgress.value,
    transform: [{ translateY: (1 - revealProgress.value) * -4 }],
  }));

  const toggle = () => {
    if (item.onPress) {
      item.onPress();
      return;
    }
    if (!structuredNutrition && !reducedMotion) {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(160, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
      );
    }
    setExpanded((e) => !e);
  };

  return (
    <TouchableOpacity
      activeOpacity={structuredNutrition ? 0.94 : 0.6}
      onPress={toggle}
      accessibilityRole="button"
      accessibilityState={item.onPress ? undefined : { expanded }}
    >
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name={item.icon} size={20} color={colors.accent} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>{item.title}</Text>
          {item.nutritionInfo && !expanded ? (
            <Text style={styles.value}>{t('nutrition.referenceAmount')}</Text>
          ) : value && (!structuredNutrition || !expanded) ? (
            <Text style={styles.value} numberOfLines={expanded ? undefined : 1}>
              {value}
            </Text>
          ) : null}
        </View>
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
        </Animated.View>
      </View>
      {structuredNutrition ? (
        <Animated.View
          style={[styles.nutritionReveal, nutritionRevealStyle]}
          pointerEvents={expanded ? 'auto' : 'none'}
          accessibilityElementsHidden={!expanded}
          importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
        >
          <View
            style={styles.nutritionMeasure}
            onLayout={(event) => setNutritionHeight(event.nativeEvent.layout.height)}
          >
            <StructuredNutritionValue value={value} info={item.nutritionInfo} />
          </View>
        </Animated.View>
      ) : null}
    </TouchableOpacity>
  );
}

function StructuredNutritionValue({
  value,
  info,
}: {
  value: string | null;
  info?: OpenFoodFactsNutrition | null;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t, lang } = useTranslation();
  const locale = lang === 'ca' ? 'ca-ES' : 'es-ES';
  const lines = info ? nutritionValueRows(info, {
    energy: t('nutrition.energy'),
    fat: t('nutrition.fat'),
    saturatedFat: t('nutrition.saturatedFat'),
    carbohydrates: t('nutrition.carbohydrates'),
    sugars: t('nutrition.sugars'),
    fiber: t('nutrition.fiber'),
    proteins: t('nutrition.proteins'),
    salt: t('nutrition.salt'),
  }, locale) : structureNutritionText(value ?? '');

  return (
    <View style={styles.nutritionList}>
      {lines.map((line, index) => (
        <View key={`${line.label}:${index}`}>
          {index > 0 ? <View style={styles.nutritionSeparator} /> : null}
          <View style={styles.nutritionRow}>
            <View style={styles.nutritionIcon}>
              <Ionicons name={line.icon} size={17} color={colors.accent} />
            </View>
            <Text style={styles.nutritionLabel}>{line.label}</Text>
            {line.value ? <Text style={styles.nutritionValue}>{line.value}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  card: {
    marginTop: 18,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1 },
  title: { fontSize: 14.5, fontFamily: fonts.bold, color: colors.ink },
  value: { fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2, lineHeight: 18 },
  // El separador arranca a la altura del texto (deja libre el icono), como en la referencia.
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 70 },
  nutritionList: {
    marginHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  nutritionReveal: {
    position: 'relative',
    overflow: 'hidden',
  },
  nutritionMeasure: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  nutritionRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  nutritionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  nutritionLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    lineHeight: 16,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  nutritionValue: {
    maxWidth: '48%',
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: fonts.bold,
    color: colors.accent,
    textAlign: 'right',
  },
  nutritionSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 54,
    backgroundColor: colors.border,
  },
});
