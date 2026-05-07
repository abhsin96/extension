import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import apiClient, { API_BASE } from '../src/api/client.js'
import {
  ApiError,
  BackendUnreachableError,
  TranscriptDisabledError,
  VideoNotIngestedError,
} from '../src/api/errors.js'

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function mockFetch(body, { ok = true, status = 200 } = {}) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  })
}

function mockNetworkError() {
  return vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch({ status: 'ok' }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Shared assertion: Content-Type header always sent
// ---------------------------------------------------------------------------

function lastCallHeaders() {
  return fetch.mock.calls[0][1]?.headers ?? {}
}

// ---------------------------------------------------------------------------
// pingHealth()
// ---------------------------------------------------------------------------

describe('pingHealth()', () => {
  it('calls GET /health', async () => {
    await apiClient.pingHealth()
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe(`${API_BASE}/health`)
    expect(opts.method).toBeUndefined() // no method = GET
  })

  it('resolves with the parsed response body', async () => {
    const body = { status: 'ok', version: '0.1.0', langsmith_enabled: false, has_api_key: true }
    vi.stubGlobal('fetch', mockFetch(body))
    const result = await apiClient.pingHealth()
    expect(result).toEqual(body)
  })

  it('throws BackendUnreachableError on network failure', async () => {
    vi.stubGlobal('fetch', mockNetworkError())
    await expect(apiClient.pingHealth()).rejects.toBeInstanceOf(BackendUnreachableError)
  })

  it('BackendUnreachableError wraps the original cause', async () => {
    vi.stubGlobal('fetch', mockNetworkError())
    const err = await apiClient.pingHealth().catch((e) => e)
    expect(err.cause).toBeInstanceOf(TypeError)
  })
})

// ---------------------------------------------------------------------------
// ingest()
// ---------------------------------------------------------------------------

const INGEST_RESPONSE = { status: 'done', chunk_count: 12, cached: false }

describe('ingest()', () => {
  it('calls POST /ingest', async () => {
    vi.stubGlobal('fetch', mockFetch(INGEST_RESPONSE))
    await apiClient.ingest('vid1')
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe(`${API_BASE}/ingest`)
    expect(opts.method).toBe('POST')
  })

  it('sends video_id in the request body', async () => {
    vi.stubGlobal('fetch', mockFetch(INGEST_RESPONSE))
    await apiClient.ingest('abc123')
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.video_id).toBe('abc123')
  })

  it('sends force: false by default', async () => {
    vi.stubGlobal('fetch', mockFetch(INGEST_RESPONSE))
    await apiClient.ingest('vid1')
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.force).toBe(false)
  })

  it('sends force: true when specified', async () => {
    vi.stubGlobal('fetch', mockFetch(INGEST_RESPONSE))
    await apiClient.ingest('vid1', { force: true })
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.force).toBe(true)
  })

  it('resolves with the parsed response body', async () => {
    vi.stubGlobal('fetch', mockFetch(INGEST_RESPONSE))
    const result = await apiClient.ingest('vid1')
    expect(result).toEqual(INGEST_RESPONSE)
  })

  it('throws TranscriptDisabledError on 502', async () => {
    vi.stubGlobal('fetch', mockFetch({ detail: 'transcript disabled' }, { ok: false, status: 502 }))
    await expect(apiClient.ingest('vid1')).rejects.toBeInstanceOf(TranscriptDisabledError)
  })

  it('TranscriptDisabledError carries the server detail message', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ detail: 'no captions available' }, { ok: false, status: 502 }),
    )
    const err = await apiClient.ingest('vid1').catch((e) => e)
    expect(err.message).toBe('no captions available')
  })

  it('throws ApiError on 422 validation failure', async () => {
    vi.stubGlobal('fetch', mockFetch({ detail: 'video_id too short' }, { ok: false, status: 422 }))
    const err = await apiClient.ingest('x').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(422)
  })

  it('throws BackendUnreachableError on network failure', async () => {
    vi.stubGlobal('fetch', mockNetworkError())
    await expect(apiClient.ingest('vid1')).rejects.toBeInstanceOf(BackendUnreachableError)
  })
})

// ---------------------------------------------------------------------------
// ask()
// ---------------------------------------------------------------------------

const SOURCES = [
  { chunk_id: 'c1', start_ts: 5.0, end_ts: 10.0, text: 'hello world' },
  { chunk_id: 'c2', start_ts: 15.0, end_ts: 20.0, text: 'more content' },
]
const ASK_BACKEND_RESPONSE = { answer: 'The answer is 42.', sources: SOURCES }

