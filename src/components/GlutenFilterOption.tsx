import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import GlutenFilterBorder from './GlutenFilterBorder';

interface Props {
  selected: boolean;
  onPress: () => void;
  onComplete?: () => void;
  testID?: string;
  layout?: 'catalog' | 'section';
}

export default function GlutenFilterOption({ selected, onPress, onComplete, testID, layout = 'catalog' }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const section = layout === 'section';
  return <View style={styles.root}>
    <Pressable style={[styles.option, section && styles.sectionOption]} onPress={onPress}
      accessibilityRole="checkbox" accessibilityLabel={t('catalog.glutenFree')}
      accessibilityHint={t('catalog.glutenFreeHint')} accessibilityState={{ checked: selected }}
      testID={testID}>
      {section ? <View style={styles.sectionIcon}>
        <MaterialCommunityIcons name="barley-off" size={20} color={colors.accent} />
      </View> : <MaterialCommunityIcons name="barley-off" size={21} color={selected ? colors.accent : colors.inkSoft} />}
      <Text style={[styles.optionText, section && styles.sectionText]}>{t('catalog.glutenFree')}</Text>
      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected && <Ionicons name="checkmark" size={15} color={colors.white} />}
      </View>
    </Pressable>
    {!section && <GlutenFilterBorder selected={selected} onComplete={onComplete} />}
  </View>;
}

const themedStyles = () => StyleSheet.create({
  root: { width: '100%' },
  option: {
    minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, borderRadius: 16,
    borderWidth: 1.25, borderColor: 'transparent',
  },
  sectionOption: { paddingHorizontal: 0, borderWidth: 0, gap: 9 },
  sectionIcon: {
    width: 32, height: 32, borderRadius: 11,
    backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center',
  },
  sectionText: { fontSize: 14, fontFamily: fonts.bold },
  optionText: { flex: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border },
  checkboxSelected: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accent, borderColor: colors.accent,
  },
});
