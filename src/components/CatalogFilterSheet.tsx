import { startTransition, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface Props {
  visible: boolean;
  onClose: () => void;
  glutenOnly: boolean;
  onGlutenOnlyChange: (value: boolean) => void;
}

const SHEET_HEIGHT_FRACTION = 0.20;
const HEADER_HEIGHT = 58;
const OPTION_HEIGHT = 56;

/** Filtros compactos del catálogo de Mercadona, aplicados al seleccionar. */
export default function CatalogFilterSheet({ visible, onClose, glutenOnly, onGlutenOnlyChange }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation();
  const [selected, setSelected] = useState(glutenOnly);
  const selectedRef = useRef(glutenOnly);
  const pendingSelection = useRef<boolean | null>(null);
  const sheetHeight = height * SHEET_HEIGHT_FRACTION;

  useEffect(() => {
    if (pendingSelection.current !== null && glutenOnly !== pendingSelection.current) return;
    pendingSelection.current = null;
    selectedRef.current = glutenOnly;
    setSelected(glutenOnly);
  }, [glutenOnly]);

  const toggleGlutenOnly = () => {
    const next = !selectedRef.current;
    selectedRef.current = next;
    pendingSelection.current = next;
    setSelected(next);
    startTransition(() => onGlutenOnlyChange(next));
  };

  const content = (
    <>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="options-outline" size={20} color={colors.accent} />
        </View>
        <Text style={styles.title}>{t('filters.title')}</Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('filters.close')}
        >
          <Ionicons name="close" size={20} color={colors.inkSoft} />
        </TouchableOpacity>
      </View>
      <Pressable
        style={[styles.option, selected && styles.optionSelected]}
        onPress={toggleGlutenOnly}
        accessibilityRole="checkbox"
        accessibilityLabel={t('catalog.glutenFree')}
        accessibilityHint={t('catalog.glutenFreeHint')}
        accessibilityState={{ checked: selected }}
        testID="catalog-gluten-option"
      >
        <MaterialCommunityIcons name="barley-off" size={21} color={selected ? colors.accent : colors.inkSoft} />
        <Text style={styles.optionText}>{t('catalog.glutenFree')}</Text>
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected && <Ionicons name="checkmark" size={15} color={colors.white} />}
        </View>
      </Pressable>
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? 'none' : 'slide'}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessible={false} />
        <View
          style={[styles.sheet, { height: sheetHeight, paddingBottom: insets.bottom }]}
          accessibilityViewIsModal
        >
          {sheetHeight - insets.bottom < HEADER_HEIGHT + OPTION_HEIGHT
            ? <ScrollView showsVerticalScrollIndicator={false}>{content}</ScrollView>
            : <View>{content}</View>}
        </View>
      </View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: 'hidden', paddingHorizontal: 16,
  },
  header: { height: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight,
  },
  title: { flex: 1, fontSize: 18, fontFamily: fonts.bold, color: colors.ink },
  closeButton: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  option: {
    minHeight: OPTION_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, borderRadius: 16,
    borderWidth: 1.25, borderColor: colors.border,
  },
  optionSelected: { borderColor: colors.accentMid },
  optionText: { flex: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border },
  checkboxSelected: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accent, borderColor: colors.accent,
  },
});
