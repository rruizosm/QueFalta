import { useState } from 'react';
import {
  View, Text, Image, Modal, Pressable, TouchableOpacity, FlatList, StyleSheet,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import type { CatalogStore } from '../constants/stores';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface StoreOption { key: CatalogStore; name: string; icon: number | null }
export type StoreSelection = CatalogStore | 'all';

interface Props<T extends StoreSelection> {
  /** Súpers a ofrecer (ya filtrados por la preferencia del usuario). */
  stores: StoreOption[];
  value: T;
  onChange: (s: T) => void;
  /** Adds "Todos" as the first, full-width row. */
  includeAll?: boolean;
  /** Muestra un selector explícito con logo y chevrón. */
  labeled?: boolean;
  modal?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerRef?: React.Ref<View>;
  onTriggerLayout?: () => void;
}

/**
 * Selector de súper para las cabeceras de Novedades/Ofertas/Cambios de precios.
 * Puede mostrarse como botón redondo compacto o como pastilla explícita con
 * logo y chevrón. Al tocarlo abre a pantalla completa la rejilla de
 * súpers disponibles en DOS COLUMNAS (cada uno = tarjeta cuadrada de esquinas
 * redondeadas con logo + nombre en columna).
 */
export default function StoreDropdown<T extends StoreSelection>({
  stores, value, onChange, labeled = false, modal = true, open: controlledOpen,
  onOpenChange, triggerRef, onTriggerLayout, includeAll = false,
}: Props<T>) {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const allLabel = t('common.all');
  const active = value === 'all' && includeAll
    ? { key: 'all' as const, name: allLabel, icon: null }
    : stores.find((s) => s.key === value) ?? stores[0];
  const setMenuOpen = (nextOpen: boolean) => {
    if (controlledOpen == null) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const gridStores: (StoreOption | null)[] = stores.length % 2 === 0
    ? stores
    : [...stores, null];

  const renderItem = ({ item }: { item: StoreOption | null }) => {
    if (!item) {
      return (
        <View
          style={styles.cardPlaceholder}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      );
    }

    const on = item.key === value;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          on && styles.cardActive,
          pressed && styles.cardPressed,
        ]}
        onPress={() => { onChange(item.key as T); setMenuOpen(false); }}
        accessibilityRole="button"
        accessibilityLabel={item.name}
        accessibilityState={{ selected: on }}
      >
        {on && (
          <View style={styles.cardCheck}>
            <Ionicons name="checkmark" size={14} color={colors.white} />
          </View>
        )}
        <View style={styles.cardLogoWrap}>
          {item.icon ? (
            <Image source={item.icon} style={styles.cardLogo} resizeMode="cover" />
          ) : (
            <Ionicons name="storefront" size={30} color={colors.accent} />
          )}
        </View>
        <Text style={[styles.cardName, on && styles.cardNameActive]} numberOfLines={2}>
          {item.name}
        </Text>
      </Pressable>
    );
  };

  const allCardContent = includeAll ? (
    <Pressable
      style={({ pressed }) => [
        styles.allCard,
        styles.allCardUnlocked,
        value === 'all' && styles.allCardUnlockedSelected,
        pressed && styles.cardPressed,
      ]}
      onPress={() => {
        onChange('all' as T);
        setMenuOpen(false);
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: value === 'all' }}
    >
      {value === 'all' && (
        <View style={styles.cardCheck}>
          <Ionicons name="checkmark" size={14} color={colors.white} />
        </View>
      )}
      <View style={styles.allIconWrap}>
        <Ionicons name="apps" size={24} color={colors.accent} />
      </View>
      <Text style={styles.cardName}>
        {allLabel}
      </Text>
    </Pressable>
  ) : null;

  const allRow = includeAll ? (
    <View style={styles.allCardBackground}>{allCardContent}</View>
  ) : null;

  return (
    <>
      {/* Trigger compacto o pastilla explícita, según la cabecera. */}
      <View ref={triggerRef} collapsable={false} onLayout={onTriggerLayout}>
        <Pressable
          style={({ pressed }) => [
            styles.chip,
            labeled && styles.chipLabeled,
            pressed && styles.chipPressed,
            pressed && labeled && styles.chipLabeledPressed,
          ]}
          onPress={() => setMenuOpen(true)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={active?.name}
          accessibilityHint={t('storePicker.title')}
          accessibilityState={{ expanded: open }}
        >
          <View style={[styles.chipLogoWrap, labeled && styles.chipLogoLabeled]}>
            {active?.icon ? (
              <Image source={active.icon} style={styles.chipLogo} resizeMode="cover" />
            ) : (
              <Ionicons name={active?.key === 'all' ? 'apps' : 'storefront'} size={20} color={colors.accent} />
            )}
          </View>
          {labeled && (
            <View style={styles.chipChevron}>
              <Ionicons name="chevron-down" size={15} color={colors.accent} />
            </View>
          )}
        </Pressable>
      </View>

      {/* Rejilla a pantalla completa. */}
      {modal && (
        <Modal
          visible={open}
          animationType={reducedMotion ? 'none' : 'slide'}
          statusBarTranslucent
          onRequestClose={() => setMenuOpen(false)}
        >
          <View style={[styles.sheet, { paddingTop: insets.top }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('storePicker.title')}</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setMenuOpen(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={22} color={colors.ink} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={gridStores}
              keyExtractor={(s, index) => s?.key ?? `store-placeholder-${index}`}
              renderItem={renderItem}
              numColumns={2}
              ListHeaderComponent={allRow}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 24 }]}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </Modal>
      )}
    </>
  );
}

