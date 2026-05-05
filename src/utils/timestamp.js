/**
 * Timestamp utilities shared between sidebar rendering and the seek bridge.
 */

/**
 * Parse a timestamp string in mm:ss or hh:mm:ss format.
 * Returns total seconds, or null when the input is malformed.
 *
 * @param {string} str  e.g. '01:23', '1:23:45', '1:2:3'
 * @returns {number|null}
 */
export function parseTimestamp(str) {
  if (typeof str !== 'string' || str.length === 0) return null
  const parts = str.split(':')
  if (parts.length < 2 || parts.length > 3) return null
  if (!parts.every((p) => p.length > 0 && /^\d+$/.test(p))) return null
  const nums = parts.map(Number)
  if (parts.length === 2) return nums[0] * 60 + nums[1]
  return nums[0] * 3600 + nums[1] * 60 + nums[2]
}

/**
 * Format a number of seconds as mm:ss or h:mm:ss.
 *
 * @param {number} totalSec
 * @returns {string}
 */
export function formatTimestamp(totalSec) {
  const sec = Math.floor(totalSec)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
