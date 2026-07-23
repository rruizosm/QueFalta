import { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { fetchMyGroups, type GroupSummary } from '../api/groups';
import MemberAvatars from './MemberAvatars';

interface Props {
  /** Añade la separación de la barra de estado cuando el banner es el primer
   *  elemento de la pantalla (va encima de la cabecera, no debajo). */
  topInset?: boolean;
  /** Versión condensada para vivir en línea (p. ej. a la derecha de un título):
   *  sin márgenes propios y solo con icono de carrito + flecha inferior. */
  compact?: boolean;
  /** Omite el prefijo "Añade productos a" y muestra solo el nombre del grupo,
   *  conservando el layout normal (a diferencia de compact). */
  nameOnly?: boolean;
  /** Variante redondeada para cabeceras del sistema visual principal. */
  rounded?: boolean;
}

/**
 * Recordatorio + selector del carrito activo: indica en qué grupo se añadirán
 * los productos y, al tocarlo, abre una hoja para CAMBIAR de grupo sin salir de
 * donde estés (catálogo, categorías, subcategorías, productos, favoritos…).
 * Sin carrito activo invita a elegir uno.
 */
export default function ActiveCartBanner({
  topInset = false,
  compact = false,
  nameOnly = false,
  rounded = false,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const bannerTop = useHeaderTopPadding(52);
  const { activeCart, activateCart, deactivateCart, isActive, busy } = useCart();
  const toast = useToast();
  const { t } = useTranslation();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const openPicker = async () => {
    setPickerOpen(true);
    setLoading(true);
    setError(false);
    try {
      setGroups(await fetchMyGroups());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const closePicker = () => { if (!busy) setPickerOpen(false); };

  const choose = async (group: GroupSummary) => {
    if (isActive(group.id)) { closePicker(); return; }
    try {
      await activateCart(group.id, group.name);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      toast.show(t('banner.activated', { group: group.name }));
      setPickerOpen(false);
    } catch {
      toast.show(t('banner.switchError'), 'error');
    }
  };

  const turnOff = async () => {
    try {
      await deactivateCart();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toast.show(t('banner.deactivated'));
      setPickerOpen(false);
    } catch {
      toast.show(t('banner.deactivateError'), 'error');
    }
  };

  const renderGroup = ({ item }: { item: GroupSummary }) => {
    const active = isActive(item.id);
    return (
      <TouchableOpacity
        style={[styles.row, active && styles.rowActive]}
        onPress={() => choose(item)}
        disabled={busy}
        activeOpacity={0.85}
      >
        <View style={styles.rowMain}>
          <Text style={[styles.rowName, active && styles.rowNameActive]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.members.length > 0 && (
            <MemberAvatars members={item.members} size={24} maxVisible={4} />
          )}
        </View>
        {active ? (
          <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
        ) : (
          <Ionicons name="ellipse-outline" size={22} color={colors.inkFaint} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.banner,
          !activeCart && styles.bannerEmpty,
          topInset && { marginTop: bannerTop },
          rounded && styles.bannerRounded,
          compact && styles.bannerCompact,
        ]}
        onPress={openPicker}
        activeOpacity={0.85}
      >
        {compact ? (
          <View style={styles.compactIconStack}>
            <Ionicons name={activeCart ? 'cart' : 'cart-outline'} size={19} color={activeCart ? colors.accent : colors.inkSoft} />
            <Ionicons name="chevron-down" size={13} color={activeCart ? colors.accent : colors.inkSoft} />
          </View>
        ) : activeCart ? (
          <>
            <Ionicons name="cart" size={18} color={colors.accent} />
            <Text style={[styles.text, compact && styles.textCompact]} numberOfLines={1}>
              {compact || nameOnly ? (
                <Text style={styles.group}>{activeCart.groupName}</Text>
              ) : (
                <>{t('banner.addTo')} <Text style={styles.group}>{activeCart.groupName}</Text></>
              )}
            </Text>
          </>
        ) : (
          <>
            <Ionicons name="cart-outline" size={18} color={colors.inkSoft} />
            <Text style={[styles.emptyText, compact && styles.textCompact]} numberOfLines={1}>{t('banner.choose')}</Text>
          </>
        )}
        {!compact && (
          <Ionicons name="chevron-down" size={16} color={activeCart ? colors.accent : colors.inkSoft} />
        )}
      </TouchableOpacity>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={closePicker}>
        <View style={styles.root}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closePicker} />
          <View style={[styles.sheet, { paddingBottom: Platform.OS === 'ios' ? 30 : Math.max(insets.bottom, 20) }]}>
            <View style={styles.header}>
              <View style={styles.iconBox}>
                <Ionicons name="cart" size={22} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{t('banner.whichTitle')}</Text>
                <Text style={styles.subtitle}>{t('banner.whichSub')}</Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={closePicker} disabled={busy} hitSlop={8}>
                <Ionicons name="close" size={18} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color={colors.accent} style={{ marginVertical: 40 }} />
            ) : error ? (
              <View style={styles.centerBox}>
                <Text style={styles.muted}>{t('banner.loadGroupsError')}</Text>
                <TouchableOpacity onPress={openPicker}><Text style={styles.retry}>{t('common.retry')}</Text></TouchableOpacity>
              </View>
            ) : groups.length === 0 ? (
              <View style={styles.centerBox}>
                <Text style={styles.muted}>{t('banner.noGroups')}</Text>
              </View>
            ) : (
              <FlatList
                data={groups}
                keyExtractor={(g) => g.id}
                renderItem={renderGroup}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                ListFooterComponent={
                  activeCart ? (
                    <TouchableOpacity style={styles.offRow} onPress={turnOff} disabled={busy} activeOpacity={0.85}>
                      <Ionicons name="close-circle-outline" size={20} color={colors.inkSoft} />
                      <Text style={styles.offText}>{t('banner.deactivate')}</Text>
                    </TouchableOpacity>
                  ) : null
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const themedStyles = () => StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: colors.accentLight,
    borderWidth: 1, borderColor: colors.accentMid,
  },
  bannerEmpty: { backgroundColor: colors.white, borderColor: colors.border },
  bannerRounded: { borderRadius: 18 },
  // topInset (separación de la barra de estado) inline: useHeaderTopPadding(52)
  // En línea junto a un título: botón mínimo con carrito y flecha inferior.
  bannerCompact: {
    marginHorizontal: 0, marginBottom: 0,
    width: 44, height: 44,
    paddingHorizontal: 0, paddingVertical: 0,
    alignItems: 'center', justifyContent: 'center',
    gap: 0,
    flexShrink: 0, borderRadius: 18,
  },
  compactIconStack: { alignItems: 'center', justifyContent: 'center', gap: 0 },
  text: { flex: 1, fontSize: 13, fontFamily: fonts.medium, color: colors.ink },
  // Sin flex:1 para no estirarse; solo encoge si no cabe el nombre del grupo.
  textCompact: { flex: 0, flexShrink: 1 },
  group: { fontFamily: fonts.bold, color: colors.accent },
  emptyText: { flex: 1, fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft },

  // ── Hoja de selección ──────────────────────────────────────────
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopWidth: 1, borderTopColor: colors.ink,
    // paddingBottom inline: iOS 30 (como antes); Android, el inset del sistema.
    maxHeight: '75%',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  iconBox: {
    width: 44, height: 44,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 19, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.2 },
  subtitle: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  list: { paddingHorizontal: 16, paddingTop: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
  },
  rowActive: { backgroundColor: colors.accentLight, borderColor: colors.accentMid },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowName: { flex: 1, fontSize: 15, fontFamily: fonts.bold, color: colors.ink },
  rowNameActive: { color: colors.accent },
  offRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, marginTop: 8,
  },
  offText: { fontSize: 13.5, fontFamily: fonts.bold, color: colors.inkSoft },
  centerBox: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 36, gap: 12 },
  muted: { fontSize: 13.5, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },
  retry: { fontSize: 14, fontFamily: fonts.bold, color: colors.accent },
});
