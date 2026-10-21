import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { t } from '../i18n';
import { getNotificationsEnabled, hasPermission } from './notifications';
import { readPantryLayout } from './pantryStorage';
import { isPantryExpiryDate, type PantryItem, type PantrySection } from './pantryLayout';

const SCHEDULES_KEY = '@pantry_expiry_notifications';
const ANDROID_CHANNEL_ID = 'default';

type TrackedSchedule = { notificationId: string; expiryDate: string; notifyAt: number };
type ScheduleMap = Record<string, TrackedSchedule>;
type ExpiryRequestData = {
  type?: unknown;
  userId?: unknown;
  notificationKey?: unknown;
  expiryDate?: unknown;
};

const syncQueue = new Map<string, Promise<void>>();

function storageKey(userId: string): string {
  return `${SCHEDULES_KEY}:${userId}`;
}

function notificationKey(section: PantrySection, instanceId: string): string {
  return `${section}:${instanceId}`;
}

function decodeScheduleMap(value: string | null): ScheduleMap {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([key, entry]) => {
      if (!entry || typeof entry !== 'object') return [];
      const schedule = entry as Partial<TrackedSchedule>;
      if (typeof schedule.notificationId !== 'string' || !isPantryExpiryDate(schedule.expiryDate)
        || typeof schedule.notifyAt !== 'number' || !Number.isFinite(schedule.notifyAt)) return [];
      return [[key, schedule as TrackedSchedule]];
    }));
  } catch {
    return {};
  }
}

function scheduledData(request: Notifications.NotificationRequest): ExpiryRequestData {
  return (request.content.data ?? {}) as ExpiryRequestData;
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function threeDaysBeforeAtNine(expiryDate: string): Date {
  const [year, month, day] = expiryDate.split('-').map(Number);
  const date = new Date(year, month - 1, day, 9, 0, 0, 0);
  date.setDate(date.getDate() - 3);
  return date;
}

async function cancelRequest(request: Notifications.NotificationRequest): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => {});
}

async function reconcile(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const [enabled, permitted, pantry, fridge, rawTracked] = await Promise.all([
    getNotificationsEnabled(userId),
    hasPermission(),
    readPantryLayout(userId, 'pantry'),
    readPantryLayout(userId, 'fridge'),
    AsyncStorage.getItem(storageKey(userId)),
  ]);
  const tracked = decodeScheduleMap(rawTracked);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const userSchedules = scheduled.filter((request) => {
    const data = scheduledData(request);
    return data.type === 'pantry_expiry' && data.userId === userId;
  });

  if (!enabled || !permitted) {
    await Promise.all(userSchedules.map(cancelRequest));
    await AsyncStorage.setItem(storageKey(userId), '{}');
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'General',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const desired = new Map<string, { section: PantrySection; item: PantryItem }>();
  for (const [section, items] of [['pantry', pantry.items], ['fridge', fridge.items]] as const) {
    for (const item of items) {
      if (!isPantryExpiryDate(item.expiryDate) || item.expiryDate < localDateKey()) continue;
      desired.set(notificationKey(section, item.instanceId), { section, item });
    }
  }

  const activeSchedules: Notifications.NotificationRequest[] = [];
  for (const request of userSchedules) {
    const data = scheduledData(request);
    const key = typeof data.notificationKey === 'string' ? data.notificationKey : '';
    const target = desired.get(key);
    if (!target || target.item.expiryDate !== data.expiryDate) {
      await cancelRequest(request);
      continue;
    }
    activeSchedules.push(request);
  }

  for (const key of Object.keys(tracked)) {
    const target = desired.get(key);
    if (!target || tracked[key].expiryDate !== target.item.expiryDate) delete tracked[key];
  }

  for (const [key, { section, item }] of desired) {
    const matching = activeSchedules.filter((request) => {
      const data = scheduledData(request);
      return data.notificationKey === key && data.expiryDate === item.expiryDate;
    });
    const current = matching[0];

    for (const request of matching) {
      if (request !== current) await cancelRequest(request);
    }

    if (current) {
      tracked[key] = {
        notificationId: current.identifier,
        expiryDate: item.expiryDate!,
        notifyAt: tracked[key]?.expiryDate === item.expiryDate
          ? tracked[key].notifyAt : threeDaysBeforeAtNine(item.expiryDate!).getTime(),
      };
      continue;
    }

    const previous = tracked[key];
    const notifyAt = threeDaysBeforeAtNine(item.expiryDate!).getTime();
    if (previous?.expiryDate === item.expiryDate && previous.notifyAt <= Date.now()) {
      // A missing schedule with an elapsed trigger means the one-shot reminder
      // has already fired; keep it from returning every time the pantry opens.
      continue;
    }

    const isLate = notifyAt <= Date.now();
    const title = isLate ? t('notifications.expirySoonTitle') : t('notifications.expiryTitle');
    const body = isLate
      ? t('notifications.expirySoonBody', { product: item.product.name })
      : t('notifications.expiryBody', { product: item.product.name });
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'pantry_expiry',
          userId,
          notificationKey: key,
          section,
          instanceId: item.instanceId,
          expiryDate: item.expiryDate,
        },
      },
      trigger: isLate ? null : {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(notifyAt),
      },
    });
    tracked[key] = {
      notificationId: identifier,
      expiryDate: item.expiryDate!,
      notifyAt: isLate ? Date.now() : notifyAt,
    };
  }

  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(tracked));
}

/** Keep one local reminder per saved item, account and device. */
export function syncPantryExpiryNotifications(userId: string): Promise<void> {
  if (!userId || Platform.OS === 'web') return Promise.resolve();
  const previous = syncQueue.get(userId) ?? Promise.resolve();
  let current: Promise<void>;
  current = previous.catch(() => {}).then(() => reconcile(userId)).catch(() => {}).finally(() => {
    if (syncQueue.get(userId) === current) syncQueue.delete(userId);
  });
  syncQueue.set(userId, current);
  return current;
}
