/**
 * rotation.js
 * Pure function — no storage, no UI dependencies.
 * Computes the 4-week Sunday/Saturday rotation index from a single anchor date.
 *
 * The anchor date is a known Sunday that was a "mother's home visit" (index 0).
 * Everything about the rotation is derived from this one value — never stored week to week.
 */

/**
 * Returns the Sunday of the week containing the given date.
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Date}
 */
function getSundayOfWeek(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - day);
  return sunday;
}

/**
 * Returns rotation index 0..3 for any given date.
 * Handles dates before the anchor correctly via the +4 mod trick.
 *
 * Index meanings:
 *   0 → Mother's home visit (Sunday) / open (Saturday)
 *   1 → Wife outing (Sunday) / open (Saturday)
 *   2 → Rest / friends time (Sunday) / open (Saturday)
 *   3 → Karmayoga field service (both Sunday and Saturday)
 *
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} anchorDateStr - YYYY-MM-DD, always a Sunday, always index 0
 * @returns {number} 0 | 1 | 2 | 3
 */
export function rotationIndex(dateStr, anchorDateStr) {
  const sundayOfWeek = getSundayOfWeek(dateStr);
  const anchorSunday = new Date(anchorDateStr + 'T00:00:00');

  const diffMs = sundayOfWeek.getTime() - anchorSunday.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const weeksSinceAnchor = Math.round(diffDays / 7);

  return ((weeksSinceAnchor % 4) + 4) % 4;
}

/**
 * Returns the rotation block for a given index and day type.
 * Returns null if that combination has no rotation block (open day).
 *
 * @param {number} index - 0..3
 * @param {'sunday'|'saturday'} dayType
 * @returns {{ label, start, end, category, type } | null}
 */
export function getRotationBlock(index, dayType) {
  const ROTATION_BLOCKS = {
    sunday: [
      { label: "Mother's home visit", start: '09:00', end: '18:00', category: 'family', type: 'protected' },
      { label: 'Wife outing',         start: '09:00', end: '18:00', category: 'family', type: 'protected' },
      { label: 'Rest / friends time', start: '09:00', end: '18:00', category: 'self',   type: 'protected' },
      { label: 'Karmayoga field service', start: '08:00', end: '18:00', category: 'karmayoga', type: 'protected' },
    ],
    saturday: [
      null,
      null,
      null,
      { label: 'Karmayoga field service', start: '08:00', end: '18:00', category: 'karmayoga', type: 'protected' },
    ],
  };

  return ROTATION_BLOCKS[dayType][index] ?? null;
}
