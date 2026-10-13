import { memo, useContext, useMemo, type ReactNode } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import PantryShelf, { type PantryShelfProps } from './PantryShelf';
import { PagerGestureContext } from './bottom-tabs-pager/PagerGestureContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { fonts } from '../constants/typography';

type Props = Omit<PantryShelfProps, 'scrollGesture' | 'finish' | 'dark' | 'testIDPrefix'> & {
  bottomPadding: number;
  onAddShelf: () => void;
  footer: ReactNode;
};

/** The same shelf editor as the cupboard, with an independently supplied inventory. */
function PantryFridge({ bottomPadding, onAddShelf, footer, ...shelfProps }: Props) {
  const { scheme } = useTheme();
  const { t } = useTranslation();
  const dark = scheme === 'dark';
  const pager = useContext(PagerGestureContext);
  const scrollGesture = useMemo(() => {
    const native = Gesture.Native();
    return pager ? native.requireExternalGestureToFail(pager) : native;
  }, [pager]);

  return <View style={[styles.container, { backgroundColor: dark ? '#152E42' : '#D6EAF5' }]}>
    <GestureDetector gesture={scrollGesture}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding + 16 }]}>
        <PantryShelf {...shelfProps} scrollGesture={scrollGesture} finish="ice" dark={dark} testIDPrefix="fridge" />
        <Pressable disabled={!shelfProps.canAdd} testID="fridge-add-shelf" onPress={onAddShelf}
          accessibilityRole="button" accessibilityLabel={t('pantry.addShelf')}
          accessibilityState={{ disabled: !shelfProps.canAdd }}
          style={({ pressed }) => [styles.addShelf, (!shelfProps.canAdd || pressed) && styles.pressed]}>
          <Ionicons name="add" size={22} color="#F2FAFF" />
          <Text style={styles.addShelfLabel}>{t('pantry.addShelf')}</Text>
        </Pressable>
        {footer}
      </ScrollView>
    </GestureDetector>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, paddingTop: 12, paddingHorizontal: 16, gap: 8 },
  addShelf: { minHeight: 48, alignSelf: 'center', maxWidth: '100%', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 24, backgroundColor: '#285C7F', borderWidth: 1, borderColor: '#A9D3EB' },
  addShelfLabel: { flexShrink: 1, color: '#F2FAFF', fontFamily: fonts.semibold, fontSize: 14 },
  pressed: { opacity: 0.65 },
});

export default memo(PantryFridge);
