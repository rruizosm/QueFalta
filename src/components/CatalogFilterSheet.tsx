import { startTransition, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import GlutenFilterOption from './GlutenFilterOption';

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
  const [presented, setPresented] = useState(visible);
  const transition = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) setPresented(true);
  }, [visible]);

  useEffect(() => {
    if (!presented) return;
    const animation = Animated.timing(transition, {
      toValue: visible ? 1 : 0,
      duration: reducedMotion ? 0 : visible ? 280 : 220,
      easing: visible ? Easing.out(Easing.cubic) : Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setPresented(false);
    });
    return () => animation.stop();
  }, [visible, presented, reducedMotion, transition]);

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
      <GlutenFilterOption selected={selected} onPress={toggleGlutenOnly}
        onComplete={onClose} testID="catalog-gluten-option" />
    </>
  );

  return (
    <Modal
      visible={presented}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: transition }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, {
            height: sheetHeight, paddingBottom: insets.bottom,
            transform: [{ translateY: transition.interpolate({
              inputRange: [0, 1], outputRange: [sheetHeight, 0],
            }) }],
          }]}
          accessibilityViewIsModal
        >
          {sheetHeight - insets.bottom < HEADER_HEIGHT + OPTION_HEIGHT
            ? <ScrollView showsVerticalScrollIndicator={false}>{content}</ScrollView>
            : <View>{content}</View>}
        </Animated.View>
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
});
