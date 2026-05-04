import { describe, expect, it } from 'vitest'

import {
  ApiError,
  ApiKeyMissingError,
  BackendUnreachableError,
  RateLimitedError,
  TranscriptDisabledError,
  UnknownError,
  VideoNotIngestedError,
} from '../src/api/errors.js'

// ---------------------------------------------------------------------------
// ApiError (base)
// ---------------------------------------------------------------------------

describe('ApiError', () => {
  it('is an instance of Error', () => {
    expect(new ApiError('oops', 500)).toBeInstanceOf(Error)
  })

  it('stores message', () => {
    expect(new ApiError('bad request', 400).message).toBe('bad request')
  })

  it('stores status', () => {
    expect(new ApiError('bad request', 400).status).toBe(400)
  })

  it('defaults code to API_ERROR', () => {
    expect(new ApiError('oops', 500).code).toBe('API_ERROR')
  })

  it('accepts a custom code', () => {
    expect(new ApiError('oops', 500, 'CUSTOM').code).toBe('CUSTOM')
  })

  it('name is ApiError', () => {
    expect(new ApiError('oops', 500).name).toBe('ApiError')
  })
})

// ---------------------------------------------------------------------------
// BackendUnreachableError
// ---------------------------------------------------------------------------

describe('BackendUnreachableError', () => {
  it('is an instance of Error', () => {
    expect(new BackendUnreachableError()).toBeInstanceOf(Error)
  })

  it('code is BACKEND_UNREACHABLE', () => {
    expect(new BackendUnreachableError().code).toBe('BACKEND_UNREACHABLE')
  })

  it('name is BackendUnreachableError', () => {
    expect(new BackendUnreachableError().name).toBe('BackendUnreachableError')
  })

  it('message mentions localhost:8000', () => {
    expect(new BackendUnreachableError().message).toContain('localhost:8000')
  })

  it('stores cause', () => {
    const cause = new TypeError('Failed to fetch')
    expect(new BackendUnreachableError(cause).cause).toBe(cause)
  })

  it('cause is optional', () => {
    expect(() => new BackendUnreachableError()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// ApiKeyMissingError
// ---------------------------------------------------------------------------

describe('ApiKeyMissingError', () => {
  it('extends ApiError', () => {
    expect(new ApiKeyMissingError()).toBeInstanceOf(ApiError)
  })

  it('code is API_KEY_MISSING', () => {
    expect(new ApiKeyMissingError().code).toBe('API_KEY_MISSING')
  })

  it('name is ApiKeyMissingError', () => {
    expect(new ApiKeyMissingError().name).toBe('ApiKeyMissingError')
  })

  it('status is 401', () => {
    expect(new ApiKeyMissingError().status).toBe(401)
  })

  it('default message mentions options', () => {
    expect(new ApiKeyMissingError().message.toLowerCase()).toContain('options')
  })

  it('accepts a custom detail message', () => {
    expect(new ApiKeyMissingError('key invalid').message).toBe('key invalid')
  })
})

// ---------------------------------------------------------------------------
// TranscriptDisabledError
// ---------------------------------------------------------------------------

describe('TranscriptDisabledError', () => {
  it('extends ApiError', () => {
    expect(new TranscriptDisabledError()).toBeInstanceOf(ApiError)
  })

  it('code is TRANSCRIPT_DISABLED', () => {
    expect(new TranscriptDisabledError().code).toBe('TRANSCRIPT_DISABLED')
  })

  it('name is TranscriptDisabledError', () => {
    expect(new TranscriptDisabledError().name).toBe('TranscriptDisabledError')
  })

  it('status is 502', () => {
    expect(new TranscriptDisabledError().status).toBe(502)
  })

  it('default message mentions transcript', () => {
    expect(new TranscriptDisabledError().message.toLowerCase()).toContain('transcript')
  })

  it('accepts a custom detail message', () => {
    expect(new TranscriptDisabledError('no captions').message).toBe('no captions')
  })
})

// ---------------------------------------------------------------------------
// VideoNotIngestedError
// ---------------------------------------------------------------------------

describe('VideoNotIngestedError', () => {
  it('extends ApiError', () => {
    expect(new VideoNotIngestedError('vid1')).toBeInstanceOf(ApiError)
  })

  it('code is VIDEO_NOT_INGESTED', () => {
    expect(new VideoNotIngestedError('vid1').code).toBe('VIDEO_NOT_INGESTED')
  })

  it('name is VideoNotIngestedError', () => {
    expect(new VideoNotIngestedError('vid1').name).toBe('VideoNotIngestedError')
  })

  it('status is 404', () => {
    expect(new VideoNotIngestedError('vid1').status).toBe(404)
  })

  it('stores videoId', () => {
    expect(new VideoNotIngestedError('abc123').videoId).toBe('abc123')
  })

  it('message is user-facing (no raw videoId in message)', () => {
    // Message should guide the user to action, not expose internal IDs
    expect(new VideoNotIngestedError('vid1').message.toLowerCase()).toContain('analys')
  })
})

// ---------------------------------------------------------------------------
// RateLimitedError
// ---------------------------------------------------------------------------

describe('RateLimitedError', () => {
  it('extends ApiError', () => {
    expect(new RateLimitedError()).toBeInstanceOf(ApiError)
  })

  it('code is RATE_LIMITED', () => {
    expect(new RateLimitedError().code).toBe('RATE_LIMITED')
  })

  it('name is RateLimitedError', () => {
    expect(new RateLimitedError().name).toBe('RateLimitedError')
  })

  it('status is 429', () => {
    expect(new RateLimitedError().status).toBe(429)
  })

  it('default message advises waiting', () => {
    expect(new RateLimitedError().message.toLowerCase()).toContain('wait')
  })

  it('accepts a custom detail message', () => {
    expect(new RateLimitedError('slow down').message).toBe('slow down')
  })
})

// ---------------------------------------------------------------------------
// UnknownError
// ---------------------------------------------------------------------------

describe('UnknownError', () => {
  it('is an instance of Error', () => {
    expect(new UnknownError()).toBeInstanceOf(Error)
  })

  it('code is UNKNOWN', () => {
    expect(new UnknownError().code).toBe('UNKNOWN')
  })

  it('name is UnknownError', () => {
    expect(new UnknownError().name).toBe('UnknownError')
  })

  it('stores cause', () => {
    const cause = new Error('original')
    expect(new UnknownError(cause).cause).toBe(cause)
  })

  it('uses cause.message when cause is an Error', () => {
    const cause = new Error('something broke')
    expect(new UnknownError(cause).message).toBe('something broke')
  })

  it('uses fallback message when cause is not an Error', () => {
    expect(new UnknownError('a string').message).toBe('An unexpected error occurred.')
  })

  it('cause is optional', () => {
    expect(() => new UnknownError()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Client integration: new error codes surface via mocked fetch
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, vi } from 'vitest'
import apiClient from '../src/api/client.js'

function mockFetch(body, { ok = true, status = 200 } = {}) {
  return vi.fn().mockResolvedValue({ ok, status, json: vi.fn().mockResolvedValue(body) })
}

beforeEach(() => vi.stubGlobal('fetch', mockFetch({ status: 'ok' })))
afterEach(() => vi.unstubAllGlobals())

describe('client maps HTTP 401 → ApiKeyMissingError', () => {
  it('pingHealth throws ApiKeyMissingError on 401', async () => {
    vi.stubGlobal('fetch', mockFetch({ detail: 'unauthorized' }, { ok: false, status: 401 }))
    await expect(apiClient.pingHealth()).rejects.toBeInstanceOf(ApiKeyMissingError)
  })

  it('pingHealth throws ApiKeyMissingError on 403', async () => {
    vi.stubGlobal('fetch', mockFetch({ detail: 'forbidden' }, { ok: false, status: 403 }))
    await expect(apiClient.pingHealth()).rejects.toBeInstanceOf(ApiKeyMissingError)
  })
})

describe('client maps HTTP 429 → RateLimitedError', () => {
  it('ingest throws RateLimitedError on 429', async () => {
    vi.stubGlobal('fetch', mockFetch({ detail: 'too many requests' }, { ok: false, status: 429 }))
    await expect(apiClient.ingest('vid1')).rejects.toBeInstanceOf(RateLimitedError)
  })

  it('RateLimitedError carries server detail', async () => {
    vi.stubGlobal('fetch', mockFetch({ detail: 'quota exceeded' }, { ok: false, status: 429 }))
    const err = await apiClient.ask('vid1', 'q?').catch((e) => e)
    expect(err).toBeInstanceOf(RateLimitedError)
    expect(err.message).toBe('quota exceeded')
  })
})
