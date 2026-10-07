import { useCallback, useContext, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { PagerGestureContext } from '../components/bottom-tabs-pager/PagerGestureContext';
import PantryProductPicker from '../components/PantryProductPicker';
import PantryShelf from '../components/PantryShelf';
import PantryWoodBackground from '../components/PantryWoodBackground';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { usePantryLayout } from '../hooks/usePantryLayout';
import { arrangePantryItems, clampPantryPlacement, findPantryPlacement,
  type PantryPlacement, type PantryProduct } from '../lib/pantryLayout';
import type { RootTabParamList } from '../types';

export default function PantryScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  // Synchronous account isolation, before any asynchronous storage reads run.
  return <PantryScreenContent key={userId ?? 'signed-out'} userId={userId} />;
}

export function PantryScreenContent({ userId }: { userId: string | null }) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomPadding = useTabBarBottomPadding(16);
  const { fontScale } = useWindowDimensions();
  // Reserve the same scroll clearance before, during and after selection.
  const toolsHeight = Math.max(88, Math.ceil(80 * fontScale));
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList, 'Pantry'>>();
  const { items, shelfCount, addShelf, ready, loadError, saveError, update, retryLoad, retrySave } = usePantryLayout(userId);
  const [searchOpen, setSearchOpen] = useState(false);
  const [addAt, setAddAt] = useState<PantryPlacement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noSpace, setNoSpace] = useState(false);
  const { placed, unplaced } = useMemo(() => arrangePantryItems(items, shelfCount), [items, shelfCount]);
  const pager = useContext(PagerGestureContext);
  const scrollGesture = useMemo(() => {
    const native = Gesture.Native();
    return pager ? native.requireExternalGestureToFail(pager) : native;
  }, [pager]);
  const selected = items.find((item) => item.instanceId === selectedId);
  const openSearch = useCallback((placement: PantryPlacement) => {
    setAddAt(placement);
    setNoSpace(false);
    setSearchOpen(true);
  }, []);
  const place = useCallback((instanceId: string, placement: PantryPlacement) => {
    update((previous) => {
      const { placed: shelf, unplaced: pending } = arrangePantryItems(previous, shelfCount);
      if (!previous.some((item) => item.instanceId === instanceId)) return previous;
      const next = findPantryPlacement(placement, shelf.filter((item) => item.instanceId !== instanceId), shelfCount);
      setNoSpace(!next);
      if (!next) {
        // Keep a recovered overflow item intact until another product frees room.
        if (pending.some((item) => item.instanceId === instanceId)) return [...shelf, ...pending].map((item) =>
          item.instanceId === instanceId ? { ...item, ...clampPantryPlacement(placement, shelfCount) } : item);
        return previous;
      }
      return [...shelf, ...pending].map((item) => item.instanceId === instanceId ? { ...item, ...next } : item);
    });
  }, [update, shelfCount]);
  const add = (product: PantryProduct) => {
    if (!addAt) return;
    const instanceId = `${product.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    update((previous) => {
      const { placed: shelf, unplaced: pending } = arrangePantryItems(previous, shelfCount);
      const placement = findPantryPlacement(addAt, shelf, shelfCount);
      setNoSpace(!placement);
      if (!placement) return previous;
      setSelectedId(instanceId);
      return [...shelf, { instanceId, product, ...placement }, ...pending];
    });
    setSearchOpen(false);
    setAddAt(null);
    Keyboard.dismiss();
  };
  return (
    <View testID="pantry-screen" style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <PantryWoodBackground />
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>{t('pantry.title')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pantry.backHome')}
          testID="pantry-back-home"
          onPress={() => navigation.navigate('Home')}
          style={({ pressed }) => [styles.homeButton, pressed && styles.pressed]}
        >
          <Text style={styles.homeLabel}>{t('tabs.home')}</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.accent} />
        </Pressable>
      </View>
      <GestureDetector gesture={scrollGesture}><ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding + toolsHeight + 8 }]}
      >
        <PantryShelf items={placed} shelfCount={shelfCount} selectedId={selectedId} onSelect={setSelectedId} onPlace={place}
          onAddAt={openSearch} canAdd={ready} scrollGesture={scrollGesture} />
        <Pressable disabled={!ready} testID="pantry-add-shelf"
          accessibilityRole="button" accessibilityLabel={t('pantry.addShelf')}
          accessibilityState={{ disabled: !ready }}
          onPress={() => { addShelf(); setNoSpace(false); }}
          style={({ pressed }) => [styles.addShelfButton, (!ready || pressed) && styles.pressed]}>
          <Ionicons name="add" size={22} color="#FFF4E3" />
          <Text style={styles.addShelfLabel}>{t('pantry.addShelf')}</Text>
        </Pressable>
        {!ready && !loadError && <ActivityIndicator color={colors.accent} accessibilityLabel={t('common.loading')} />}
        {loadError && <Pressable onPress={retryLoad} style={styles.error} accessibilityRole="button">
          <Text style={styles.errorText}>{t('pantry.loadError')} · {t('common.retry')}</Text>
        </Pressable>}
        {saveError && <Pressable onPress={retrySave} style={styles.error} accessibilityRole="button">
          <Text style={styles.errorText}>{t('pantry.saveError')} · {t('common.retry')}</Text>
        </Pressable>}
        {noSpace && <Text testID="pantry-no-space" accessibilityRole="alert" accessibilityLiveRegion="polite"
          style={[styles.error, styles.errorText]}>{t('pantry.noSpace')}</Text>}
        {unplaced.length > 0 && <View style={styles.error} testID="pantry-unplaced">
          <Text style={styles.info}>{t('pantry.unplacedHint')}</Text>
          {unplaced.map((item) => <Pressable key={item.instanceId} accessibilityRole="button"
            accessibilityLabel={t('pantry.editUnplaced', { name: item.product.name })}
            onPress={() => { setSelectedId(item.instanceId); setNoSpace(false); }} style={styles.pendingProduct}>
            <Text style={styles.pendingProductName}>{item.product.name}</Text>
            <Ionicons name="cube-outline" size={22} color={colors.accent} />
          </Pressable>)}
        </View>}
      </ScrollView></GestureDetector>
      {selected && !searchOpen && <View pointerEvents="box-none" testID="pantry-selection-tools"
        style={[styles.toolsDock, { bottom: bottomPadding }]}>
          <View style={[styles.tools, { height: toolsHeight }]}>
            <View style={styles.selectionText}>
              <Text numberOfLines={1} style={styles.selectedName}>{selected.product.name}</Text>
              <Text numberOfLines={2} style={styles.editHint}>{t('pantry.editHint')}</Text>
            </View>
            <View style={styles.controls}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('pantry.removeProduct')}
                testID="pantry-remove" style={styles.control} onPress={() => {
                  update((previous) => previous.filter((item) => item.instanceId !== selected.instanceId));
                  setSelectedId(null);
                  setNoSpace(false);
                }}>
                <Ionicons name="trash-outline" size={21} color="#FFD7C6" />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('pantry.finishPlacement')}
                testID="pantry-finish" style={[styles.control, styles.done]} onPress={() => setSelectedId(null)}>
                <Ionicons name="checkmark" size={23} color="#fff" />
              </Pressable>
            </View>
          </View>
      </View>}
      {searchOpen && <PantryProductPicker onSelect={add} onClose={() => {
        setSearchOpen(false);
        setAddAt(null);
      }} />}
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, paddingHorizontal: 24, paddingBottom: 8,
  },
  title: { flexShrink: 1, fontSize: 30, fontFamily: fonts.bold, color: colors.ink },
  homeButton: {
    minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 22,
    backgroundColor: colors.white,
  },
  homeLabel: { fontSize: 14, fontFamily: fonts.semibold, color: colors.accent },
  pressed: { opacity: 0.65 },
  content: { flexGrow: 1, paddingHorizontal: 16, gap: 8 },
  pendingProductName: { flex: 1, color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 14 },
  addShelfButton: { minHeight: 48, alignSelf: 'center', maxWidth: '100%', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 24, backgroundColor: 'rgba(61, 36, 19, 0.9)',
    borderWidth: 1, borderColor: 'rgba(255, 240, 212, 0.4)' },
  addShelfLabel: { flexShrink: 1, color: '#FFF4E3', fontFamily: fonts.semibold, fontSize: 14 },
  info: { minHeight: 34, color: colors.inkSoft, fontSize: 13, lineHeight: 17,
    fontFamily: fonts.regular, padding: 8, backgroundColor: colors.white, borderRadius: 12 },
  toolsDock: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  tools: { width: '100%', maxWidth: 520, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(48, 29, 17, 0.97)', borderRadius: 22, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255, 228, 187, 0.28)' },
  selectionText: { flex: 1, gap: 4 },
  selectedName: { color: '#FFF4E3', fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  editHint: { color: '#E6C9A4', fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  control: { width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(255, 240, 212, 0.1)', alignItems: 'center', justifyContent: 'center' },
  done: { backgroundColor: colors.accent },
  error: { borderRadius: 12, padding: 12, backgroundColor: colors.surfaceAlt, minHeight: 44, justifyContent: 'center' },
  errorText: { fontFamily: fonts.medium, color: colors.red, fontSize: 13, textAlign: 'center' },
  pendingProduct: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, padding: 8 },
});
