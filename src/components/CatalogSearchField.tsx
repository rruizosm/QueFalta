import { Pressable, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { catalogBrowserStyles } from './catalogBrowserStyles';
import { glassAvailable } from './GlassSurface';

/** The same persistent search surface in the catalog and pantry browser. */
export default function CatalogSearchField({ placeholder, value, onChange, expanded = true,
  product = false, onFocus, onBlur, testID }: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  expanded?: boolean;
  product?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  testID?: string;
}) {
  const styles = useThemedStyles(catalogBrowserStyles);
  const { t } = useTranslation();
  return <View style={[
    styles.searchBar,
    !product && styles.categorySearchBox,
    product && styles.prodSearchBox,
    glassAvailable ? styles.searchBoxGlass : styles.searchBoxFallback,
    product && (expanded ? styles.prodSearchBoxExpanded : styles.prodSearchBoxCollapsed),
  ]}>
    <Ionicons name="search-outline" size={product ? 20 : 18} color={colors.inkSoft} />
    {expanded ? <>
      <TextInput style={styles.searchInput} placeholder={placeholder} placeholderTextColor={colors.inkFaint}
        value={value} onChangeText={onChange} onFocus={onFocus} onBlur={onBlur}
        accessibilityLabel={placeholder} returnKeyType="search" autoCorrect={false}
        autoFocus={product} testID={testID} />
      {!!value && <Pressable onPress={() => onChange('')} accessibilityRole="button"
        accessibilityLabel={t('common.clear')} hitSlop={8}>
        <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
      </Pressable>}
    </> : <Pressable style={styles.prodSearchActivator} onPress={onFocus}
      accessibilityRole="button" accessibilityLabel={placeholder} testID={testID ? `${testID}-open` : undefined} />}
  </View>;
}
