import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import {
  foodIndexColor, foodIndexTextColor, type FoodIndex, type FoodIndexComponentId,
} from '../lib/foodIndex';
import GlassSurface from './GlassSurface';

interface Props {
  index: FoodIndex;
  onPress: () => void;
  expanded?: boolean;
  children?: ReactNode;
}

const labelKey: Record<FoodIndexComponentId, string> = {
  nutrition: 'nutrition.index.nutrition',
  processing: 'nutrition.index.processing',
  sustainability: 'nutrition.index.sustainability',
};

const levelKey = (score: number) => {
  if (score >= 80) return 'nutrition.index.levelExcellent';
  if (score >= 60) return 'nutrition.index.levelGood';
  if (score >= 40) return 'nutrition.index.levelAverage';
  if (score >= 20) return 'nutrition.index.levelLow';
  return 'nutrition.index.levelVeryLow';
};

export default function FoodIndexSummary({ index, onPress, expanded = false, children }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const scoreColor = foodIndexColor(index.score);
  const scoreTextColor = foodIndexTextColor(index.score);
  const formula = index.components
    .map((component) => `${component.weight}% ${t(labelKey[component.id]).toLocaleLowerCase()}`)
    .join(' + ');

  return (
    <GlassSurface style={styles.card} fallbackColor={colors.white}>
      <TouchableOpacity
        style={styles.summary}
        onPress={onPress}
        activeOpacity={0.72}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${t('nutrition.index.title')}: ${index.score} ${t('nutrition.index.outOf100')}`}
      >
        <View style={[styles.scoreCircle, { backgroundColor: scoreColor }]}>
          <Text style={[styles.score, { color: scoreTextColor }]}>{index.score}</Text>
          <Text style={[styles.scoreMax, { color: scoreTextColor }]}>/100</Text>
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t('nutrition.index.title')}</Text>
            <Text style={[styles.level, { color: scoreColor }]}>{t(levelKey(index.score))}</Text>
          </View>
          <Text style={styles.formula}>{formula}</Text>
          <Text style={styles.hint}>{t('nutrition.index.tapForDetails')}</Text>
        </View>

        <Ionicons
          name="chevron-forward"
          size={20}
          color={colors.inkFaint}
          style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
        />
      </TouchableOpacity>
      {expanded && children ? (
        <View style={styles.details}>
          <View style={styles.separator} />
          {children}
        </View>
      ) : null}
    </GlassSurface>
  );
}

const themedStyles = () => StyleSheet.create({
  card: {
    marginTop: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  summary: {
    minHeight: 98,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  scoreCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontSize: 27,
    lineHeight: 29,
    fontFamily: fonts.bold,
  },
  scoreMax: {
    fontSize: 10.5,
    lineHeight: 12,
    fontFamily: fonts.bold,
  },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 7 },
  title: { fontSize: 15.5, fontFamily: fonts.bold, color: colors.ink },
  level: { fontSize: 11.5, fontFamily: fonts.bold },
  formula: {
    marginTop: 3,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: fonts.semibold,
    color: colors.inkSoft,
  },
  hint: {
    marginTop: 4,
    fontSize: 11.5,
    fontFamily: fonts.medium,
    color: colors.accent,
  },
  details: { paddingHorizontal: 14, paddingBottom: 16 },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: 1,
  },
});
