/**
 * repository.js
 * Added: DailyTask CRUD — one-off and recurring tasks inside days.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  ROTATION_ANCHOR    : 'tg:rotationAnchor',
  CUSTOM_BLOCKS      : 'tg:customBlocks',
  LOG_ENTRIES        : 'tg:logEntries',
  ENERGY_ENTRIES     : 'tg:energyEntries',
  WORK_HOURS         : 'tg:workHours',
  ROTATION_SCHEDULE  : 'tg:rotationSchedule',
  SCHEDULE_CHANGE_LOG: 'tg:scheduleChangeLog',
  DAILY_TASKS        : 'tg:dailyTasks',
  RECURRING_TASKS    : 'tg:recurringTasks',
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CUSTOM_BLOCKS = [
  { id: 'tg_default_1', label: 'Health check-in / exercise', category: 'self', type: 'protected', days: [1,3,5], start: '07:00', end: '07:45', active: true },
  { id: 'tg_default_2', label: 'Reading / course work',      category: 'self', type: 'soft',      days: [2,4],   start: '20:30', end: '21:15', active: true },
  { id: 'tg_default_3', label: 'Finance and digital tidy-up',category: 'self', type: 'soft',      days: [6],     start: '08:00', end: '08:45', active: true },
];

export const DEFAULT_WORK_HOURS = {
  workStart  : '10:00',
  workEnd    : '19:00',
  overtimeEnd: '23:00',
};

export const DEFAULT_ROTATION_SCHEDULE = [
  { index: 0, sundayLabel: "Mother's home visit",    sundayStart: '09:00', sundayEnd: '18:00', sundayCategory: 'family',    hasSaturday: false },
  { index: 1, sundayLabel: 'Wife outing',            sundayStart: '09:00', sundayEnd: '18:00', sundayCategory: 'family',    hasSaturday: false },
  { index: 2, sundayLabel: 'Rest / friends time',    sundayStart: '09:00', sundayEnd: '18:00', sundayCategory: 'self',      hasSaturday: false },
  { index: 3, sundayLabel: 'Karmayoga field service',sundayStart: '08:00', sundayEnd: '18:00', sundayCategory: 'karmayoga', hasSaturday: true,
    saturdayLabel: 'Karmayoga field service', saturdayStart: '08:00', saturdayEnd: '18:00', saturdayCategory: 'karmayoga' },
];

// ─── RotationAnchor ───────────────────────────────────────────────────────────

export async function getRotationAnchor() {
  try { const v = await AsyncStorage.getItem(KEYS.ROTATION_ANCHOR); return v ? JSON.parse(v) : null; }
  catch { return null; }
}
export async function setRotationAnchor(anchorDate) {
  try { await AsyncStorage.setItem(KEYS.ROTATION_ANCHOR, JSON.stringify({ anchor_date: anchorDate })); return true; }
  catch { return false; }
}

// ─── Work Hours ───────────────────────────────────────────────────────────────

export async function getWorkHours() {
  try { const v = await AsyncStorage.getItem(KEYS.WORK_HOURS); return v ? JSON.parse(v) : DEFAULT_WORK_HOURS; }
  catch { return DEFAULT_WORK_HOURS; }
}
export async function saveWorkHours(workHours) {
  try { await AsyncStorage.setItem(KEYS.WORK_HOURS, JSON.stringify(workHours)); return true; }
  catch { return false; }
}

// ─── Rotation Schedule ────────────────────────────────────────────────────────

export async function getRotationSchedule() {
  try { const v = await AsyncStorage.getItem(KEYS.ROTATION_SCHEDULE); return v ? JSON.parse(v) : DEFAULT_ROTATION_SCHEDULE; }
  catch { return DEFAULT_ROTATION_SCHEDULE; }
}
export async function saveRotationSchedule(schedule) {
  try { await AsyncStorage.setItem(KEYS.ROTATION_SCHEDULE, JSON.stringify(schedule)); return true; }
  catch { return false; }
}
export async function updateRotationSlot(index, changes) {
  const schedule = await getRotationSchedule();
  return saveRotationSchedule(schedule.map((s) => (s.index === index ? { ...s, ...changes } : s)));
}

// ─── Schedule Change Log ──────────────────────────────────────────────────────

export async function getScheduleChangeLog() {
  try { const v = await AsyncStorage.getItem(KEYS.SCHEDULE_CHANGE_LOG); return v ? JSON.parse(v) : []; }
  catch { return []; }
}
export async function addScheduleChangeLog(field, oldValue, newValue, reason) {
  try {
    const log   = await getScheduleChangeLog();
    const entry = { id: `tg_scl_${Date.now()}`, field, oldValue, newValue, reason, changedAt: new Date().toISOString() };
    await AsyncStorage.setItem(KEYS.SCHEDULE_CHANGE_LOG, JSON.stringify([entry, ...log]));
    return entry;
  } catch { return null; }
}

// ─── CustomBlocks ─────────────────────────────────────────────────────────────

export async function getCustomBlocks() {
  try {
    const v = await AsyncStorage.getItem(KEYS.CUSTOM_BLOCKS);
    if (v) return JSON.parse(v);
    await AsyncStorage.setItem(KEYS.CUSTOM_BLOCKS, JSON.stringify(DEFAULT_CUSTOM_BLOCKS));
    return DEFAULT_CUSTOM_BLOCKS;
  } catch { return DEFAULT_CUSTOM_BLOCKS; }
}
export async function saveCustomBlocks(blocks) {
  try { await AsyncStorage.setItem(KEYS.CUSTOM_BLOCKS, JSON.stringify(blocks)); return true; }
  catch { return false; }
}
export async function addCustomBlock(block) {
  return saveCustomBlocks([...await getCustomBlocks(), { ...block, id: `tg_cb_${Date.now()}`, active: true }]);
}
export async function updateCustomBlock(id, changes) {
  return saveCustomBlocks((await getCustomBlocks()).map((b) => (b.id === id ? { ...b, ...changes } : b)));
}
export async function deleteCustomBlock(id) {
  return saveCustomBlocks((await getCustomBlocks()).filter((b) => b.id !== id));
}
export async function toggleCustomBlockActive(id) {
  return saveCustomBlocks((await getCustomBlocks()).map((b) => (b.id === id ? { ...b, active: !b.active } : b)));
}

// ─── DailyTasks (one-off tasks for a specific date) ──────────────────────────

/**
 * DailyTask shape:
 * {
 *   id, title, date (YYYY-MM-DD), time (HH:MM),
 *   duration (minutes, optional), category,
 *   note, done, protected
 * }
 */

