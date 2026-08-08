/**
 * scheduler.js — Time Guardian notification scheduler
 *
 * Two notifications per item:
 *   1. leadMinutes before start  → "X min reminder"
 *   2. Exactly at start time     → "Starting now"
 *
 * expo-notifications requires a custom dev build (not Expo Go).
 * Set NOTIF_AVAILABLE = false to run in safe no-op stub mode.
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
const NOTIF_AVAILABLE = true;

// ─── Native module loader ─────────────────────────────────────────────────────

let _N = null;

async function getNative() {
  if (!NOTIF_AVAILABLE) return null;
  if (_N) return _N;
  try {
    _N = await import('expo-notifications');
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
      sound           : true,
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
  if (!N) return { granted: false, status: 'dev-build-required' };
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

/**
 * Build a Date for dateStr + timeStr, offset by offsetMinutes.
 * offsetMinutes = 0  → exact start time
 * offsetMinutes = -N → N minutes before start
 * Returns null if the resulting time is already in the past.
 */
function buildTriggerDate(dateStr, timeStr, offsetMinutes = 0) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const { h, m }   = parseTime(timeStr);
  const trigger    = new Date(y, mo - 1, d, h, m, 0, 0);
  if (offsetMinutes !== 0) {
    trigger.setMinutes(trigger.getMinutes() + offsetMinutes);
  }
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

// ─── Core: schedule a single notification ────────────────────────────────────

async function scheduleOne({ title, body, triggerDate, entityId, entityType, date }) {
  const N = await getNative();
  if (!N) {
    console.log(`[TG Notif] WOULD schedule: "${title}" at ${triggerDate.toLocaleString()}`);
    return `stub_${entityId}_${triggerDate.getTime()}`;
  }
  try {
    return await N.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound  : true,
        // data is available in the tap handler via response.notification.request.content.data
        data   : { entityId, entityType, date },
        ...(Platform.OS === 'android' && { channelId: CHANNEL_ID }),
      },
      trigger: { type: 'date', date: triggerDate },
    });
  } catch (e) {
    console.warn('[TG Notif] scheduleOne failed:', e?.message);
    return null;
  }
}

/**
 * Schedule BOTH notifications for one item on one date:
 *   - leadMinutes before start  (if leadMinutes > 0 and trigger is in the future)
 *   - Exactly at start time     (always attempted, skipped only if already past)
 *
 * Returns array of scheduled notification IDs (0, 1, or 2 entries).
 */
async function scheduleBoth({ title, startTime, dateStr, leadMinutes, entityId, entityType }) {
  const ids = [];

  if (leadMinutes > 0) {
    const leadTrigger = buildTriggerDate(dateStr, startTime, -leadMinutes);
    if (leadTrigger) {
      const id = await scheduleOne({
        title,
        body       : `Starting in ${leadMinutes} min — at ${startTime}`,
        triggerDate: leadTrigger,
        entityId,
        entityType,
        date       : dateStr,
      });
      if (id) ids.push(id);
    }
  }

  const startTrigger = buildTriggerDate(dateStr, startTime, 0);
  if (startTrigger) {
    const id = await scheduleOne({
      title,
      body       : `Starting now — ${startTime}`,
      triggerDate: startTrigger,
      entityId,
      entityType,
      date       : dateStr,
    });
    if (id) ids.push(id);
  }

  return ids;
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

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

  const allIds = [];
  for (const dateStr of dates) {
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    if (!block.days?.includes(dow)) continue;
    if (isDaySuppressed(dateStr, dayOverrides)) continue;

    const ids = await scheduleBoth({
      title      : `⏰ ${block.label}`,
      startTime  : block.start,
      dateStr,
      leadMinutes,
      entityId   : block.id,
    });
    allIds.push(...ids);
  }

  await setNotifIdsForEntity(block.id, allIds);
  return allIds;
}

// ─── Daily task reminders ─────────────────────────────────────────────────────

export async function scheduleDailyTaskReminder(task, leadMinutes, dayOverrides = {}) {
  await cancelReminder(task.id);
  if (task.reminder === false || !task.date || !task.time) return [];
  if (isDaySuppressed(task.date, dayOverrides)) return [];

  const ids = await scheduleBoth({
    title      : `📋 ${task.title}`,
    startTime  : task.time,
    dateStr    : task.date,
    leadMinutes,
    entityId   : task.id,
  });

  await setNotifIdsForEntity(task.id, ids);
  return ids;
}

// ─── Recurring task reminders ─────────────────────────────────────────────────

export async function scheduleRecurringTaskReminder(task, leadMinutes, dates, dayOverrides = {}) {
  await cancelReminder(task.id);
  if (!task.active || task.reminder === false || !task.time) return [];

  const allIds = [];
  for (const dateStr of dates) {
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    if (!task.days?.includes(dow)) continue;
    if (isDaySuppressed(dateStr, dayOverrides)) continue;

    const ids = await scheduleBoth({
      title      : `📋 ${task.title}`,
      startTime  : task.time,
      dateStr,
      leadMinutes,
      entityId   : task.id,
    });
    allIds.push(...ids);
  }

  await setNotifIdsForEntity(task.id, allIds);
  return allIds;
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
