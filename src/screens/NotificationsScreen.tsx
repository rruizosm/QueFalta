import { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
  View,
  Text,
  ScrollView,
  Switch,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import {
  getNotificationsEnabled,
  hasPermission,
  registerForPushNotificationsAsync,
  requestPermission,
  sendTestNotification,
  setNotificationsEnabled,
  unregisterPushNotificationsAsync,
} from '../lib/notifications';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import ProfileSubscreenHeader from '../components/ProfileSubscreenHeader';

const NOTIFICATION_TYPES: {
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  bodyKey: string;
}[] = [
  { icon: 'cart-outline', titleKey: 'notifications.types.cartTitle', bodyKey: 'notifications.types.cartBody' },
  { icon: 'person-add-outline', titleKey: 'notifications.types.friendTitle', bodyKey: 'notifications.types.friendBody' },
  { icon: 'people-outline', titleKey: 'notifications.types.groupTitle', bodyKey: 'notifications.types.groupBody' },
  { icon: 'pricetag-outline', titleKey: 'notifications.types.priceAlertTitle', bodyKey: 'notifications.types.priceAlertBody' },
];

export default function NotificationsScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [enabled, setEnabled] = useState(false);
  const [preferenceLoading, setPreferenceLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setPreferenceLoading(true);
      Promise.all([
        getNotificationsEnabled(userId),
        hasPermission(),
      ])
        .then(([preferred, permitted]) => {
          if (active) setEnabled(preferred && permitted);
        })
        .catch(() => {
          if (active) setEnabled(false);
        })
        .finally(() => {
          if (active) setPreferenceLoading(false);
        });
      return () => { active = false; };
    }, [userId]),
  );

  const handleNotificationToggle = async (nextEnabled: boolean) => {
    if (!userId || preferenceLoading) return;
    const previous = enabled;
    setPreferenceLoading(true);

    try {
      if (!nextEnabled) {
        await setNotificationsEnabled(userId, false);
        setEnabled(false);
        await unregisterPushNotificationsAsync(userId);
        Haptics.selectionAsync();
        return;
      }

      const permitted = (await hasPermission()) || (await requestPermission());
      if (!permitted) {
        await setNotificationsEnabled(userId, false);
        setEnabled(false);
        await unregisterPushNotificationsAsync(userId);
        Alert.alert(
          t('notifications.permissionTitle'),
          t('notifications.permissionBody'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('notifications.openSettings'),
              onPress: () => { Linking.openSettings().catch(() => {}); },
            },
          ],
        );
        return;
      }

      await setNotificationsEnabled(userId, true);
      setEnabled(true);
      await registerForPushNotificationsAsync(userId);
      sendTestNotification().catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setEnabled(previous);
      Alert.alert(t('notifications.errorTitle'), t('notifications.errorBody'));
    } finally {
      setPreferenceLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
      <ProfileSubscreenHeader title={t('notifications.title')} icon="notifications-outline" headerTop={headerTop} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingTop: headerTop + 58, paddingBottom: bottomPad }]}
      >
        <View style={styles.settingCard}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>{t('notifications.toggleTitle')}</Text>
          </View>
          <Switch
            value={enabled}
            disabled={preferenceLoading || !userId}
            onValueChange={handleNotificationToggle}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor={colors.white}
            accessibilityLabel={t('notifications.toggleA11y')}
          />
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{t('notifications.infoTitle')}</Text>
          {NOTIFICATION_TYPES.map((type, index) => (
            <View
              key={type.titleKey}
              style={[styles.infoRow, index < NOTIFICATION_TYPES.length - 1 && styles.infoRowBorder]}
            >
              <View style={styles.infoIcon}>
                <Ionicons name={type.icon} size={18} color={colors.accent} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={styles.infoRowTitle}>{t(type.titleKey)}</Text>
                <Text style={styles.infoRowBody}>{t(type.bodyKey)}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.infoFootnote}>{t('notifications.infoFootnote')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  listContent: { paddingHorizontal: 14 },
  settingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, padding: 14,
  },
  settingCopy: { flex: 1, minWidth: 0 },
  settingTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.ink },
  infoCard: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12,
    marginTop: 12,
  },
  infoTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.ink },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  infoIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
  infoCopy: { flex: 1, minWidth: 0 },
  infoRowTitle: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.ink },
  infoRowBody: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, lineHeight: 16, marginTop: 1 },
  infoFootnote: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkFaint, lineHeight: 16, marginTop: 5 },
});
