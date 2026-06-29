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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
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
        </View>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={42} color={colors.inkFaint} />
            <Text style={styles.emptyTitle}>{t('notifications.empty')}</Text>
            <Text style={styles.emptySub}>{t('notifications.emptySub')}</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 16 }]}
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
      </View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  closeBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
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
