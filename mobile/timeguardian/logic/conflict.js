/**
 * conflict.js
 * Updated: protected DailyTasks now included in conflict check as soft blocks.
 * findConflict is async — getBlocksForDate is async and must be awaited.
 */

import { getBlocksForDate } from './dayBlocks';

function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export const DURATION_PRESETS = {
  '30m': 30, '1h': 60, '2h': 120, '3h': 180, 'whole day': null,
};

export const WHOLE_DAY_START = '06:00';
export const WHOLE_DAY_END   = '22:59';

export function computeEndTime(startTime, durationMinutes) {
  const total = toMinutes(startTime) + durationMinutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}

/**
 * Core conflict check — async because getBlocksForDate reads storage.
 *
 * @param {string} dateStr
 * @param {string} requestStart  HH:MM
 * @param {string} requestEnd    HH:MM
 * @param {string} anchorDateStr  kept for signature compat, unused (getBlocksForDate resolves internally)
 * @param {Array}  customBlocks  pre-loaded custom blocks passed through to getBlocksForDate
 * @param {object} workHours     unused — getBlocksForDate loads versioned hours from storage
 * @param {Array}  rotationSchedule  unused — rotation resolved internally
 * @param {Array}  dailyTasks    tasks for this date (protected ones treated as soft blocks)
 * @returns {Promise<{ block: object|null, count: number }>}
 */
export async function findConflict(
  dateStr, requestStart, requestEnd,
  anchorDateStr, customBlocks = [],
  workHours, rotationSchedule,
  dailyTasks = []
) {
  // Await the async block resolution — this was missing and caused silent empty results
  const blocks = await getBlocksForDate(dateStr, customBlocks);

  // Add protected daily tasks as soft blocks
  const protectedTasks = dailyTasks
    .filter((t) => t.protected && t.time)
    .map((t) => ({
      label   : t.title,
      start   : t.time,
      end     : t.duration ? computeEndTime(t.time, t.duration) : t.time,
      category: t.category || 'other',
      type    : 'soft',
    }));

  const allBlocks  = [...blocks, ...protectedTasks];
  const reqStart   = toMinutes(requestStart);
  const reqEnd     = toMinutes(requestEnd);

  let best            = null;
  let totalConflicts  = 0;
  const allConflicts  = [];

  for (const block of allBlocks) {
    const bStart   = toMinutes(block.start);
    const bEnd     = toMinutes(block.end);
    const overlaps = reqStart < bEnd && reqEnd > bStart;
    if (overlaps) {
      totalConflicts++;
      allConflicts.push(block);
      if (best === null || (block.type === 'protected' && best.type !== 'protected')) {
        best = block;
      }
    }
  }

  return { block: best, count: totalConflicts, allConflicts };
}
