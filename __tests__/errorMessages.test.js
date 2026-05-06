import { describe, expect, it } from 'vitest'
import { ERROR_COPY, getErrorCopy } from '../src/errors/messages.js'

const REQUIRED_CODES = [
  'TRANSCRIPT_DISABLED',
  'VIDEO_NOT_FOUND',
  'RATE_LIMITED',
  'BACKEND_UNREACHABLE',
  'API_KEY_MISSING',
  'VIDEO_NOT_INGESTED',
  'INTERNAL_ERROR',
]

describe('ERROR_COPY map', () => {
  it.each(REQUIRED_CODES)('has an entry for %s', (code) => {
    expect(ERROR_COPY[code]).toBeDefined()
  })

  it.each(REQUIRED_CODES)('%s has a non-empty message string', (code) => {
    expect(typeof ERROR_COPY[code].message).toBe('string')
    expect(ERROR_COPY[code].message.length).toBeGreaterThan(0)
  })

  it.each(REQUIRED_CODES)('%s has a non-empty action string', (code) => {
    expect(typeof ERROR_COPY[code].action).toBe('string')
    expect(ERROR_COPY[code].action.length).toBeGreaterThan(0)
  })
})

describe('getErrorCopy', () => {
  it.each(REQUIRED_CODES)('returns the copy for known code %s', (code) => {
    const copy = getErrorCopy(code)
    expect(copy).toBe(ERROR_COPY[code])
  })

  it('falls back to INTERNAL_ERROR for unknown code', () => {
    const copy = getErrorCopy('COMPLETELY_UNKNOWN_CODE')
    expect(copy).toBe(ERROR_COPY.INTERNAL_ERROR)
  })

  it('falls back to INTERNAL_ERROR for undefined', () => {
    const copy = getErrorCopy(undefined)
    expect(copy).toBe(ERROR_COPY.INTERNAL_ERROR)
  })
})

describe('emptyState assignments', () => {
  it('TRANSCRIPT_DISABLED maps to no-captions empty state', () => {
    expect(ERROR_COPY.TRANSCRIPT_DISABLED.emptyState).toBe('no-captions')
  })

  it('BACKEND_UNREACHABLE maps to backend-down empty state', () => {
    expect(ERROR_COPY.BACKEND_UNREACHABLE.emptyState).toBe('backend-down')
  })

  it('API_KEY_MISSING maps to key-missing empty state', () => {
    expect(ERROR_COPY.API_KEY_MISSING.emptyState).toBe('key-missing')
  })

  it('RATE_LIMITED has no emptyState', () => {
    expect(ERROR_COPY.RATE_LIMITED.emptyState).toBeUndefined()
  })

  it('VIDEO_NOT_INGESTED has no emptyState', () => {
    expect(ERROR_COPY.VIDEO_NOT_INGESTED.emptyState).toBeUndefined()
  })
})
