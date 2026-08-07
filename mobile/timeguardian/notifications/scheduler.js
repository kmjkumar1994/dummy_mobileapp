/**
 * scheduler.js — Time Guardian notification scheduler
 *
 * expo-notifications requires a custom dev build — it is NOT available in Expo Go.
 *
 * HOW TO ENABLE REAL NOTIFICATIONS:
 *   1. Run:  npx expo prebuild  (or use EAS Build)
 *   2. Run:  npx expo run:android  (or run:ios)
 *   3. Ensure NOTIF_AVAILABLE = true below (already set).
 *
 * Fixes applied:
 *   - setNotificationHandler registered on first load (required for delivery)
 *   - trigger uses { type: 'date', date } — explicit type required in v0.20+
 *   - sound: true (boolean) on both channel and content — not the string 'default'
 *   - enableLights + enableVibrate on Android channel
 */

import { Platform } from 'react-native';
import {
  getCustomBlocks,
  getRecurringTasks,
  getDailyTasks,
  getDayOverrides,
  getNotifPrefs,
  getNotifIds,
  saveNotifIds,
  setNotifIdsForEntity,
} from '../storage/repository';

// ─── Feature flag ─────────────────────────────────────────────────────────────
// true  = custom dev build (expo run:android / EAS Build) — real notifications
// false = Expo Go — all calls no-op safely, preferences still persist in storage
const NOTIF_AVAILABLE = true;

// ─── Native module loader ─────────────────────────────────────────────────────

let _N = null;

async function getNative() {
  if (!NOTIF_AVAILABLE) return null;
  if (_N) return _N;
  try {
    _N = await import('expo-notifications');

    // REQUIRED: without this Android silently drops every notification.
    // Must be set once before any scheduleNotificationAsync call.
    _N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert : true,
        shouldPlaySound : true,
        shouldSetBadge  : false,
      }),
    });

    return _N;
  } catch (e) {
    console.warn('[TG Notif] expo-notifications unavailable:', e?.message);
    return null;
  }
}

// ─── Android channel ──────────────────────────────────────────────────────────

const CHANNEL_ID = 'tg-reminders';

export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  const N = await getNative();
  if (!N) return;
  try {
    await N.setNotificationChannelAsync(CHANNEL_ID, {
      name            : 'Time Guardian Reminders',
      importance      : N.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor      : '#C9A227',
      sound           : true,   // boolean true = default system sound
      enableLights    : true,
      enableVibrate   : true,
    });
  } catch (e) {
    console.warn('[TG Notif] ensureAndroidChannel:', e?.message);
  }
}

// ─── Permissions ──────────────────────────────────────────────────────────────

export async function requestPermissions() {
  const N = await getNative();
  if (!N) {
    console.log('[TG Notif] requestPermissions: dev build required');
    return { granted: false, status: 'dev-build-required' };
  }
  try {
    await ensureAndroidChannel();
    const { status } = await N.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return { granted: status === 'granted', status };
  } catch (e) {
    console.warn('[TG Notif] requestPermissions:', e?.message);
    return { granted: false, status: 'error' };
  }
}

export async function checkPermissions() {
  const N = await getNative();
  if (!N) return { granted: false, status: 'dev-build-required' };
  try {
    const { status } = await N.getPermissionsAsync();
    return { granted: status === 'granted', status };
  } catch (e) {
    console.warn('[TG Notif] checkPermissions:', e?.message);
    return { granted: false, status: 'error' };
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseTime(timeStr) {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  return { h, m };
}

function buildTriggerDate(dateStr, timeStr, leadMinutes) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const { h, m }   = parseTime(timeStr);
  const trigger    = new Date(y, mo - 1, d, h, m, 0, 0);
  trigger.setMinutes(trigger.getMinutes() - leadMinutes);
  return trigger > new Date() ? trigger : null;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function next14Days() {
  const results = [];
  const cursor  = new Date();
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    results.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
}

// ─── Override guard ───────────────────────────────────────────────────────────

const SUPPRESSED_TYPES = new Set(['leave', 'health']);

function isDaySuppressed(dateStr, dayOverrides) {
  const ov = dayOverrides?.[dateStr];
  return ov ? SUPPRESSED_TYPES.has(ov.type) : false;
}

// ─── Core schedule / cancel ───────────────────────────────────────────────────

async function scheduleOne({ title, body, triggerDate, entityId }) {
  const N = await getNative();
  if (!N) {
    const fakeId = `stub_${entityId}_${triggerDate.getTime()}`;
    console.log(`[TG Notif] WOULD schedule: "${title}" at ${triggerDate.toLocaleString()}`);
    return fakeId;
  }
  try {
    return await N.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound  : true,   // boolean true = default system sound on both platforms
        data   : { entityId },
        ...(Platform.OS === 'android' && { channelId: CHANNEL_ID }),
      },
      trigger: {
        type: 'date',    // explicit type required in expo-notifications v0.20+
        date: triggerDate,
      },
    });
  } catch (e) {
    console.warn('[TG Notif] scheduleOne failed:', e?.message);
    return null;
  }
}

