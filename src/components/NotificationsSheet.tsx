import { useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useNotifications, type InboxNotification } from '../context/NotificationsContext';
import { renderNotification } from '../lib/notificationText';
import GlassSurface from './GlassSurface';

interface Props {
  visible: boolean;
  onClose: () => void;
}

// Icono + color por tipo de aviso (el fondo es el mismo color al ~13% de alfa).
const TYPE_META: Record<InboxNotification['type'], { icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  cart: { icon: 'cart', tint: '#2f6cb5' },
  group_invite: { icon: 'people', tint: '#3fa078' },
  friend: { icon: 'person-add', tint: '#7c5cd6' },
  general: { icon: 'notifications', tint: '#e0a02c' },
};

type Translate = (k: string, o?: Record<string, string | number>) => string;

function relTime(ts: number, t: Translate): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return t('notifications.now');
  if (m < 60) return t('notifications.minutesAgo', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('notifications.hoursAgo', { n: h });
  return t('notifications.daysAgo', { n: Math.floor(h / 24) });
}

export default function NotificationsSheet({ visible, onClose }: Props) {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { items, remove, clearAll, markAllRead } = useNotifications();

  // Al abrir, marca todo como leído (apaga la insignia de la campana y la pestaña).
  useEffect(() => { if (visible) markAllRead(); }, [visible, markAllRead]);

  const handleRemove = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    remove(id);
  };

  const handleClearAll = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    clearAll();
  };

  // Alto reservado bajo la cabecera flotante (área segura + fila de 38 + aire).
  const headerPad = insets.top + 64;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

        {items.length === 0 ? (
          <View style={[styles.empty, { paddingTop: headerPad }]}>
            <Ionicons name="notifications-off-outline" size={42} color={colors.inkFaint} />
            <Text style={styles.emptyTitle}>{t('notifications.empty')}</Text>
            <Text style={styles.emptySub}>{t('notifications.emptySub')}</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={[styles.listContent, { paddingTop: headerPad, paddingBottom: insets.bottom + 16 }]}
            showsVerticalScrollIndicator={false}
          >
            {items.map((n) => {
              const meta = TYPE_META[n.type] ?? TYPE_META.general;
              const { title, body } = renderNotification(n, t);
              return (
                <View key={n.id} style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: meta.tint + '22' }]}>
                    <Ionicons name={meta.icon} size={18} color={meta.tint} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={2}>{title}</Text>
                    {body ? <Text style={styles.rowText} numberOfLines={3}>{body}</Text> : null}
                    <Text style={styles.rowTime}>{relTime(n.createdAt, t)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRemove(n.id)}
                    style={styles.rowDelete}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={t('notifications.a11yDelete')}
                  >
                    <Ionicons name="close" size={18} color={colors.inkFaint} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Cabecera de CRISTAL flotante (iOS 26): el listado scrollea por debajo
            y se refracta. Va al final del árbol para renderse ENCIMA. En
            fallback = barra opaca de papel, idéntica a antes. */}
        <GlassSurface style={[styles.header, { paddingTop: insets.top + 6 }]} fallbackColor={colors.paper}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('notifications.title')}</Text>
          {items.length > 0 ? (
            <TouchableOpacity onPress={handleClearAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearAll}>{t('notifications.clearAll')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </GlassSurface>
      </View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },

  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    overflow: 'hidden',
  },
  // Sobre la cabecera de cristal el botón va sin caja (solo icono).
  closeBtn: {
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
  },
  headerSpacer: { width: 38 },
  title: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink },
  clearAll: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.accent },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingTop: 6 },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, borderRadius: 14,
    padding: 12, marginBottom: 8,
  },
  rowIcon: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.ink, lineHeight: 18 },
  rowText: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2, lineHeight: 17 },
  rowTime: { fontSize: 11, fontFamily: fonts.medium, color: colors.inkFaint, marginTop: 4 },
  rowDelete: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 40, paddingBottom: 60 },
  emptyTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.ink, marginTop: 4 },
  emptySub: { fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },
});