export async function getDailyTasks() {
  try { const v = await AsyncStorage.getItem(KEYS.DAILY_TASKS); return v ? JSON.parse(v) : []; }
  catch { return []; }
}

export async function getDailyTasksForDate(date) {
  const all = await getDailyTasks();
  return all.filter((t) => t.date === date).sort((a, b) => (a.time < b.time ? -1 : 1));
}

export async function addDailyTask(task) {
  try {
    const tasks   = await getDailyTasks();
    const newTask = { id: `tg_dt_${Date.now()}`, done: false, protected: false, ...task };
    await AsyncStorage.setItem(KEYS.DAILY_TASKS, JSON.stringify([...tasks, newTask]));
    return newTask;
  } catch { return null; }
}

export async function updateDailyTask(id, changes) {
  try {
    const tasks   = await getDailyTasks();
    const updated = tasks.map((t) => (t.id === id ? { ...t, ...changes } : t));
    await AsyncStorage.setItem(KEYS.DAILY_TASKS, JSON.stringify(updated));
    return true;
  } catch { return false; }
}

export async function deleteDailyTask(id) {
  try {
    const tasks = await getDailyTasks();
    await AsyncStorage.setItem(KEYS.DAILY_TASKS, JSON.stringify(tasks.filter((t) => t.id !== id)));
    return true;
  } catch { return false; }
}