const CHIP = 40;

const themedStyles = () => StyleSheet.create({
  // ── Botón redondo (trigger, en la cabecera) ───────────────────
  chip: {
    width: CHIP, height: CHIP, borderRadius: CHIP / 2,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  chipPressed: { transform: [{ scale: 0.9 }], opacity: 0.85 },
  chipLogoWrap: {
    width: '100%', height: '100%', borderRadius: CHIP / 2, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  chipLogo: { width: '100%', height: '100%' },
  chipLabeled: {
    width: 76, height: 44, flexShrink: 0,
    flexDirection: 'row', justifyContent: 'flex-start', gap: 6,
    paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: 17, overflow: 'visible',
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: colors.ink, shadowOpacity: 0.09, shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  chipLabeledPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: colors.accentLight,
    borderColor: colors.accent,
  },
  chipLogoLabeled: {
    width: 30, height: 30, borderRadius: 15, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  chipChevron: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },

  // ── Rejilla a pantalla completa ───────────────────────────────
  sheet: { flex: 1, backgroundColor: colors.paper },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetTitle: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },

  grid: { padding: 16 },
  gridRow: { gap: 12, marginBottom: 12 },
  allCardBackground: {
    height: 78,
    marginBottom: 12,
  },
  allCard: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
    borderRadius: 20,
  },
  allCardSelected: { backgroundColor: colors.accentLight, borderColor: colors.accent },
  allCardLocked: { backgroundColor: colors.surfaceAlt },
  allCardUnlocked: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  allCardUnlockedSelected: {
    backgroundColor: colors.accentLight,
    borderColor: colors.accent,
  },
  allIconWrap: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  card: {
    flex: 1, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingHorizontal: 10,
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  cardPlaceholder: { flex: 1, aspectRatio: 1 },
  cardActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  cardPressed: { transform: [{ scale: 0.96 }], opacity: 0.9 },
  cardCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  cardLogoWrap: {
    width: 56, height: 56, borderRadius: 28, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white,
  },
  cardLogo: { width: '100%', height: '100%' },
  cardName: {
    fontSize: 14, fontFamily: fonts.semibold, color: colors.ink,
    textAlign: 'center',
  },
  cardNameActive: { color: colors.accent },
});
