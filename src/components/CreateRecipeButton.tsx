import { useTabBarScrollOffsetStyle } from '../hooks/useTabBarScroll';
import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, type LayoutChangeEvent } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { measureRecipeButton } from '../lib/recipeCreatorMotion';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useRecipeCreatorSource } from '../context/RecipeCreatorContext';
import type { AppStackParamList } from '../navigation/recipeCreator';

export default function CreateRecipeButton({ bottom, onLayout }: {
  bottom: number;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  const tabBarOffsetStyle = useTabBarScrollOffsetStyle();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { sourceRef, sourceHidden } = useRecipeCreatorSource();
  const opening = useRef(false);
  const scale = useSharedValue(1);
  useFocusEffect(useCallback(() => {
    opening.current = false;
    scale.set(1);
    return () => { opening.current = false; };
  }, [scale]));
  useAnimatedReaction(() => sourceHidden.value, (hidden) => {
    if (hidden) scale.set(1);
  });
  const motion = useAnimatedStyle(() => ({
    opacity: sourceHidden.value ? 0 : 1,
    transform: [{ scale: scale.value }],
  }));

  const open = async () => {
    if (opening.current) return;
    opening.current = true;
    if (!reducedMotion) scale.set(withSpring(1.035, { mass: 0.8, damping: 20, stiffness: 200 }));
    // Measure the unscaled wrapper. Params contain serializable geometry only.
    const origin = await measureRecipeButton(sourceRef.current);
    if (opening.current) navigation.navigate('NewRecipe', { origin });
  };

  return <Animated.View ref={sourceRef} collapsable={false} onLayout={onLayout}
    style={[styles.position, { bottom }, tabBarOffsetStyle]}>
    <Animated.View style={motion}>
      <Pressable onPress={open} style={styles.button}
        accessibilityRole="button" accessibilityLabel={t('queCocino.createRecipe')}>
        <Ionicons name="add" size={18} color={colors.white} />
        <Text style={styles.label}>{t('queCocino.createRecipe')}</Text>
      </Pressable>
    </Animated.View>
  </Animated.View>;
}

const themedStyles = () => StyleSheet.create({
  position: { position: 'absolute', right: 16, zIndex: 11, elevation: 4 },
  button: {
    minHeight: 44, paddingHorizontal: 14, borderRadius: 22,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: colors.accent,
  },
  label: { color: colors.white, fontFamily: fonts.bold, fontSize: 13 },
});
