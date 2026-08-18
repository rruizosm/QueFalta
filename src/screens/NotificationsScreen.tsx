import { useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useNotifications, type InboxNotification } from '../context/NotificationsContext';
import { renderNotification } from '../lib/notificationText';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import ProfileSubscreenHeader from '../components/ProfileSubscreenHeader';

const TYPE_META: Record<InboxNotification['type'], { icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  cart: { icon: 'cart', tint: '#2f6cb5' },
  group_invite: { icon: 'people', tint: '#3fa078' },
  friend: { icon: 'person-add', tint: '#7c5cd6' },
  general: { icon: 'notifications', tint: '#e0a02c' },
};

type Translate = (key: string, options?: Record<string, string | number>) => string;

function relativeTime(timestamp: number, t: Translate): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return t('notifications.now');
  if (minutes < 60) return t('notifications.minutesAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('notifications.hoursAgo', { n: hours });
  return t('notifications.daysAgo', { n: Math.floor(hours / 24) });
}

export default function NotificationsScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { items, remove, clearAll, markAllRead } = useNotifications();

  useEffect(() => { markAllRead(); }, [markAllRead]);

  const openFriends = () => navigation.navigate('Friends');
  const handleClearAll = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    clearAll();
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
      <ProfileSubscreenHeader title={t('notifications.title')} icon="notifications-outline" headerTop={headerTop} />
      {items.length === 0 ? (
        <View style={[styles.empty, { paddingTop: headerTop + 80 }]}>
          <Ionicons name="notifications-off-outline" size={42} color={colors.inkFaint} />
          <Text style={styles.emptyTitle}>{t('notifications.empty')}</Text>
          <Text style={styles.emptySub}>{t('notifications.emptySub')}</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingTop: headerTop + 58, paddingBottom: bottomPad }]}
        >
          {items.map((notification) => {
            const meta = TYPE_META[notification.type] ?? TYPE_META.general;
            const { title, body } = renderNotification(notification, t);
            return (
              <Pressable
                key={notification.id}
                style={styles.row}
                onPress={notification.type === 'friend' ? openFriends : undefined}
                disabled={notification.type !== 'friend'}
              >
                <View style={[styles.rowIcon, { backgroundColor: meta.tint + '22' }]}>
                  <Ionicons name={meta.icon} size={18} color={meta.tint} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{title}</Text>
                  {body ? <Text style={styles.rowText} numberOfLines={3}>{body}</Text> : null}
                  <Text style={styles.rowTime}>{relativeTime(notification.createdAt, t)}</Text>
                </View>
                {notification.type === 'friend' ? (
                  <TouchableOpacity onPress={openFriends} style={styles.actionBtn} accessibilityRole="button" accessibilityLabel={t('notifications.a11yOpenFriend')}>
                    <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); remove(notification.id); }}
                  style={styles.actionBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t('notifications.a11yDelete')}
                >
                  <Ionicons name="close" size={18} color={colors.inkFaint} />
                </TouchableOpacity>
              </Pressable>
            );
          })}
          <TouchableOpacity onPress={handleClearAll} style={styles.clearAll} accessibilityRole="button">
            <Text style={styles.clearAllText}>{t('notifications.clearAll')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  listContent: { paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  rowIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.ink, lineHeight: 18 },
  rowText: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2, lineHeight: 17 },
  rowTime: { fontSize: 11, fontFamily: fonts.medium, color: colors.inkFaint, marginTop: 4 },
  actionBtn: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  clearAll: { alignItems: 'center', paddingVertical: 14 },
  clearAllText: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.accent },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 40, paddingBottom: 60 },
  emptyTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.ink, marginTop: 4 },
  emptySub: { fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },
});