// ─── RecurringTasks (repeat on selected weekdays) ─────────────────────────────

/**
 * RecurringTask shape:
 * {
 *   id, title, days ([0..6]), time (HH:MM),
 *   duration (minutes, optional), category,
 *   note, protected, active
 * }
 */

export async function getRecurringTasks() {
  try { const v = await AsyncStorage.getItem(KEYS.RECURRING_TASKS); return v ? JSON.parse(v) : []; }
  catch { return []; }
}

export async function addRecurringTask(task) {
  try {
    const tasks   = await getRecurringTasks();
    const newTask = { id: `tg_rt_${Date.now()}`, done: false, protected: false, active: true, ...task };
    await AsyncStorage.setItem(KEYS.RECURRING_TASKS, JSON.stringify([...tasks, newTask]));
    return newTask;
  } catch { return null; }
}

export async function updateRecurringTask(id, changes) {
  try {
    const tasks   = await getRecurringTasks();
    const updated = tasks.map((t) => (t.id === id ? { ...t, ...changes } : t));
    await AsyncStorage.setItem(KEYS.RECURRING_TASKS, JSON.stringify(updated));
    return true;
  } catch { return false; }
}

export async function deleteRecurringTask(id) {
  try {
    const tasks = await getRecurringTasks();
    await AsyncStorage.setItem(KEYS.RECURRING_TASKS, JSON.stringify(tasks.filter((t) => t.id !== id)));
    return true;
  } catch { return false; }
}

export async function toggleRecurringTaskActive(id) {
  const tasks = await getRecurringTasks();
  return updateRecurringTask(id, { active: !tasks.find((t) => t.id === id)?.active });
}

/**
 * Returns all active recurring tasks that apply to a given day-of-week.
 * @param {number} dayOfWeek 0=Sun…6=Sat
 */
export async function getRecurringTasksForDay(dayOfWeek) {
  const all = await getRecurringTasks();
  return all
    .filter((t) => t.active && Array.isArray(t.days) && t.days.includes(dayOfWeek))
    .sort((a, b) => (a.time < b.time ? -1 : 1));
}

// ─── LogEntries ───────────────────────────────────────────────────────────────

export async function getLogEntries() {
  try { const v = await AsyncStorage.getItem(KEYS.LOG_ENTRIES); return v ? JSON.parse(v) : []; }
  catch { return []; }
}
export async function addLogEntry(entry) {
  try {
    const entries  = await getLogEntries();
    const newEntry = { id: `tg_log_${Date.now()}`, createdAt: new Date().toISOString(), ...entry };
    await AsyncStorage.setItem(KEYS.LOG_ENTRIES, JSON.stringify([newEntry, ...entries]));
    return newEntry;
  } catch { return null; }
}
export async function getRecentLogEntries(limit = 40) {
  return (await getLogEntries()).slice(0, limit);
}

// ─── EnergyEntries ────────────────────────────────────────────────────────────

export async function getEnergyEntries() {
  try { const v = await AsyncStorage.getItem(KEYS.ENERGY_ENTRIES); return v ? JSON.parse(v) : []; }
  catch { return []; }
}
export async function upsertEnergyEntry(date, time, level, cause = null) {
  try {
    const entries  = await getEnergyEntries();
    const newEntry = { date, time, level, cause, updatedAt: new Date().toISOString() };
    const idx      = entries.findIndex((e) => e.date === date && e.time === time);
    const updated  = idx >= 0 ? entries.map((e, i) => (i === idx ? newEntry : e)) : [newEntry, ...entries];
    await AsyncStorage.setItem(KEYS.ENERGY_ENTRIES, JSON.stringify(updated));
    return newEntry;
  } catch { return null; }
}
export async function getEnergyChartData(days = 7) {
  const entries = await getEnergyEntries();
  const byDate  = {};
  entries.forEach((e) => { if (!byDate[e.date] || e.time > byDate[e.date].time) byDate[e.date] = e; });
  return Object.values(byDate).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-days);
}
