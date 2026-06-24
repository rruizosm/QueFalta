/**
 * Notifications — local (Phase 1) + remote push (Phase 2).
 *
 * Local notifications work in Expo Go on SDK 54. Remote push needs a dev/prod
 * build: getExpoPushTokenAsync throws in Expo Go (SDK 53+), so the push helpers
 * below no-op there (and on web) and only the local toggle keeps working.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

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

// ── Remote push (Phase 2) ─────────────────────────────────────────────────────

/** True only in a real build: Expo Go (appOwnership 'expo') can't get a push
 *  token on SDK 53+, and web has no native push here. */
function pushSupported(): boolean {
  return Platform.OS !== 'web' && Constants.appOwnership !== 'expo';
}

/** EAS projectId — required by getExpoPushTokenAsync. */
function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId
  );
}

/**
 * Obtains this device's Expo push token and stores it in `push_tokens` for the
 * given user. Call once a session is available. Best-effort: any failure
 * (simulator, no permission, Expo Go, missing FCM on Android…) is swallowed so
 * it never blocks the app — the user simply won't receive remote push.
 */
export async function registerForPushNotificationsAsync(userId: string): Promise<void> {
  if (!pushSupported() || !userId) return;
  try {
    // Respeta la preferencia del usuario: si apagó las notificaciones, no
    // registramos el token (y por tanto no recibe push).
    if (!(await getNotificationsEnabled())) return;
    if (!(await hasPermission())) return;

    await ensureAndroidChannel();
    const id = projectId();
    if (!id) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!token) return;

    await supabase
      .from('push_tokens')
      .upsert(
        { user_id: userId, token, platform: Platform.OS, updated_at: new Date().toISOString() },
        { onConflict: 'token' },
      );
  } catch {
    // Sin token (simulador, sin permiso, Expo Go, Android sin FCM): la app sigue.
  }
}

/** Removes this device's token on logout so the user stops receiving push here. */
export async function unregisterPushNotificationsAsync(userId: string): Promise<void> {
  if (!pushSupported() || !userId) return;
  try {
    const id = projectId();
    if (!id) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!token) return;
    await supabase.from('push_tokens').delete().eq('user_id', userId).eq('token', token);
  } catch {
    // Best-effort.
  }
}

// ── Tap handling / deep-link ──────────────────────────────────────────────────

/** Payload that `send-push` puts in each notification's `data`, used to
 *  deep-link to the right screen when the user taps it. */
export type PushData = {
  type?: 'cart' | 'friend' | 'group_invite';
  groupId?: string;
};

function extractData(response: Notifications.NotificationResponse | null): PushData | null {
  const data = response?.notification.request.content.data;
  return data && typeof data === 'object' ? (data as PushData) : null;
}

/** Subscribes to taps on a notification (app foreground/background). */
export function addNotificationResponseListener(handler: (data: PushData) => void) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = extractData(response);
    if (data) handler(data);
  });
}

/** The tap that cold-launched the app, if any (handled once at startup). */
export async function getInitialNotificationData(): Promise<PushData | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  return extractData(response);
}
