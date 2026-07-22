/**
 * repository.js — v5
 * Key changes:
 * - WeekPlan storage (per-week Sunday/Saturday commitment)
 * - Versioned schedule: WorkHours stores history with effectiveFrom
 * - All schedule changes track effectiveFrom + retroactive flag
 * - isSecondWeekOfMonth helper for automatic Satori detection
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  ROTATION_ANCHOR    : 'tg:rotationAnchor',
  CUSTOM_BLOCKS      : 'tg:customBlocks',
  LOG_ENTRIES        : 'tg:logEntries',
  ENERGY_ENTRIES     : 'tg:energyEntries',
  WORK_HOURS_HISTORY : 'tg:workHoursHistory',
  ROTATION_DEFAULTS  : 'tg:rotationDefaults',
  WEEK_PLANS         : 'tg:weekPlans',
  SCHEDULE_CHANGE_LOG: 'tg:scheduleChangeLog',
  DAILY_TASKS        : 'tg:dailyTasks',
  RECURRING_TASKS    : 'tg:recurringTasks',
};

export const SUNDAY_TYPE_LABELS = {
  satori     : 'Satori — rest & recharge',
  mom_visit  : "Mother's home visit",
  wife_outing: 'Wife outing',
  home_stay  : 'Home stay',
  karmayoga  : 'Karmayoga field service',
  open       : 'Open',
};

export const SATURDAY_TYPE_LABELS = {
  satori   : 'Satori — rest & recharge',
  karmayoga: 'Karmayoga field service',
  open     : 'Open',
};

export const SUNDAY_BLOCKS = {
  satori     : { label: 'Satori — rest & recharge', start: '09:00', end: '18:00', category: 'self',      type: 'protected' },
  mom_visit  : { label: "Mother's home visit",       start: '09:00', end: '18:00', category: 'family',    type: 'protected' },
  wife_outing: { label: 'Wife outing',               start: '09:00', end: '18:00', category: 'family',    type: 'protected' },
  home_stay  : { label: 'Home stay',                 start: '09:00', end: '18:00', category: 'self',      type: 'soft'      },
  karmayoga  : { label: 'Karmayoga field service',   start: '08:00', end: '18:00', category: 'karmayoga', type: 'protected' },
  open       : null,
};

export const SATURDAY_BLOCKS = {
  satori   : { label: 'Satori — rest & recharge', start: '09:00', end: '18:00', category: 'self',      type: 'protected' },
  karmayoga: { label: 'Karmayoga field service',  start: '08:00', end: '18:00', category: 'karmayoga', type: 'protected' },
  open     : null,
};

export const DEFAULT_WORK_HOURS = { workStart: '10:00', workEnd: '19:00', overtimeEnd: '23:00' };

export const DEFAULT_ROTATION_DEFAULTS = [
  { weekIndex: 0, sundayType: 'mom_visit',    saturdayType: 'open' },
  { weekIndex: 1, sundayType: 'wife_outing',  saturdayType: 'open' },
  { weekIndex: 2, sundayType: 'home_stay',    saturdayType: 'open' },
  { weekIndex: 3, sundayType: 'karmayoga',    saturdayType: 'karmayoga' },
];

const DEFAULT_CUSTOM_BLOCKS = [
  { id: 'tg_default_1', label: 'Health check-in / exercise', category: 'self', type: 'protected', days: [1,3,5], start: '07:00', end: '07:45', active: true },
  { id: 'tg_default_2', label: 'Reading / course work',      category: 'self', type: 'soft',      days: [2,4],   start: '20:30', end: '21:15', active: true },
  { id: 'tg_default_3', label: 'Finance and digital tidy-up',category: 'self', type: 'soft',      days: [6],     start: '08:00', end: '08:45', active: true },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function getSundayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(d - date.getDay());
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

/**
 * Returns true if this date falls in the second week of its month.
 * The second Sat-Sun of every month is always Satori.
 */
export function isSecondWeekOfMonth(dateStr) {
  const [y, m, d]       = dateStr.split('-').map(Number);
  const dow              = new Date(y, m - 1, d).getDay();
  const firstDow         = new Date(y, m - 1, 1).getDay();
  const firstOccurrence  = 1 + ((dow - firstDow + 7) % 7);
  const secondOccurrence = firstOccurrence + 7;
  return d >= secondOccurrence && d < secondOccurrence + 7;
}

/**
 * Returns the week-of-month index (0-based) for a date.
 * Used to pick default rotation when no WeekPlan override exists.
 */
export function getWeekOfMonthIndex(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow        = new Date(y, m - 1, d).getDay();
  const sunday     = new Date(y, m - 1, d - dow);
  const firstDow   = new Date(y, m - 1, 1).getDay();
  const firstSun   = 1 + ((0 - firstDow + 7) % 7);
  const sunDay     = sunday.getDate();
  return Math.floor((sunDay - firstSun) / 7);
}

// ─── RotationAnchor ───────────────────────────────────────────────────────────

