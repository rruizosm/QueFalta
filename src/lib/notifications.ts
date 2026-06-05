/**
 * Notifications — Phase 1 (local notifications only).
 *
 * Works in Expo Go on SDK 54: OS permission flow, an Android channel, and
 * scheduling local notifications. Remote push (getExpoPushTokenAsync) is NOT
 * available in Expo Go and is intentionally left for Phase 2 (dev build).
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const PREF_KEY = '@notifications_enabled';
const ANDROID_CHANNEL_ID = 'default';

/** Show banners/list even when the app is in the foreground. Call once at startup. */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** Android requires a channel before notifications display reliably. */
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'General',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
  });
}

/** True if the OS has already granted notification permission. */
export async function hasPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/** Prompts the user for permission. Returns whether it ended up granted. */
export async function requestPermission(): Promise<boolean> {
  await ensureAndroidChannel();
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** Fires a local notification immediately — handy to confirm the wiring works. */
export async function sendTestNotification() {
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Notificaciones activadas ✅',
      body: 'Así recibirás avisos de tus grupos y carritos.',
    },
    trigger: null,
  });
}

// ── Persisted preference ────────────────────────────────────────────────────
export async function getNotificationsEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(PREF_KEY);
  return raw === 'true';
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(PREF_KEY, enabled ? 'true' : 'false');
}
