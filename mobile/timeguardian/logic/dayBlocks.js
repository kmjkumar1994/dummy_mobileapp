/**
 * dayBlocks.js — v5
 * Now async — must await getBlocksForDate() since rotation resolution is async.
 * Week starts Monday (day 1).
 * Schedule is versioned — picks correct work hours for the given date.
 */

import { resolveSundayBlock, resolveSaturdayBlock } from './rotation';
import { getWorkHoursForDate, getCustomBlocks, DEFAULT_WORK_HOURS } from '../storage/repository';

// ─── Fixed blocks ─────────────────────────────────────────────────────────────

const SLEEP_BLOCK     = { label: 'Sleep',     start: '00:00', end: '06:00', category: 'sleep', type: 'protected' };
const WIND_DOWN_BLOCK = { label: 'Wind-down', start: '23:00', end: '23:59', category: 'sleep', type: 'protected' };

function buildWorkBlocks(workHours) {
  return [
    { label: 'Work',                 start: workHours.workStart, end: workHours.workEnd,    category: 'work', type: 'protected' },
    { label: 'Work overtime buffer', start: workHours.workEnd,   end: workHours.overtimeEnd, category: 'work', type: 'soft' },
  ];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function parseDateStr(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

export function getDayOfWeek(dateStr) {
  const { year, month, day } = parseDateStr(dateStr);
  return new Date(year, month - 1, day).getDay();
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function nowTimeStr() {
  return new Date().toTimeString().slice(0, 5);
}

export function toDisplayDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
}

export function toStorageDate(display) {
  if (!display) return '';
  const [d, m, y] = display.split('-');
  return `${y}-${m}-${d}`;
}

/**
 * Returns Mon–Sun dates of the week containing the reference date.
 * Week starts Monday (day 1).
 */
export function getWeekDates(referenceDate) {
  const ref = referenceDate || new Date();
  const day = ref.getDay(); // 0=Sun, 1=Mon … 6=Sat
  // Distance back to Monday: if Sunday (0) go back 6, else go back (day - 1)
  const daysToMonday = (day === 0) ? 6 : day - 1;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
}

export function getWeekDatesForOffset(offset = 0) {
  const ref = new Date();
  ref.setDate(ref.getDate() + offset * 7);
  return getWeekDates(ref);
}

export function weekRangeLabel(weekDates) {
  if (!weekDates || weekDates.length < 7) return '';
  const fmt = (ds) => {
    const { year, month, day } = parseDateStr(ds);
    return new Date(year, month - 1, day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  return `${fmt(weekDates[0])} – ${fmt(weekDates[6])}`;
}

/**
 * Assembles all blocks for a given date.
 * ASYNC — rotation resolution reads from storage.
 * Picks correct work hours version for this date.
 * customBlocks param is optional — if not passed, loads from storage.
 *
 * @param {string} dateStr YYYY-MM-DD
 * @param {Array}  customBlocksOverride optional pre-loaded custom blocks
 * @returns {Promise<Array<{ label, start, end, category, type }>>}
 */
export async function getBlocksForDate(dateStr, customBlocksOverride = null) {
  const dayOfWeek  = getDayOfWeek(dateStr);
  const isWeekday  = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isSunday   = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;

  // Versioned work hours for this specific date
  const workHours = await getWorkHoursForDate(dateStr);

  const blocks = [{ ...SLEEP_BLOCK }, { ...WIND_DOWN_BLOCK }];

  if (isWeekday) buildWorkBlocks(workHours).forEach((b) => blocks.push(b));

  if (isSunday) {
    const rb = await resolveSundayBlock(dateStr);
    if (rb) blocks.push({ ...rb });
  }

  if (isSaturday) {
    const rb = await resolveSaturdayBlock(dateStr);
    if (rb) blocks.push({ ...rb });
  }

  // Custom blocks — use override if provided, else load from storage
  const customBlocks = customBlocksOverride !== null ? customBlocksOverride : await getCustomBlocks();
  customBlocks
    .filter((b) => b.active && b.days?.includes(dayOfWeek))
    .forEach((b) => blocks.push({ label: b.label, start: b.start, end: b.end, category: b.category, type: b.type }));

  return blocks.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}
