import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Chrome API stub — must be set up before importing background.js
// ---------------------------------------------------------------------------

let messageListener:
  | ((
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: any) => void,
    ) => boolean | void)
  | null = null

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

function dispatch(message: any) {
  return new Promise((resolve) => {
    const keepOpen = messageListener!(message, {} as chrome.runtime.MessageSender, resolve)
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
    const res = (await dispatch({ type: 'GET_CURRENT_VIDEO' })) as any
    expect(res).toEqual({ ok: true, data: { videoId: null } })
  })

  it('returns videoId from session storage when memory is cold', async () => {
    chrome.storage.session.get.mockResolvedValue({ currentVideoId: 'storedVid' })
    const res = (await dispatch({ type: 'GET_CURRENT_VIDEO' })) as any
    expect(res.ok).toBe(true)
    expect(res.data.videoId).toBe('storedVid')
  })
})

// ---------------------------------------------------------------------------
// VIDEO_CHANGED
// ---------------------------------------------------------------------------

describe('VIDEO_CHANGED', () => {
  it('calls pingHealth', async () => {
    ;(apiClient.pingHealth as any).mockResolvedValue({ status: 'ok' })
    await dispatch({ type: 'VIDEO_CHANGED', videoId: 'vid1' })
    expect(apiClient.pingHealth).toHaveBeenCalledOnce()
  })

  it('returns ok: true with videoId, url and health', async () => {
    const health = { status: 'ok', has_api_key: true }
    ;(apiClient.pingHealth as any).mockResolvedValue(health)
    const res = (await dispatch({
      type: 'VIDEO_CHANGED',
      videoId: 'abc',
      url: 'https://youtube.com/watch?v=abc',
    })) as any
    expect(res).toEqual({
      ok: true,
      data: { videoId: 'abc', url: 'https://youtube.com/watch?v=abc', health },
    })
  })

  it('returns ok: false on apiClient error', async () => {
    const err = Object.assign(new Error('unreachable'), { code: 'BACKEND_UNREACHABLE' })
    ;(apiClient.pingHealth as any).mockRejectedValue(err)
    const res = (await dispatch({ type: 'VIDEO_CHANGED', videoId: 'vid1' })) as any
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
    ;(apiClient.ingest as any).mockResolvedValue(INGEST_RESPONSE)
    await dispatch({ type: 'INGEST_VIDEO', videoId: 'vid1' })
    expect(apiClient.ingest).toHaveBeenCalledWith('vid1', { force: false })
  })

  it('passes force: true when specified', async () => {
    ;(apiClient.ingest as any).mockResolvedValue(INGEST_RESPONSE)
    await dispatch({ type: 'INGEST_VIDEO', videoId: 'vid1', force: true })
    expect(apiClient.ingest).toHaveBeenCalledWith('vid1', { force: true })
  })

  it('returns ok: true with ingest data', async () => {
    ;(apiClient.ingest as any).mockResolvedValue(INGEST_RESPONSE)
    const res = (await dispatch({ type: 'INGEST_VIDEO', videoId: 'vid1' })) as any
    expect(res).toEqual({ ok: true, data: INGEST_RESPONSE })
  })

  it('calls apiClient.ingest with stream: true and onProgress when tabId is provided', async () => {
    ;(apiClient.ingest as any).mockResolvedValue(INGEST_RESPONSE)
    await dispatch({ type: 'INGEST_VIDEO', videoId: 'vid1', tabId: 123 })
    expect(apiClient.ingest).toHaveBeenCalledWith('vid1', {
      force: false,
      stream: true,
      onProgress: expect.any(Function),
    })
  })

  it('sends INGEST_PROGRESS events via chrome.tabs.sendMessage when onProgress is triggered', async () => {
    let capturedOnProgress: any
    ;(apiClient.ingest as any).mockImplementation((_vid: string, opts: any) => {
      capturedOnProgress = opts.onProgress
      return Promise.resolve(INGEST_RESPONSE)
    })

    // Mock chrome.tabs.sendMessage
    const mockSendMessage = vi.fn().mockResolvedValue(undefined)
    ;(global as any).chrome = {
      ...((global as any).chrome || {}),
      tabs: { sendMessage: mockSendMessage },
    }

    await dispatch({ type: 'INGEST_VIDEO', videoId: 'vid1', tabId: 123 })

    // Trigger the onProgress callback
    capturedOnProgress('Fetching transcript', 50)

    expect(mockSendMessage).toHaveBeenCalledWith(123, {
      type: 'INGEST_PROGRESS',
      step: 'Fetching transcript',
      pct: 50,
    })
  })

  it('swallows chrome.tabs.sendMessage rejections (tab closed case)', async () => {
    let capturedOnProgress: any
    ;(apiClient.ingest as any).mockImplementation((_vid: string, opts: any) => {
      capturedOnProgress = opts.onProgress
      return Promise.resolve(INGEST_RESPONSE)
    })

    // Mock chrome.tabs.sendMessage to reject (tab closed)
    const mockSendMessage = vi.fn().mockRejectedValue(new Error('Tab closed'))
    ;(global as any).chrome = {
      ...((global as any).chrome || {}),
      tabs: { sendMessage: mockSendMessage },
    }

    await dispatch({ type: 'INGEST_VIDEO', videoId: 'vid1', tabId: 123 })

    // Trigger the onProgress callback - should not throw
    await expect(async () => {
      capturedOnProgress('Fetching transcript', 50)
      // Give it a tick to process the rejection
      await new Promise((resolve) => setTimeout(resolve, 0))
    }).not.toThrow()
  })

  it('calls apiClient.ingest with stream: true when tabId is provided', async () => {
    ;(apiClient.ingest as any).mockResolvedValue(INGEST_RESPONSE)
    await dispatch({ type: 'INGEST_VIDEO', videoId: 'vid1', tabId: 42 })
    expect(apiClient.ingest).toHaveBeenCalledWith('vid1', expect.objectContaining({ stream: true }))
  })

  it('sends INGEST_PROGRESS to the tab via chrome.tabs.sendMessage', async () => {
    // Mock chrome.tabs.sendMessage
    const mockSendMessage = vi.fn().mockResolvedValue(undefined)
    ;(global as any).chrome = {
      ...((global as any).chrome || {}),
      tabs: { sendMessage: mockSendMessage },
    }
    ;(apiClient.ingest as any).mockImplementationOnce(async (_id: string, opts: any) => {
      opts.onProgress?.('Fetching', 20)
      return INGEST_RESPONSE
    })

    await dispatch({ type: 'INGEST_VIDEO', videoId: 'vid1', tabId: 42 })

    expect(mockSendMessage).toHaveBeenCalledWith(42, {
      type: 'INGEST_PROGRESS',
      step: 'Fetching',
      pct: 20,
    })
  })

  it('falls back to stream: false when tabId is absent', async () => {
    ;(apiClient.ingest as any).mockResolvedValue(INGEST_RESPONSE)
    await dispatch({ type: 'INGEST_VIDEO', videoId: 'vid1' })
    expect(apiClient.ingest).toHaveBeenCalledWith(
      'vid1',
      expect.not.objectContaining({ stream: true }),
    )
  })

  it('returns ok: false on TranscriptDisabledError', async () => {
    const err = Object.assign(new Error('no transcript'), { code: 'TRANSCRIPT_DISABLED' })
    ;(apiClient.ingest as any).mockRejectedValue(err)
    const res = (await dispatch({ type: 'INGEST_VIDEO', videoId: 'vid1' })) as any
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('TRANSCRIPT_DISABLED')
    expect(res.error.message).toBe('no transcript')
  })
})