export async function getRotationAnchor() {
  try { const v = await AsyncStorage.getItem(KEYS.ROTATION_ANCHOR); return v ? JSON.parse(v) : null; }
  catch { return null; }
}
export async function setRotationAnchor(date) {
  try { await AsyncStorage.setItem(KEYS.ROTATION_ANCHOR, JSON.stringify({ anchor_date: date })); return true; }
  catch { return false; }
}

// ─── Versioned Work Hours ─────────────────────────────────────────────────────

export async function getWorkHoursHistory() {
  try {
    const v = await AsyncStorage.getItem(KEYS.WORK_HOURS_HISTORY);
    if (v) return JSON.parse(v);
    const initial = [{ value: DEFAULT_WORK_HOURS, effectiveFrom: '2000-01-01', changedAt: new Date().toISOString() }];
    await AsyncStorage.setItem(KEYS.WORK_HOURS_HISTORY, JSON.stringify(initial));
    return initial;
  } catch { return [{ value: DEFAULT_WORK_HOURS, effectiveFrom: '2000-01-01', changedAt: new Date().toISOString() }]; }
}

export async function getWorkHoursForDate(dateStr) {
  const history = await getWorkHoursHistory();
  const hit = history.filter((h) => h.effectiveFrom <= dateStr).sort((a,b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return hit.length > 0 ? hit[0].value : DEFAULT_WORK_HOURS;
}

export async function getCurrentWorkHours() {
  return getWorkHoursForDate(new Date().toISOString().split('T')[0]);
}

export async function saveWorkHours(workHours, effectiveFrom, retroactive = false) {
  try {
    const history = await getWorkHoursHistory();
    await AsyncStorage.setItem(KEYS.WORK_HOURS_HISTORY, JSON.stringify([
      { value: workHours, effectiveFrom, changedAt: new Date().toISOString(), retroactive },
      ...history,
    ]));
    return true;
  } catch { return false; }
}

// ─── WeekPlans ────────────────────────────────────────────────────────────────

export async function getWeekPlans() {
  try { const v = await AsyncStorage.getItem(KEYS.WEEK_PLANS); return v ? JSON.parse(v) : {}; }
  catch { return {}; }
}

export async function getWeekPlan(weekStartDate) {
  return (await getWeekPlans())[weekStartDate] || null;
}

export async function saveWeekPlan(weekStartDate, plan) {
  try {
    const plans = await getWeekPlans();
    plans[weekStartDate] = { ...plan, weekStartDate, updatedAt: new Date().toISOString() };
    await AsyncStorage.setItem(KEYS.WEEK_PLANS, JSON.stringify(plans));
    return true;
  } catch { return false; }
}

// ─── Rotation Defaults (versioned) ───────────────────────────────────────────

export async function getRotationDefaultsHistory() {
  try {
    const v = await AsyncStorage.getItem(KEYS.ROTATION_DEFAULTS);
    if (v) return JSON.parse(v);
    const initial = [{ value: DEFAULT_ROTATION_DEFAULTS, effectiveFrom: '2000-01-01', changedAt: new Date().toISOString() }];
    await AsyncStorage.setItem(KEYS.ROTATION_DEFAULTS, JSON.stringify(initial));
    return initial;
  } catch { return [{ value: DEFAULT_ROTATION_DEFAULTS, effectiveFrom: '2000-01-01', changedAt: new Date().toISOString() }]; }
}

export async function getRotationDefaultsForDate(dateStr) {
  const history = await getRotationDefaultsHistory();
  const hit = history.filter((h) => h.effectiveFrom <= dateStr).sort((a,b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return hit.length > 0 ? hit[0].value : DEFAULT_ROTATION_DEFAULTS;
}

export async function getCurrentRotationDefaults() {
  return getRotationDefaultsForDate(new Date().toISOString().split('T')[0]);
}

export async function saveRotationDefaults(defaults, effectiveFrom, retroactive = false) {
  try {
    const history = await getRotationDefaultsHistory();
    await AsyncStorage.setItem(KEYS.ROTATION_DEFAULTS, JSON.stringify([
      { value: defaults, effectiveFrom, changedAt: new Date().toISOString(), retroactive },
      ...history,
    ]));
    return true;
  } catch { return false; }
}

// ─── Schedule Change Log ──────────────────────────────────────────────────────

export async function getScheduleChangeLog() {
  try { const v = await AsyncStorage.getItem(KEYS.SCHEDULE_CHANGE_LOG); return v ? JSON.parse(v) : []; }
  catch { return []; }
}

export async function addScheduleChangeLog(field, oldValue, newValue, reason, effectiveFrom, retroactive = false) {
  try {
    const entry = {
      id: `tg_scl_${Date.now()}`,
      field, oldValue, newValue, reason,
      effectiveFrom, retroactive,
      changedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(KEYS.SCHEDULE_CHANGE_LOG, JSON.stringify([entry, ...await getScheduleChangeLog()]));
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
export async function saveCustomBlocks(b) {
  try { await AsyncStorage.setItem(KEYS.CUSTOM_BLOCKS, JSON.stringify(b)); return true; } catch { return false; }
}
export async function addCustomBlock(b)          { return saveCustomBlocks([...await getCustomBlocks(), { ...b, id: `tg_cb_${Date.now()}`, active: true }]); }
export async function updateCustomBlock(id, ch)  { return saveCustomBlocks((await getCustomBlocks()).map((b) => b.id === id ? { ...b, ...ch } : b)); }
export async function deleteCustomBlock(id)      { return saveCustomBlocks((await getCustomBlocks()).filter((b) => b.id !== id)); }
export async function toggleCustomBlockActive(id){ return saveCustomBlocks((await getCustomBlocks()).map((b) => b.id === id ? { ...b, active: !b.active } : b)); }

// ─── DailyTasks ───────────────────────────────────────────────────────────────

export async function getDailyTasks() {
  try { const v = await AsyncStorage.getItem(KEYS.DAILY_TASKS); return v ? JSON.parse(v) : []; } catch { return []; }
}
export async function getDailyTasksForDate(date) {
  return (await getDailyTasks()).filter((t) => t.date === date).sort((a,b) => a.time < b.time ? -1 : 1);
}
export async function addDailyTask(task) {
  try {
    const nt = { id: `tg_dt_${Date.now()}`, done: false, protected: false, ...task };
    await AsyncStorage.setItem(KEYS.DAILY_TASKS, JSON.stringify([...await getDailyTasks(), nt]));
    return nt;
  } catch { return null; }
}
export async function updateDailyTask(id, ch) {
  try {
    await AsyncStorage.setItem(KEYS.DAILY_TASKS, JSON.stringify((await getDailyTasks()).map((t) => t.id === id ? { ...t, ...ch } : t)));
    return true;
  } catch { return false; }
}
export async function deleteDailyTask(id) {
  try {
    await AsyncStorage.setItem(KEYS.DAILY_TASKS, JSON.stringify((await getDailyTasks()).filter((t) => t.id !== id)));
    return true;
  } catch { return false; }
}

// ─── RecurringTasks ───────────────────────────────────────────────────────────

export async function getRecurringTasks() {
  try { const v = await AsyncStorage.getItem(KEYS.RECURRING_TASKS); return v ? JSON.parse(v) : []; } catch { return []; }
}
export async function addRecurringTask(task) {
  try {
    const nt = { id: `tg_rt_${Date.now()}`, done: false, protected: false, active: true, ...task };
    await AsyncStorage.setItem(KEYS.RECURRING_TASKS, JSON.stringify([...await getRecurringTasks(), nt]));
    return nt;
  } catch { return null; }
}
export async function updateRecurringTask(id, ch) {
  try {
    await AsyncStorage.setItem(KEYS.RECURRING_TASKS, JSON.stringify((await getRecurringTasks()).map((t) => t.id === id ? { ...t, ...ch } : t)));
    return true;
  } catch { return false; }
}
export async function deleteRecurringTask(id) {
  try {
    await AsyncStorage.setItem(KEYS.RECURRING_TASKS, JSON.stringify((await getRecurringTasks()).filter((t) => t.id !== id)));
    return true;
  } catch { return false; }
}
export async function toggleRecurringTaskActive(id) {
  const tasks = await getRecurringTasks();
  return updateRecurringTask(id, { active: !tasks.find((t) => t.id === id)?.active });
}
export async function getRecurringTasksForDay(dow) {
  return (await getRecurringTasks()).filter((t) => t.active && t.days?.includes(dow)).sort((a,b) => a.time < b.time ? -1 : 1);
}

// ─── LogEntries ───────────────────────────────────────────────────────────────

export async function getLogEntries() {
  try { const v = await AsyncStorage.getItem(KEYS.LOG_ENTRIES); return v ? JSON.parse(v) : []; } catch { return []; }
}
export async function addLogEntry(entry) {
  try {
    const ne = { id: `tg_log_${Date.now()}`, createdAt: new Date().toISOString(), ...entry };
    await AsyncStorage.setItem(KEYS.LOG_ENTRIES, JSON.stringify([ne, ...await getLogEntries()]));
    return ne;
  } catch { return null; }
}
export async function getRecentLogEntries(limit = 40) { return (await getLogEntries()).slice(0, limit); }

// ─── EnergyEntries ────────────────────────────────────────────────────────────

export async function getEnergyEntries() {
  try { const v = await AsyncStorage.getItem(KEYS.ENERGY_ENTRIES); return v ? JSON.parse(v) : []; } catch { return []; }
}
export async function upsertEnergyEntry(date, time, level, cause = null) {
  try {
    const entries = await getEnergyEntries();
    const ne = { date, time, level, cause, updatedAt: new Date().toISOString() };
    const idx = entries.findIndex((e) => e.date === date && e.time === time);
    await AsyncStorage.setItem(KEYS.ENERGY_ENTRIES, JSON.stringify(idx >= 0 ? entries.map((e,i) => i===idx ? ne : e) : [ne, ...entries]));
    return ne;
  } catch { return null; }
}
export async function getEnergyChartData(days = 7) {
  const entries = await getEnergyEntries();
  const byDate = {};
  entries.forEach((e) => { if (!byDate[e.date] || e.time > byDate[e.date].time) byDate[e.date] = e; });
  return Object.values(byDate).sort((a,b) => a.date < b.date ? -1 : 1).slice(-days);
}
