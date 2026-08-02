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
  DAILY_SUMMARIES    : 'tg:dailySummaries',   // one combined record per day
  WORK_HOURS_HISTORY : 'tg:workHoursHistory',
  ROTATION_DEFAULTS  : 'tg:rotationDefaults',
  WEEK_PLANS         : 'tg:weekPlans',
  SCHEDULE_CHANGE_LOG: 'tg:scheduleChangeLog',
  DAILY_TASKS        : 'tg:dailyTasks',
  RECURRING_TASKS    : 'tg:recurringTasks',
  DAY_OVERRIDES      : 'tg:dayOverrides',
};

// Per-day override types — applied on top of the week plan for a single date
export const DAY_OVERRIDE_TYPES = {
  leave      : 'Leave / day off',
  wfh        : 'Work from home',
  half_day   : 'Half day',
  karmayoga  : 'Karmayoga field service',
  family     : 'Family commitment',
  health     : 'Health / rest',
  custom     : 'Custom',
};

export const SUNDAY_TYPE_LABELS = {
  satori     : 'Satori — rest & recharge',
  mom_visit  : "Mother's home visit",
  wife_outing: 'Wife outing',
  home_stay  : 'Home stay',
  karmayoga  : 'Karmayoga field service',
  open       : 'Open',
  custom     : 'Custom…',
};