// ---------------------------------------------------------------------------
// ASK_QUESTION
// ---------------------------------------------------------------------------

describe('ASK_QUESTION', () => {
  const ASK_RESPONSE = {
    answer: 'The answer is 42.',
    citations: [],
    refused: false,
    thread_id: null,
  }

  it('calls apiClient.ask with videoId and question', async () => {
    ;(apiClient.ask as any).mockResolvedValue(ASK_RESPONSE)
    await dispatch({ type: 'ASK_QUESTION', videoId: 'vid1', question: 'What is it?' })
    expect(apiClient.ask).toHaveBeenCalledWith('vid1', 'What is it?', [], { threadId: null })
  })

  it('forwards custom k to apiClient.ask', async () => {
    ;(apiClient.ask as any).mockResolvedValue(ASK_RESPONSE)
    await dispatch({ type: 'ASK_QUESTION', videoId: 'vid1', question: 'q?', k: 3 })
    expect(apiClient.ask).toHaveBeenCalledWith('vid1', 'q?', [], { k: 3, threadId: null })
  })

  it('forwards threadId to apiClient.ask when provided', async () => {
    ;(apiClient.ask as any).mockResolvedValue(ASK_RESPONSE)
    await dispatch({
      type: 'ASK_QUESTION',
      videoId: 'vid1',
      question: 'q?',
      threadId: 'thread-123',
    })
    expect(apiClient.ask).toHaveBeenCalledWith('vid1', 'q?', [], { threadId: 'thread-123' })
  })

  it('returns ok: true with ask data including thread_id', async () => {
    const responseWithThread = { ...ASK_RESPONSE, thread_id: 'thread-456' }
    ;(apiClient.ask as any).mockResolvedValue(responseWithThread)
    const res = (await dispatch({ type: 'ASK_QUESTION', videoId: 'vid1', question: 'q?' })) as any
    expect(res).toEqual({ ok: true, data: responseWithThread })
    expect(res.data.thread_id).toBe('thread-456')
  })

  it('returns ok: true with thread_id: null when no thread exists', async () => {
    const responseWithoutThread = { ...ASK_RESPONSE, thread_id: null }
    ;(apiClient.ask as any).mockResolvedValue(responseWithoutThread)
    const res = (await dispatch({ type: 'ASK_QUESTION', videoId: 'vid1', question: 'q?' })) as any
    expect(res).toEqual({ ok: true, data: responseWithoutThread })
    expect(res.data.thread_id).toBeNull()
  })

  it('returns ok: false on VideoNotIngestedError', async () => {
    const err = Object.assign(new Error("hasn't been analysed"), { code: 'VIDEO_NOT_INGESTED' })
    ;(apiClient.ask as any).mockRejectedValue(err)
    const res = (await dispatch({ type: 'ASK_QUESTION', videoId: 'vid1', question: 'q?' })) as any
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('VIDEO_NOT_INGESTED')
  })

  it('handles history parameter correctly', async () => {
    const history = [{ role: 'user', content: 'previous question' }]
    ;(apiClient.ask as any).mockResolvedValue(ASK_RESPONSE)
    await dispatch({
      type: 'ASK_QUESTION',
      videoId: 'vid1',
      question: 'follow-up?',
      history,
    })
    expect(apiClient.ask).toHaveBeenCalledWith('vid1', 'follow-up?', history, {
      threadId: null,
    })
  })
})

