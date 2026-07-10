import { useState } from 'react';
import {
  View, Text, Image, Modal, Pressable, TouchableOpacity, StyleSheet,
  type LayoutRectangle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import type { CatalogStore } from '../constants/stores';

interface StoreOption { key: CatalogStore; name: string; icon: number | null }

interface Props {
  /** Súpers a ofrecer (ya filtrados por la preferencia del usuario). */
  stores: StoreOption[];
  value: CatalogStore;
  onChange: (s: CatalogStore) => void;
}

/**
 * Selector de súper colapsado (mismo aspecto que el del catálogo/favoritos,
 * extraído a componente para Novedades y Cambios de precios): solo se ve el
 * activo; al tocar despliega el resto en un menú anclado bajo el selector.
 * Debe ser hijo directo del contenedor de la pantalla para que el `onLayout`
 * dé coordenadas de pantalla (así se ancla el menú del Modal).
 */
export default function StoreDropdown({ stores, value, onChange }: Props) {
  const styles = useThemedStyles(themedStyles);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<LayoutRectangle | null>(null);
  const active = stores.find((s) => s.key === value) ?? stores[0];

  return (
    <>
      <View style={styles.selectorWrap} onLayout={(e) => setBox(e.nativeEvent.layout)}>
        <TouchableOpacity
          style={styles.selector}
          onPress={() => setOpen((o) => !o)}
          activeOpacity={0.8}
        >
          {active?.icon ? (
            <Image source={active.icon} style={styles.selectorIcon} resizeMode="cover" />
          ) : (
            <Ionicons name="storefront" size={18} color={colors.accent} />
          )}
          <Text style={styles.selectorName} numberOfLines={1}>{active?.name}</Text>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.inkSoft}
          />
        </TouchableOpacity>
      </View>

      <Modal
        visible={open}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setOpen(false)}>
          {box && (
            <View style={[styles.menu, { top: box.y + box.height + 6 }]}>
              {stores.map((s, i) => {
                const on = s.key === value;
                const last = i === stores.length - 1;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.menuItem, !last && styles.menuItemBorder, on && styles.menuItemActive]}
                    onPress={() => { onChange(s.key); setOpen(false); }}
                    activeOpacity={0.7}
                  >
                    {s.icon ? (
                      <Image source={s.icon} style={styles.selectorIcon} resizeMode="cover" />
                    ) : (
                      <Ionicons name="storefront" size={18} color={colors.inkSoft} />
                    )}
                    <Text style={[styles.menuItemName, on && styles.menuItemNameActive]} numberOfLines={1}>
                      {s.name}
                    </Text>
                    {on && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  );
}

const themedStyles = () => StyleSheet.create({
  selectorWrap: { marginHorizontal: 16, marginBottom: 10 },
  selector: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
  },
  selectorIcon: { width: 20, height: 20 },
  selectorName: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.ink },

  menuBackdrop: { flex: 1 },
  menu: {
    position: 'absolute', left: 16, right: 16,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuItemActive: { backgroundColor: colors.accentLight },
  menuItemName: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.ink },
  menuItemNameActive: { color: colors.accent },
});