export async function cancelReminder(entityId) {
  const N = await getNative();
  try {
    const map = await getNotifIds();
    const ids = map[entityId] || [];
    if (N) {
      await Promise.all(ids.map((id) => N.cancelScheduledNotificationAsync(id).catch(() => {})));
    }
    delete map[entityId];
    await saveNotifIds(map);
  } catch (e) {
    console.warn('[TG Notif] cancelReminder failed:', e?.message);
  }
}

export async function cancelAllReminders() {
  const N = await getNative();
  try {
    const map = await getNotifIds();
    const ids = Object.values(map).flat();
    if (N) {
      await Promise.all(ids.map((id) => N.cancelScheduledNotificationAsync(id).catch(() => {})));
    }
    await saveNotifIds({});
  } catch (e) {
    console.warn('[TG Notif] cancelAllReminders failed:', e?.message);
  }
}

// ─── Block reminders ──────────────────────────────────────────────────────────

export async function scheduleBlockReminder(block, leadMinutes, dates, dayOverrides = {}) {
  await cancelReminder(block.id);
  if (!block.active || block.reminder === false) return [];

  const newIds = [];
  for (const dateStr of dates) {
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    if (!block.days?.includes(dow)) continue;
    if (isDaySuppressed(dateStr, dayOverrides)) continue;
    const triggerDate = buildTriggerDate(dateStr, block.start, leadMinutes);
    if (!triggerDate) continue;
    const id = await scheduleOne({
      title      : `⏰ ${block.label}`,
      body       : `Starting at ${block.start} — ${leadMinutes} min reminder`,
      triggerDate,
      entityId   : block.id,
    });
    if (id) newIds.push(id);
  }
  await setNotifIdsForEntity(block.id, newIds);
  return newIds;
}

// ─── Daily task reminders ─────────────────────────────────────────────────────

export async function scheduleDailyTaskReminder(task, leadMinutes, dayOverrides = {}) {
  await cancelReminder(task.id);
  if (task.reminder === false || !task.date || !task.time) return [];
  if (isDaySuppressed(task.date, dayOverrides)) return [];

  const triggerDate = buildTriggerDate(task.date, task.time, leadMinutes);
  if (!triggerDate) return [];

  const id = await scheduleOne({
    title      : `📋 ${task.title}`,
    body       : `Task at ${task.time} — ${leadMinutes} min reminder`,
    triggerDate,
    entityId   : task.id,
  });
  const ids = id ? [id] : [];
  await setNotifIdsForEntity(task.id, ids);
  return ids;
}

// ─── Recurring task reminders ─────────────────────────────────────────────────

export async function scheduleRecurringTaskReminder(task, leadMinutes, dates, dayOverrides = {}) {
  await cancelReminder(task.id);
  if (!task.active || task.reminder === false || !task.time) return [];

  const newIds = [];
  for (const dateStr of dates) {
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    if (!task.days?.includes(dow)) continue;
    if (isDaySuppressed(dateStr, dayOverrides)) continue;
    const triggerDate = buildTriggerDate(dateStr, task.time, leadMinutes);
    if (!triggerDate) continue;
    const id = await scheduleOne({
      title      : `📋 ${task.title}`,
      body       : `Task at ${task.time} — ${leadMinutes} min reminder`,
      triggerDate,
      entityId   : task.id,
    });
    if (id) newIds.push(id);
  }
  await setNotifIdsForEntity(task.id, newIds);
  return newIds;
}

// ─── Full resync ──────────────────────────────────────────────────────────────

export async function resyncAllReminders(prefsOverride = null) {
  try {
    const prefs = prefsOverride || await getNotifPrefs();

    if (!prefs.enabled) {
      await cancelAllReminders();
      return;
    }

    const { granted } = await checkPermissions();
    if (!granted && NOTIF_AVAILABLE) {
      await cancelAllReminders();
      return;
    }

    await ensureAndroidChannel();

    const [blocks, recurringTasks, dailyTasks, dayOverrides] = await Promise.all([
      getCustomBlocks(),
      getRecurringTasks(),
      getDailyTasks(),
      getDayOverrides(),
    ]);

    const lead  = prefs.leadMinutes ?? 10;
    const dates = next14Days();
    const today = todayISO();

    await cancelAllReminders();

    for (const block of blocks) {
      if (!block.active || block.reminder === false) continue;
      await scheduleBlockReminder(block, lead, dates, dayOverrides);
    }

    for (const task of recurringTasks) {
      if (!task.active || task.reminder === false) continue;
      await scheduleRecurringTaskReminder(task, lead, dates, dayOverrides);
    }

    const futureTasks = dailyTasks.filter((t) => t.date >= today && t.reminder !== false);
    for (const task of futureTasks) {
      await scheduleDailyTaskReminder(task, lead, dayOverrides);
    }

  } catch (e) {
    console.warn('[TG Notif] resyncAllReminders error:', e?.message);
  }
}
