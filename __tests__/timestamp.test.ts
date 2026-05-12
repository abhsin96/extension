import { describe, expect, it } from 'vitest'
import { parseTimestamp, formatTimestamp } from '../src/utils/timestamp.js'

// ---------------------------------------------------------------------------
// parseTimestamp
// ---------------------------------------------------------------------------

describe('parseTimestamp', () => {
  it("'01:23' → 83", () => expect(parseTimestamp('01:23')).toBe(83))
  it("'1:23' → 83", () => expect(parseTimestamp('1:23')).toBe(83))
  it("'01:23:45' → 5025", () => expect(parseTimestamp('01:23:45')).toBe(5025))
  it("'1:2:3' → 3723 (single-digit parts allowed)", () =>
    expect(parseTimestamp('1:2:3')).toBe(3723))
  it("'0:00' → 0", () => expect(parseTimestamp('0:00')).toBe(0))
  it("'59:59' → 3599", () => expect(parseTimestamp('59:59')).toBe(3599))

  it("'abc' → null", () => expect(parseTimestamp('abc')).toBeNull())
  it("'' → null", () => expect(parseTimestamp('')).toBeNull())
  it('null → null', () => expect(parseTimestamp(null as any)).toBeNull())
  it('undefined → null', () => expect(parseTimestamp(undefined as any)).toBeNull())
  it("'1:2:3:4' → null (too many parts)", () => expect(parseTimestamp('1:2:3:4')).toBeNull())
  it("'12' → null (only one part)", () => expect(parseTimestamp('12')).toBeNull())
  it("':30' → null (empty leading part)", () => expect(parseTimestamp(':30')).toBeNull())
  it("'01:ab' → null (non-numeric part)", () => expect(parseTimestamp('01:ab')).toBeNull())
})

// ---------------------------------------------------------------------------
// formatTimestamp
// ---------------------------------------------------------------------------

describe('formatTimestamp', () => {
  it('0 → "0:00"', () => expect(formatTimestamp(0)).toBe('0:00'))
  it('59 → "0:59"', () => expect(formatTimestamp(59)).toBe('0:59'))
  it('60 → "1:00"', () => expect(formatTimestamp(60)).toBe('1:00'))
  it('83 → "1:23"', () => expect(formatTimestamp(83)).toBe('1:23'))
  it('3599 → "59:59"', () => expect(formatTimestamp(3599)).toBe('59:59'))
  it('3600 → "1:00:00"', () => expect(formatTimestamp(3600)).toBe('1:00:00'))
  it('5025 → "1:23:45"', () => expect(formatTimestamp(5025)).toBe('1:23:45'))
  it('truncates fractional seconds', () => expect(formatTimestamp(83.9)).toBe('1:23'))
})
