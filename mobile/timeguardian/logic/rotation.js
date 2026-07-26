/**
 * rotation.js — v2
 * Replaces fixed 4-week index with per-week plan lookup.
 * Second Sat-Sun of every month = Satori (automatic, not user-configurable).
 * Other weeks: check WeekPlan override first, fall back to rotation defaults.
 */

import {
  getSundayOfWeek, getMondayOfWeek,
  isSecondWeekOfMonth,
  getWeekOfMonthIndex,
  getWeekPlan,
  getRotationDefaultsForDate,
  SUNDAY_BLOCKS,
  SATURDAY_BLOCKS,
} from '../storage/repository';

/**
 * Resolves the Sunday block for a given date.
 * Priority order:
 *   1. Is this the second week of the month? → Always Satori
 *   2. Does a WeekPlan override exist for this week? → Use its sundayType
 *   3. Fall back to rotation defaults by week-of-month index
 *
 * @param {string} dateStr YYYY-MM-DD (must be a Sunday)
 * @returns {Promise<{ label, start, end, category, type } | null>}
 */
export async function resolveSundayBlock(dateStr) {
  // Rule 1 — second week of month is always Satori
  if (isSecondWeekOfMonth(dateStr)) {
    return { ...SUNDAY_BLOCKS.satori };
  }

  // Rule 2 — WeekPlan override (keyed by Monday of the week)
  const weekStart = getMondayOfWeek(dateStr);
  const plan      = await getWeekPlan(weekStart);
  if (plan && plan.sundayType) {
    if (plan.sundayType === 'open') return null;
    // Custom entry — build a block from the stored label
    if (plan.sundayType === 'custom') {
      return plan.sundayCustomLabel
        ? { label: plan.sundayCustomLabel, start: '09:00', end: '18:00', category: 'self', type: 'soft' }
        : null;
    }
    const block = SUNDAY_BLOCKS[plan.sundayType];
    return block ? { ...block } : null;
  }

  // Rule 3 — rotation defaults by week-of-month index
  const weekIdx  = getWeekOfMonthIndex(dateStr);
  const defaults = await getRotationDefaultsForDate(dateStr);
  const slot     = defaults[weekIdx % defaults.length];
  const block    = SUNDAY_BLOCKS[slot?.sundayType || 'open'];
  return block ? { ...block } : null;
}

/**
 * Resolves the Saturday block for a given date.
 * Priority order:
 *   1. Second week of month → Satori
 *   2. WeekPlan override
 *   3. Rotation defaults
 *
 * @param {string} dateStr YYYY-MM-DD (must be a Saturday)
 * @returns {Promise<{ label, start, end, category, type } | null>}
 */
export async function resolveSaturdayBlock(dateStr) {
  // Rule 1 — second week of month is always Satori
  if (isSecondWeekOfMonth(dateStr)) {
    return { ...SATURDAY_BLOCKS.satori };
  }

  // Rule 2 — WeekPlan override (keyed by Monday of the week)
  const weekStart = getMondayOfWeek(dateStr);
  const plan      = await getWeekPlan(weekStart);
  if (plan && plan.saturdayType) {
    if (plan.saturdayType === 'open') return null;
    // Custom entry — build a block from the stored label
    if (plan.saturdayType === 'custom') {
      return plan.saturdayCustomLabel
        ? { label: plan.saturdayCustomLabel, start: '09:00', end: '18:00', category: 'self', type: 'soft' }
        : null;
    }
    const block = SATURDAY_BLOCKS[plan.saturdayType];
    return block ? { ...block } : null;
  }

  // Rule 3 — rotation defaults
  const weekIdx  = getWeekOfMonthIndex(dateStr);
  const defaults = await getRotationDefaultsForDate(dateStr);
  const slot     = defaults[weekIdx % defaults.length];
  const block    = SATURDAY_BLOCKS[slot?.saturdayType || 'open'];
  return block ? { ...block } : null;
}
