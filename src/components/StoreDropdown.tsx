import { useState } from 'react';
import {
  View, Text, Image, Modal, Pressable, TouchableOpacity, FlatList, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import type { CatalogStore } from '../constants/stores';

interface StoreOption { key: CatalogStore; name: string; icon: number | null }

interface Props {
  /** Súpers a ofrecer (ya filtrados por la preferencia del usuario). */
  stores: StoreOption[];
  value: CatalogStore;
  onChange: (s: CatalogStore) => void;
}

/**
 * Selector de súper para las cabeceras de Novedades/Ofertas/Cambios de precios:
 * un BOTÓN REDONDO con solo el logo del súper activo (vive en línea con el
 * título de la sección). Al tocarlo — con efecto de pulsación — abre a pantalla
 * completa la rejilla de súpers disponibles en DOS COLUMNAS (cada uno = tarjeta
 * cuadrada de esquinas redondeadas con logo + nombre en columna).
 */
export default function StoreDropdown({ stores, value, onChange }: Props) {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = stores.find((s) => s.key === value) ?? stores[0];

  const renderItem = ({ item }: { item: StoreOption }) => {
    const on = item.key === value;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          on && styles.cardActive,
          pressed && styles.cardPressed,
        ]}
        onPress={() => { onChange(item.key); setOpen(false); }}
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

  return (
    <>
      {/* Botón redondo con el logo del súper activo, en línea con el título. */}
      <Pressable
        style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={active?.name}
      >
        {active?.icon ? (
          <Image source={active.icon} style={styles.chipLogo} resizeMode="cover" />
        ) : (
          <Ionicons name="storefront" size={20} color={colors.accent} />
        )}
      </Pressable>

      {/* Rejilla a pantalla completa. */}
      <Modal
        visible={open}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <View style={[styles.sheet, { paddingTop: insets.top }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('storePicker.title')}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={stores}
            keyExtractor={(s) => s.key}
            renderItem={renderItem}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </Modal>
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
  chipLogo: { width: '100%', height: '100%' },

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
  card: {
    flex: 1, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingHorizontal: 10,
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1, borderColor: colors.border,
  },
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
