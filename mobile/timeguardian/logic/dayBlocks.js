/**
 * dayBlocks.js
 * Pure functions — no UI dependencies.
 * Timezone-safe date math throughout.
 * Week starts Monday per user's mental model.
 */

import { rotationIndex } from './rotation';
import { DEFAULT_WORK_HOURS, DEFAULT_ROTATION_SCHEDULE } from '../storage/repository';

// ─── Fixed blocks (never editable) ───────────────────────────────────────────

const SLEEP_BLOCK     = { label: 'Sleep',      start: '00:00', end: '06:00', category: 'sleep', type: 'protected' };
const WIND_DOWN_BLOCK = { label: 'Wind-down',  start: '23:00', end: '23:59', category: 'sleep', type: 'protected' };

function buildWorkBlocks(workHours = DEFAULT_WORK_HOURS) {
  return [
    { label: 'Work',                 start: workHours.workStart, end: workHours.workEnd,    category: 'work', type: 'protected' },
    { label: 'Work overtime buffer', start: workHours.workEnd,   end: workHours.overtimeEnd, category: 'work', type: 'soft' },
  ];
}

function getRotationBlockFromSchedule(index, dayType, rotationSchedule = DEFAULT_ROTATION_SCHEDULE) {
  const slot = rotationSchedule.find((s) => s.index === index);
  if (!slot) return null;
  if (dayType === 'sunday')
    return { label: slot.sundayLabel, start: slot.sundayStart, end: slot.sundayEnd, category: slot.sundayCategory, type: 'protected' };
  if (dayType === 'saturday' && slot.hasSaturday)
    return { label: slot.saturdayLabel, start: slot.saturdayStart, end: slot.saturdayEnd, category: slot.saturdayCategory, type: 'protected' };
  return null;
}

// ─── Timezone-safe date helpers ───────────────────────────────────────────────

/**
 * Parses YYYY-MM-DD into { year, month, day } without any timezone conversion.
 * Using new Date(str) risks shifting the date by timezone offset — this avoids that.
 */
export function parseDateStr(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

/**
 * Returns day-of-week (0=Sun…6=Sat) for a YYYY-MM-DD string, timezone-safe.
 * Uses a local Date constructed from explicit parts, not UTC parsing.
 */
export function getDayOfWeek(dateStr) {
  const { year, month, day } = parseDateStr(dateStr);
  return new Date(year, month - 1, day).getDay();
}

/**
 * Returns today as YYYY-MM-DD, timezone-safe (uses local date, not UTC).
 */
export function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns current time as HH:MM.
 */
export function nowTimeStr() {
  return new Date().toTimeString().slice(0, 5);
}

/**
 * Converts a YYYY-MM-DD string to DD-MM-YYYY for display.
 */
export function toDisplayDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
}

/**
 * Converts a DD-MM-YYYY string to YYYY-MM-DD for storage.
 */
export function toStorageDate(displayStr) {
  if (!displayStr) return '';
  const [d, m, y] = displayStr.split('-');
  return `${y}-${m}-${d}`;
}

/**
 * Returns Mon–Sun dates of the week containing today (week starts Monday).
 * @param {Date} [referenceDate] - defaults to today
 * @returns {string[]} 7 YYYY-MM-DD strings, Monday first
 */
export function getWeekDates(referenceDate) {
  const ref = referenceDate || new Date();
  const day = ref.getDay(); // 0=Sun, 1=Mon...6=Sat
  // Distance to last Monday: if Sunday (0), go back 6 days; else go back (day-1) days
  const daysToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y  = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  });
}

/**
 * Returns Mon–Sun dates for a week offset from the current week.
 * offset=0 → this week, offset=-1 → last week, offset=1 → next week
 */
export function getWeekDatesForOffset(offset = 0) {
  const ref = new Date();
  ref.setDate(ref.getDate() + offset * 7);
  return getWeekDates(ref);
}

/**
 * Formats a week range as "Mon 30 Jun – Sun 6 Jul"
 */
export function weekRangeLabel(weekDates) {
  if (!weekDates || weekDates.length < 7) return '';
  const fmt = (dateStr) => {
    const { year, month, day } = parseDateStr(dateStr);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  return `${fmt(weekDates[0])} – ${fmt(weekDates[6])}`;
}

// ─── Core block assembly ──────────────────────────────────────────────────────

/**
 * Assembles all blocks for a given date.
 * Timezone-safe. Week-start-independent (works for any day).
 *
 * @param {string} dateStr         YYYY-MM-DD
 * @param {string} anchorDateStr   YYYY-MM-DD
 * @param {Array}  customBlocks    only active ones included
 * @param {object} workHours       { workStart, workEnd, overtimeEnd }
 * @param {Array}  rotationSchedule array of 4 rotation slot objects
 * @returns {Array<{ label, start, end, category, type }>}
 */
export function getBlocksForDate(
  dateStr,
  anchorDateStr,
  customBlocks     = [],
  workHours        = DEFAULT_WORK_HOURS,
  rotationSchedule = DEFAULT_ROTATION_SCHEDULE
) {
  const dayOfWeek  = getDayOfWeek(dateStr);
  const isWeekday  = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isSunday   = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;

  const blocks = [{ ...SLEEP_BLOCK }, { ...WIND_DOWN_BLOCK }];

  if (isWeekday) buildWorkBlocks(workHours).forEach((b) => blocks.push(b));

  const idx = rotationIndex(dateStr, anchorDateStr);
  if (isSunday)   { const rb = getRotationBlockFromSchedule(idx, 'sunday',   rotationSchedule); if (rb) blocks.push({ ...rb }); }
  if (isSaturday) { const rb = getRotationBlockFromSchedule(idx, 'saturday', rotationSchedule); if (rb) blocks.push({ ...rb }); }

  customBlocks
    .filter((b) => b.active && Array.isArray(b.days) && b.days.includes(dayOfWeek))
    .forEach((b) => blocks.push({ label: b.label, start: b.start, end: b.end, category: b.category, type: b.type }));

  return blocks.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}
