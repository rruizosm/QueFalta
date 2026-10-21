import { Platform, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { catalogBrowserStyles } from './catalogBrowserStyles';
import SlidingSegments, { type Segment } from './SlidingSegments';
import { glassAvailable } from './GlassSurface';

export type CatalogTab = 'productos' | 'categorias';
export default function CatalogTabSelector({ value, onChange, includeCategories = true, showIcons = true }: {
  value: CatalogTab;
  onChange: (tab: CatalogTab) => void;
  includeCategories?: boolean;
  showIcons?: boolean;
}) {
  const styles = useThemedStyles(catalogBrowserStyles);
  const { t } = useTranslation();
  const segments: Segment<CatalogTab>[] = [{ key: 'productos', label: t('catalog.tabProducts'), icon: showIcons ? 'cube-outline' : undefined }];
  if (includeCategories) segments.push({ key: 'categorias', label: t('catalog.tabCategories'), icon: showIcons ? 'grid-outline' : undefined });
  if (glassAvailable || Platform.OS === 'android') return <SlidingSegments style={{ flex: 1 }} emphasized
    transparentTrack={Platform.OS === 'android'} segments={segments} value={value} onChange={onChange} />;
  return <View style={styles.seg}>{segments.map((segment) => <TouchableOpacity key={segment.key}
    style={[styles.segBtn, value === segment.key && styles.segBtnOn]} onPress={() => onChange(segment.key)}
    activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ selected: value === segment.key }}>
    {segment.icon && <Ionicons name={segment.icon} size={16} color={value === segment.key ? colors.accent : colors.inkSoft} />}
    <Text style={[styles.segTxt, value === segment.key ? styles.segTxtOn : styles.segTxtOff]}>{segment.label}</Text>
  </TouchableOpacity>)}</View>;
}
