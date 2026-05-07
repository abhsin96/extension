import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Chrome API stub — must be set up before importing background.js
// ---------------------------------------------------------------------------

let messageListener = null

const chrome = {
  runtime: {
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    onMessage: {
      addListener: vi.fn((fn) => {
        messageListener = fn
      }),
    },
  },
  storage: {
    session: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
}

vi.stubGlobal('chrome', chrome)

// ---------------------------------------------------------------------------
// apiClient mock — stub all methods before the module is imported
// ---------------------------------------------------------------------------

vi.mock('../src/api/client.js', () => ({
  default: {
    pingHealth: vi.fn(),
    ingest: vi.fn(),
    ask: vi.fn(),
  },
}))

// Import after stubs are in place
const { default: apiClient } = await import('../src/api/client.js')
await import('../src/background.js')

// ---------------------------------------------------------------------------
// Helper: dispatch a message and collect the sendResponse argument
// ---------------------------------------------------------------------------

function dispatch(message) {
  return new Promise((resolve) => {
    const keepOpen = messageListener(message, {}, resolve)
    // If the handler returns false (unknown type), sendResponse is called sync
    if (keepOpen === false) {
      // already resolved synchronously
    }
  })
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// GET_CURRENT_VIDEO
// ---------------------------------------------------------------------------

describe('GET_CURRENT_VIDEO', () => {
  it('returns null when no video has been set', async () => {
    chrome.storage.session.get.mockResolvedValue({ currentVideoId: null })
    const res = await dispatch({ type: 'GET_CURRENT_VIDEO' })
    expect(res).toEqual({ ok: true, data: { videoId: null } })
  })

  it('returns videoId from session storage when memory is cold', async () => {
    chrome.storage.session.get.mockResolvedValue({ currentVideoId: 'storedVid' })
    const res = await dispatch({ type: 'GET_CURRENT_VIDEO' })
    expect(res.ok).toBe(true)
    expect(res.data.videoId).toBe('storedVid')
  })
})

// ---------------------------------------------------------------------------
// VIDEO_CHANGED
// ---------------------------------------------------------------------------

describe('VIDEO_CHANGED', () => {
  it('calls pingHealth', async () => {
    apiClient.pingHealth.mockResolvedValue({ status: 'ok' })
    await dispatch({ type: 'VIDEO_CHANGED', videoId: 'vid1' })
    expect(apiClient.pingHealth).toHaveBeenCalledOnce()
  })

  it('returns ok: true with videoId, url and health', async () => {
    const health = { status: 'ok', has_api_key: true }
    apiClient.pingHealth.mockResolvedValue(health)
    const res = await dispatch({ type: 'VIDEO_CHANGED', videoId: 'abc', url: 'https://youtube.com/watch?v=abc' })
    expect(res).toEqual({ ok: true, data: { videoId: 'abc', url: 'https://youtube.com/watch?v=abc', health } })
  })

  it('returns ok: false on apiClient error', async () => {
    const err = Object.assign(new Error('unreachable'), { code: 'BACKEND_UNREACHABLE' })
    apiClient.pingHealth.mockRejectedValue(err)
    const res = await dispatch({ type: 'VIDEO_CHANGED', videoId: 'vid1' })
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('BACKEND_UNREACHABLE')
  })
})

// ---------------------------------------------------------------------------
// INGEST_VIDEO
// ---------------------------------------------------------------------------

describe('INGEST_VIDEO', () => {
  const INGEST_RESPONSE = { status: 'done', chunk_count: 12, cached: false }

  it('calls apiClient.ingest with videoId and force: false by default', async () => {
    apiClient.ingest.mockResolvedValue(INGEST_RESPONSE)
    await dispatch({ type: 'INGEST_VIDEO', videoId: 'vid1' })
    expect(apiClient.ingest).toHaveBeenCalledWith('vid1', { force: false })
  })

  it('passes force: true when specified', async () => {
    apiClient.ingest.mockResolvedValue(INGEST_RESPONSE)
    await dispatch({ type: 'INGEST_VIDEO', videoId: 'vid1', force: true })
    expect(apiClient.ingest).toHaveBeenCalledWith('vid1', { force: true })
  })

  it('returns ok: true with ingest data', async () => {
    apiClient.ingest.mockResolvedValue(INGEST_RESPONSE)
    const res = await dispatch({ type: 'INGEST_VIDEO', videoId: 'vid1' })
    expect(res).toEqual({ ok: true, data: INGEST_RESPONSE })
  })

  it('returns ok: false on TranscriptDisabledError', async () => {
    const err = Object.assign(new Error('no transcript'), { code: 'TRANSCRIPT_DISABLED' })
    apiClient.ingest.mockRejectedValue(err)
    const res = await dispatch({ type: 'INGEST_VIDEO', videoId: 'vid1' })
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('TRANSCRIPT_DISABLED')
    expect(res.error.message).toBe('no transcript')
  })
})

// ---------------------------------------------------------------------------
// ASK_QUESTION
// ---------------------------------------------------------------------------

describe('ASK_QUESTION', () => {
  const ASK_RESPONSE = { answer: 'The answer is 42.', citations: [], refused: false }

  it('calls apiClient.ask with videoId and question', async () => {
    apiClient.ask.mockResolvedValue(ASK_RESPONSE)
    await dispatch({ type: 'ASK_QUESTION', videoId: 'vid1', question: 'What is it?' })
    expect(apiClient.ask).toHaveBeenCalledWith('vid1', 'What is it?', [], {})
  })

  it('forwards custom k to apiClient.ask', async () => {
    apiClient.ask.mockResolvedValue(ASK_RESPONSE)
    await dispatch({ type: 'ASK_QUESTION', videoId: 'vid1', question: 'q?', k: 3 })
    expect(apiClient.ask).toHaveBeenCalledWith('vid1', 'q?', [], { k: 3 })
  })

  it('returns ok: true with ask data', async () => {
    apiClient.ask.mockResolvedValue(ASK_RESPONSE)
    const res = await dispatch({ type: 'ASK_QUESTION', videoId: 'vid1', question: 'q?' })
    expect(res).toEqual({ ok: true, data: ASK_RESPONSE })
  })

  it('returns ok: false on VideoNotIngestedError', async () => {
    const err = Object.assign(new Error("hasn't been analysed"), { code: 'VIDEO_NOT_INGESTED' })
    apiClient.ask.mockRejectedValue(err)
    const res = await dispatch({ type: 'ASK_QUESTION', videoId: 'vid1', question: 'q?' })
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('VIDEO_NOT_INGESTED')
  })
})

// ---------------------------------------------------------------------------
// PING_HEALTH
// ---------------------------------------------------------------------------

describe('PING_HEALTH', () => {
  it('calls apiClient.pingHealth', async () => {
    apiClient.pingHealth.mockResolvedValue({ status: 'ok' })
    await dispatch({ type: 'PING_HEALTH' })
    expect(apiClient.pingHealth).toHaveBeenCalledOnce()
  })

  it('returns ok: true with health data', async () => {
    const health = { status: 'ok', has_api_key: true }
    apiClient.pingHealth.mockResolvedValue(health)
    const res = await dispatch({ type: 'PING_HEALTH' })
    expect(res).toEqual({ ok: true, data: health })
  })

  it('returns ok: false when backend is unreachable', async () => {
    const err = Object.assign(new Error('unreachable'), { code: 'BACKEND_UNREACHABLE' })
    apiClient.pingHealth.mockRejectedValue(err)
    const res = await dispatch({ type: 'PING_HEALTH' })
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('BACKEND_UNREACHABLE')
  })
})

// ---------------------------------------------------------------------------
// Unknown message type
// ---------------------------------------------------------------------------

describe('unknown message type', () => {
  it('returns ok: false with UNKNOWN_MESSAGE_TYPE code', async () => {
    const res = await dispatch({ type: 'DOES_NOT_EXIST' })
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('UNKNOWN_MESSAGE_TYPE')
  })

  it('includes the unknown type in the error message', async () => {
    const res = await dispatch({ type: 'DOES_NOT_EXIST' })
    expect(res.error.message).toContain('DOES_NOT_EXIST')
  })

  it('handles null/missing type gracefully', async () => {
    const res = await dispatch({})
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('UNKNOWN_MESSAGE_TYPE')
  })
})

// ---------------------------------------------------------------------------
// Error serialisation — errors without a code field
// ---------------------------------------------------------------------------

describe('error serialisation', () => {
  it('falls back to UNKNOWN code when error has no code', async () => {
    apiClient.pingHealth.mockRejectedValue(new Error('something broke'))
    const res = await dispatch({ type: 'PING_HEALTH' })
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('UNKNOWN')
  })

  it('includes the error message in the response', async () => {
    apiClient.pingHealth.mockRejectedValue(new Error('boom'))
    const res = await dispatch({ type: 'PING_HEALTH' })
    expect(res.error.message).toBe('boom')
  })
})