describe('ask()', () => {
  it('calls POST /query with video_id in the body', async () => {
    vi.stubGlobal('fetch', mockFetch(ASK_BACKEND_RESPONSE))
    await apiClient.ask('vid1', 'What is the answer?')
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe(`${API_BASE}/query`)
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body).video_id).toBe('vid1')
  })

  it('sends question in the request body', async () => {
    vi.stubGlobal('fetch', mockFetch(ASK_BACKEND_RESPONSE))
    await apiClient.ask('vid1', 'What is the answer?')
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.question).toBe('What is the answer?')
  })

  it('sends k: 5 by default', async () => {
    vi.stubGlobal('fetch', mockFetch(ASK_BACKEND_RESPONSE))
    await apiClient.ask('vid1', 'q?')
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.k).toBe(5)
  })

  it('sends custom k when specified', async () => {
    vi.stubGlobal('fetch', mockFetch(ASK_BACKEND_RESPONSE))
    await apiClient.ask('vid1', 'q?', [], { k: 3 })
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.k).toBe(3)
  })

  it('resolves with answer string', async () => {
    vi.stubGlobal('fetch', mockFetch(ASK_BACKEND_RESPONSE))
    const result = await apiClient.ask('vid1', 'q?')
    expect(result.answer).toBe('The answer is 42.')
  })

  it('maps sources to citations with correct shape', async () => {
    vi.stubGlobal('fetch', mockFetch(ASK_BACKEND_RESPONSE))
    const result = await apiClient.ask('vid1', 'q?')
    expect(result.citations).toHaveLength(2)
    expect(result.citations[0]).toEqual({
      chunk_id: 'c1',
      start_ts: 5.0,
      end_ts: 10.0,
      text: 'hello world',
    })
  })

  it('sets refused: false on a normal answer', async () => {
    vi.stubGlobal('fetch', mockFetch(ASK_BACKEND_RESPONSE))
    const result = await apiClient.ask('vid1', 'q?')
    expect(result.refused).toBe(false)
  })

  it('sets refused: true when model returns the refusal sentinel', async () => {
    const refusalResponse = {
      answer: "I'm sorry, that information isn't available in the video transcript.",
      sources: [],
    }
    vi.stubGlobal('fetch', mockFetch(refusalResponse))
    const result = await apiClient.ask('vid1', 'q?')
    expect(result.refused).toBe(true)
  })

  it('returns empty citations array on refusal', async () => {
    const refusalResponse = {
      answer: "I'm sorry, that information isn't available in the video transcript.",
      sources: [],
    }
    vi.stubGlobal('fetch', mockFetch(refusalResponse))
    const result = await apiClient.ask('vid1', 'q?')
    expect(result.citations).toHaveLength(0)
  })

  it('throws VideoNotIngestedError on 404', async () => {
    vi.stubGlobal('fetch', mockFetch({ detail: 'not found' }, { ok: false, status: 404 }))
    const err = await apiClient.ask('vid1', 'q?').catch((e) => e)
    expect(err).toBeInstanceOf(VideoNotIngestedError)
    expect(err.videoId).toBe('vid1')
  })

  it('VideoNotIngestedError carries the video id', async () => {
    vi.stubGlobal('fetch', mockFetch({ detail: 'not found' }, { ok: false, status: 404 }))
    const err = await apiClient.ask('myVid', 'q?').catch((e) => e)
    expect(err.videoId).toBe('myVid')
  })

  it('throws BackendUnreachableError on network failure', async () => {
    vi.stubGlobal('fetch', mockNetworkError())
    await expect(apiClient.ask('vid1', 'q?')).rejects.toBeInstanceOf(BackendUnreachableError)
  })

  it('handles missing sources field gracefully', async () => {
    vi.stubGlobal('fetch', mockFetch({ answer: 'ok' }))
    const result = await apiClient.ask('vid1', 'q?')
    expect(result.citations).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// setApiKey()
// ---------------------------------------------------------------------------

describe('setApiKey()', () => {
  it('calls PUT /config/api-key', async () => {
    vi.stubGlobal('fetch', mockFetch({}))
    await apiClient.setApiKey('sk-test')
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe(`${API_BASE}/config/api-key`)
    expect(opts.method).toBe('PUT')
  })

  it('sends the key in the request body', async () => {
    vi.stubGlobal('fetch', mockFetch({}))
    await apiClient.setApiKey('sk-mykey')
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.api_key).toBe('sk-mykey')
  })

  it('throws BackendUnreachableError on network failure', async () => {
    vi.stubGlobal('fetch', mockNetworkError())
    await expect(apiClient.setApiKey('sk-test')).rejects.toBeInstanceOf(BackendUnreachableError)
  })
})

// ---------------------------------------------------------------------------
// clearApiKey()
// ---------------------------------------------------------------------------

describe('clearApiKey()', () => {
  it('calls DELETE /config/api-key', async () => {
    vi.stubGlobal('fetch', mockFetch({}))
    await apiClient.clearApiKey()
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe(`${API_BASE}/config/api-key`)
    expect(opts.method).toBe('DELETE')
  })

  it('throws BackendUnreachableError on network failure', async () => {
    vi.stubGlobal('fetch', mockNetworkError())
    await expect(apiClient.clearApiKey()).rejects.toBeInstanceOf(BackendUnreachableError)
  })
})

// ---------------------------------------------------------------------------
// getStatus()
// ---------------------------------------------------------------------------

describe('getStatus()', () => {
  it('calls GET /config/status', async () => {
    vi.stubGlobal('fetch', mockFetch({ has_api_key: true }))
    await apiClient.getStatus()
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe(`${API_BASE}/config/status`)
    expect(opts.method).toBeUndefined()
  })

  it('resolves with the parsed response body', async () => {
    vi.stubGlobal('fetch', mockFetch({ has_api_key: false }))
    const result = await apiClient.getStatus()
    expect(result).toEqual({ has_api_key: false })
  })

  it('throws BackendUnreachableError on network failure', async () => {
    vi.stubGlobal('fetch', mockNetworkError())
    await expect(apiClient.getStatus()).rejects.toBeInstanceOf(BackendUnreachableError)
  })
})

// ---------------------------------------------------------------------------
// Content-Type header (all mutating requests)
// ---------------------------------------------------------------------------

describe('Content-Type header', () => {
  it('ingest sends Content-Type: application/json', async () => {
    vi.stubGlobal('fetch', mockFetch(INGEST_RESPONSE))
    await apiClient.ingest('vid1')
    expect(lastCallHeaders()['Content-Type']).toBe('application/json')
  })

  it('ask sends Content-Type: application/json', async () => {
    vi.stubGlobal('fetch', mockFetch(ASK_BACKEND_RESPONSE))
    await apiClient.ask('vid1', 'q?')
    expect(lastCallHeaders()['Content-Type']).toBe('application/json')
  })
})