// ---------------------------------------------------------------------------
// PING_HEALTH
// ---------------------------------------------------------------------------

describe('PING_HEALTH', () => {
  it('calls apiClient.pingHealth', async () => {
    ;(apiClient.pingHealth as any).mockResolvedValue({ status: 'ok' })
    await dispatch({ type: 'PING_HEALTH' })
    expect(apiClient.pingHealth).toHaveBeenCalledOnce()
  })

  it('returns ok: true with health data', async () => {
    const health = { status: 'ok', has_api_key: true }
    ;(apiClient.pingHealth as any).mockResolvedValue(health)
    const res = (await dispatch({ type: 'PING_HEALTH' })) as any
    expect(res).toEqual({ ok: true, data: health })
  })

  it('returns ok: false when backend is unreachable', async () => {
    const err = Object.assign(new Error('unreachable'), { code: 'BACKEND_UNREACHABLE' })
    ;(apiClient.pingHealth as any).mockRejectedValue(err)
    const res = (await dispatch({ type: 'PING_HEALTH' })) as any
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('BACKEND_UNREACHABLE')
  })
})

// ---------------------------------------------------------------------------
// Unknown message type
// ---------------------------------------------------------------------------

describe('unknown message type', () => {
  it('returns ok: false with UNKNOWN_MESSAGE_TYPE code', async () => {
    const res = (await dispatch({ type: 'DOES_NOT_EXIST' })) as any
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('UNKNOWN_MESSAGE_TYPE')
  })

  it('includes the unknown type in the error message', async () => {
    const res = (await dispatch({ type: 'DOES_NOT_EXIST' })) as any
    expect(res.error.message).toContain('DOES_NOT_EXIST')
  })

  it('handles null/missing type gracefully', async () => {
    const res = (await dispatch({})) as any
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('UNKNOWN_MESSAGE_TYPE')
  })
})

// ---------------------------------------------------------------------------
// Error serialisation — errors without a code field
// ---------------------------------------------------------------------------

describe('error serialisation', () => {
  it('falls back to UNKNOWN code when error has no code', async () => {
    ;(apiClient.pingHealth as any).mockRejectedValue(new Error('something broke'))
    const res = (await dispatch({ type: 'PING_HEALTH' })) as any
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('UNKNOWN')
  })

  it('includes the error message in the response', async () => {
    ;(apiClient.pingHealth as any).mockRejectedValue(new Error('boom'))
    const res = (await dispatch({ type: 'PING_HEALTH' })) as any
    expect(res.error.message).toBe('boom')
  })
})