export const SATURDAY_TYPE_LABELS = {
  satori   : 'Satori — rest & recharge',
  karmayoga: 'Karmayoga field service',
  open     : 'Open',
  custom   : 'Custom…',
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
 * Returns the Monday of the week containing dateStr.
 * Week starts Monday. If dateStr is Sunday, goes back 6 days.
 */
export function getMondayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay(); // 0=Sun
  const daysToMonday = (dow === 0) ? 6 : dow - 1;
  date.setDate(d - daysToMonday);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

/**
 * Returns true if this date falls in the second week of its month
 * (week anchored to Monday).
 * The second Mon–Sun of every month is always Satori.
 */
export function isSecondWeekOfMonth(dateStr) {
  const [y, m, d]      = dateStr.split('-').map(Number);
  const dow             = new Date(y, m - 1, d).getDay();
  // Find the first Monday of the month
  const firstDow        = new Date(y, m - 1, 1).getDay();
  const daysToFirstMon  = (firstDow === 0) ? 1 : (firstDow === 1) ? 0 : 8 - firstDow;
  const firstMonday     = 1 + daysToFirstMon;
  const secondMonday    = firstMonday + 7;
  return d >= secondMonday && d < secondMonday + 7;
}

/**
 * Returns the week-of-month index (0-based) for a date.
 * Weeks anchored to Monday.
 */
export function getWeekOfMonthIndex(dateStr) {
  const [y, m, d]   = dateStr.split('-').map(Number);
  const dow          = new Date(y, m - 1, d).getDay();
  const daysToMon    = (dow === 0) ? 6 : dow - 1;
  const monday       = new Date(y, m - 1, d - daysToMon);
  const firstDow     = new Date(y, m - 1, 1).getDay();
  const daysToFirstMon = (firstDow === 0) ? 1 : (firstDow === 1) ? 0 : 8 - firstDow;
  const firstMon     = 1 + daysToFirstMon;
  return Math.floor((monday.getDate() - firstMon) / 7);
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
export async function updateLogEntry(id, changes) {
  try {
    const entries = await getLogEntries();
    const updated = entries.map((e) => e.id === id ? { ...e, ...changes, updatedAt: new Date().toISOString() } : e);
    await AsyncStorage.setItem(KEYS.LOG_ENTRIES, JSON.stringify(updated));
    return true;
  } catch { return false; }
}

/**
 * Soft-deletes a log entry — marks it deleted: true with a deletedAt timestamp.
 * The entry is kept in storage and can be recovered via getDeletedLogEntries().
 */
export async function deleteLogEntry(id) {
  try {
    const entries = await getLogEntries();
    const updated = entries.map((e) =>
      e.id === id
        ? { ...e, deleted: true, deletedAt: new Date().toISOString() }
        : e
    );
    await AsyncStorage.setItem(KEYS.LOG_ENTRIES, JSON.stringify(updated));
    return true;
  } catch { return false; }
}

/**
 * Permanently removes a soft-deleted entry (hard delete — use only from admin/recovery).
 */
export async function purgeLogEntry(id) {
  try {
    const entries = await getLogEntries();
    await AsyncStorage.setItem(KEYS.LOG_ENTRIES, JSON.stringify(entries.filter((e) => e.id !== id)));
    return true;
  } catch { return false; }
}

/** Returns entries that have been soft-deleted (for recovery UI if needed). */
export async function getDeletedLogEntries() {
  return (await getLogEntries()).filter((e) => e.deleted === true);
}

export async function getRecentLogEntries(limit = 40) {
  // Exclude soft-deleted entries from active views
  return (await getLogEntries()).filter((e) => !e.deleted).slice(0, limit);
}

// ─── DayOverrides ─────────────────────────────────────────────────────────────
// Per-date overrides stored as { 'YYYY-MM-DD': { type, note, updatedAt } }

export async function getDayOverrides() {
  try { const v = await AsyncStorage.getItem(KEYS.DAY_OVERRIDES); return v ? JSON.parse(v) : {}; }
  catch { return {}; }
}

export async function getDayOverride(dateStr) {
  return (await getDayOverrides())[dateStr] || null;
}

export async function saveDayOverride(dateStr, type, note = '') {
  try {
    const overrides = await getDayOverrides();
    overrides[dateStr] = { type, note, updatedAt: new Date().toISOString() };
    await AsyncStorage.setItem(KEYS.DAY_OVERRIDES, JSON.stringify(overrides));
    return overrides[dateStr];
  } catch { return null; }
}

export async function clearDayOverride(dateStr) {
  try {
    const overrides = await getDayOverrides();
    delete overrides[dateStr];
    await AsyncStorage.setItem(KEYS.DAY_OVERRIDES, JSON.stringify(overrides));
    return true;
  } catch { return false; }
}

// ─── Energy Sessions ─────────────────────────────────────────────────────────

export const SESSION_KEYS = ['morning', 'work_am', 'work_pm', 'evening'];

export const SESSION_LABELS = {
  morning : 'Morning',
  work_am : 'Work AM',
  work_pm : 'Work PM',
  evening : 'Evening',
};

export const SESSION_ICONS = {
  morning : '🌅',
  work_am : '💼',
  work_pm : '⚡',
  evening : '🌙',
};

/**
 * Returns which session key a HH:MM time falls in, based on the user's work hours.
 * morning  = 06:00 → workStart
 * work_am  = workStart → 13:00
 * work_pm  = 13:00 → workEnd
 * evening  = workEnd → 23:00
 */
export function getSessionForTime(timeStr, workHours = DEFAULT_WORK_HOURS) {
  const toMins = (t) => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m; };
  const t          = toMins(timeStr);
  const workStart  = toMins(workHours.workStart);
  const noon       = 13 * 60;
  const workEnd    = toMins(workHours.workEnd);
  if (t < workStart) return 'morning';
  if (t < noon)      return 'work_am';
  if (t < workEnd)   return 'work_pm';
  return 'evening';
}

/** Returns the display time range for a session key given work hours. */
export function getSessionBounds(sessionKey, workHours = DEFAULT_WORK_HOURS) {
  switch (sessionKey) {
    case 'morning' : return { start: '06:00',             end: workHours.workStart };
    case 'work_am' : return { start: workHours.workStart, end: '13:00' };
    case 'work_pm' : return { start: '13:00',             end: workHours.workEnd };
    case 'evening' : return { start: workHours.workEnd,   end: '23:00' };
    default         : return { start: '00:00',            end: '23:59' };
  }
}

// ─── EnergyEntries ────────────────────────────────────────────────────────────

export async function getEnergyEntries() {
  try { const v = await AsyncStorage.getItem(KEYS.ENERGY_ENTRIES); return v ? JSON.parse(v) : []; } catch { return []; }
}

/**
 * Upsert an energy entry for a date + session.
 * Session is passed explicitly — never derived from time.
 * One entry per session per day — checking in the same session overwrites.
 * Stores: { id, date, time, session, level, cause, updatedAt }
 */
export async function upsertEnergyEntry(date, time, level, cause = null, session = null, workHours = DEFAULT_WORK_HOURS) {
  try {
    // Use the explicitly passed session; fall back to computing from time only if not provided
    const resolvedSession = session || getSessionForTime(time, workHours);
    const entries = await getEnergyEntries();
    const ne = {
      id        : `tg_e_${date}_${resolvedSession}`,
      date, time, session: resolvedSession, level, cause,
      updatedAt : new Date().toISOString(),
    };
    const idx = entries.findIndex((e) => e.date === date && e.session === resolvedSession);
    await AsyncStorage.setItem(
      KEYS.ENERGY_ENTRIES,
      JSON.stringify(idx >= 0 ? entries.map((e, i) => i === idx ? ne : e) : [ne, ...entries])
    );
    return ne;
  } catch { return null; }
}

/** All entries for a specific date sorted by session order. */
export async function getEnergyEntriesForDate(date) {
  const entries = await getEnergyEntries();
  return entries
    .filter((e) => e.date === date)
    .sort((a, b) => SESSION_KEYS.indexOf(a.session) - SESSION_KEYS.indexOf(b.session));
}

/** One representative entry per date (latest session) for the trend chart. */
export async function getEnergyChartData(days = 7) {
  const entries = await getEnergyEntries();
  const byDate  = {};
  entries.forEach((e) => {
    if (!byDate[e.date]) { byDate[e.date] = e; return; }
    const cur  = SESSION_KEYS.indexOf(e.session);
    const best = SESSION_KEYS.indexOf(byDate[e.date].session);
    if (cur > best) byDate[e.date] = e;
  });
  return Object.values(byDate).sort((a, b) => a.date < b.date ? -1 : 1).slice(-days);
}

// ─── Daily Summaries ──────────────────────────────────────────────────────────
// One record per day that combines ALL posted sessions into a weighted score.
// Only sessions that were actually checked-in contribute; unfilled ones are omitted.
// Shape: { date, score, entryCount, sessions: { morning?, work_am?, work_pm?, evening? }, updatedAt }

const SUMMARY_WEIGHTS = { morning: 1, work_am: 1.5, work_pm: 1.5, evening: 2 };

export async function getDailySummaries() {
  try {
    const v = await AsyncStorage.getItem(KEYS.DAILY_SUMMARIES);
    return v ? JSON.parse(v) : {};
  } catch { return {}; }
}

/**
 * Recomputes and persists the daily summary for `date` from all its energy entries.
 * Called after every check-in so the summary always reflects the current state.
 * Returns the saved summary object, or null on error.
 */
export async function upsertDailySummary(date) {
  try {
    const entries  = await getEnergyEntriesForDate(date);
    if (entries.length === 0) return null;             // nothing posted — no summary

    // Build per-session map (latest wins if somehow duplicated)
    const bySession = {};
    entries.forEach((e) => {
      if (!bySession[e.session] || e.time > bySession[e.session].time) {
        bySession[e.session] = e;
      }
    });

    // Weighted average of only the posted sessions
    let weightedSum = 0;
    let totalWeight = 0;
    SESSION_KEYS.forEach((s) => {
      if (bySession[s]) {
        const w = SUMMARY_WEIGHTS[s] ?? 1;
        weightedSum += bySession[s].level * w;
        totalWeight += w;
      }
    });

    const score = totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 10) / 10
      : null;

    const summary = {
      date,
      score,
      entryCount : entries.length,
      sessions   : Object.fromEntries(
        SESSION_KEYS
          .filter((s) => bySession[s])
          .map((s) => [s, { level: bySession[s].level, cause: bySession[s].cause, time: bySession[s].time }])
      ),
      updatedAt  : new Date().toISOString(),
    };

    const all = await getDailySummaries();
    all[date]  = summary;
    await AsyncStorage.setItem(KEYS.DAILY_SUMMARIES, JSON.stringify(all));
    return summary;
  } catch { return null; }
}

/**
 * Returns the last `days` daily summaries sorted oldest → newest.
 * Each item has { date, score, entryCount, sessions }.
 * Days with no check-ins are simply absent — no placeholder rows.
 */
export async function getDailySummaryChartData(days = 7) {
  const all = await getDailySummaries();
  return Object.values(all)
    .sort((a, b) => a.date < b.date ? -1 : 1)
    .slice(-days);
}
