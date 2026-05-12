import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQaSession } from '../src/wiring.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSidebar() {
  return {
    addMessage: vi.fn(),
    addSkeletonMessage: vi.fn(),
    finalizeMessage: vi.fn(),
    removeMessage: vi.fn(),
    setLoading: vi.fn(),
    setCancellable: vi.fn(),
    clearCancellable: vi.fn(),
    showToast: vi.fn(),
    hideToast: vi.fn(),
    clearMessages: vi.fn(),
    clearInput: vi.fn(),
    showEmptyState: vi.fn(),
    clearEmptyState: vi.fn(),
  }
}

function makeStorage(initialTurns: any[] = []) {
  let _turns = [...initialTurns]
  return {
    getHistory: vi.fn(async () => [..._turns]),
    appendTurn: vi.fn(async (_id: string, turn: any) => {
      _turns.push(turn)
    }),
    clearHistory: vi.fn(async () => {
      _turns = []
    }),
    _getTurns: () => _turns,
  }
}

/** Flush all pending microtasks and one macrotask tick */
async function flushAsync() {
  await new Promise((r) => setTimeout(r, 0))
}

const VIDEO_ID = 'vid_abc'
const QUESTION = 'What is this video about?'

const INGEST_OK = { ok: true, data: { status: 'done', chunk_count: 8, cached: false } }
const ASK_OK = { ok: true, data: { answer: 'It is about testing.', refused: false, citations: [] } }

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let sidebar: any
let sendMessage: any
let session: any

beforeEach(() => {
  sidebar = makeSidebar()
  sendMessage = vi.fn()

  // Mock chrome API for all tests
  ;(global as any).chrome = {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
      },
      sendMessage: vi.fn(),
    },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 123 }]),
    },
  }

  session = createQaSession({ sidebar: sidebar as any, sendMessage })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('ask happy path', () => {
  it('auto-ingests and shows the assistant answer', async () => {
    sendMessage
      .mockResolvedValueOnce(INGEST_OK) // INGEST_VIDEO
      .mockResolvedValueOnce(ASK_OK) // ASK_QUESTION

    await session.handleSend(QUESTION, VIDEO_ID)

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'INGEST_VIDEO', videoId: VIDEO_ID }),
    )
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ASK_QUESTION', videoId: VIDEO_ID, question: QUESTION }),
    )
    expect(sidebar.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', text: QUESTION }),
    )
    expect(sidebar.finalizeMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ role: 'assistant', text: ASK_OK.data.answer, refused: false }),
    )
  })

  it('receives live progress updates during ingest streaming', async () => {
    // Mock chrome.runtime.onMessage to simulate INGEST_PROGRESS events
    const progressListeners: Array<(msg: any) => void> = []
    const mockOnMessage = {
      addListener: vi.fn((callback: (msg: any) => void) => {
        progressListeners.push(callback)
      }),
    }
    const originalChrome = (global as any).chrome
    ;(global as any).chrome = {
      ...((global as any).chrome ?? {}),
      runtime: {
        ...((global as any).chrome?.runtime ?? {}),
        onMessage: mockOnMessage,
        sendMessage: sendMessage,
      },
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 123 }]),
      },
    }

    // Create a new session to register the progress listener
    const sessionWithProgress = createQaSession({ sidebar: sidebar as any, sendMessage })

    let resolveIngest: (v: unknown) => void
    const ingestPending = new Promise((r) => {
      resolveIngest = r
    })

    sendMessage
      .mockImplementationOnce(() => ingestPending) // INGEST_VIDEO — holds open
      .mockResolvedValueOnce(ASK_OK) // ASK_QUESTION

    const sendPromise = sessionWithProgress.handleSend(QUESTION, VIDEO_ID)
    await flushAsync() // reach the await sendMessage point

    // dispatch progress while ingest is still pending
    progressListeners.forEach((l) =>
      l({ type: 'INGEST_PROGRESS', step: 'Fetching transcript', pct: 20 }),
    )
    await flushAsync()
    progressListeners.forEach((l) => l({ type: 'INGEST_PROGRESS', step: 'Chunking', pct: 50 }))
    await flushAsync()
    progressListeners.forEach((l) => l({ type: 'INGEST_PROGRESS', step: 'Embedding', pct: 80 }))
    await flushAsync()

    resolveIngest!(INGEST_OK) // now complete the ingest
    await sendPromise

    expect(sidebar.setLoading).toHaveBeenCalledWith(true, { text: 'Fetching transcript… 20%' })
    expect(sidebar.setLoading).toHaveBeenCalledWith(true, { text: 'Chunking… 50%' })
    expect(sidebar.setLoading).toHaveBeenCalledWith(true, { text: 'Embedding… 80%' })

    // Restore original chrome
    ;(global as any).chrome = originalChrome
  })

  it('shows refused style when backend marks answer refused', async () => {
    const refusedAsk = {
      ok: true,
      data: { answer: 'Sorry, not available.', refused: true, citations: [] },
    }
    sendMessage.mockResolvedValueOnce(INGEST_OK).mockResolvedValueOnce(refusedAsk)

    await session.handleSend(QUESTION, VIDEO_ID)

    expect(sidebar.finalizeMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ refused: true }),
    )
  })
})

// ---------------------------------------------------------------------------
// Auto-ingest once per session
// ---------------------------------------------------------------------------

describe('auto-ingest tracking', () => {
  it('sends INGEST_VIDEO on the first question for a video', async () => {
    sendMessage.mockResolvedValueOnce(INGEST_OK).mockResolvedValueOnce(ASK_OK)

    await session.handleSend(QUESTION, VIDEO_ID)

    const ingestCalls = sendMessage.mock.calls.filter((c: any) => c[0].type === 'INGEST_VIDEO')
    expect(ingestCalls).toHaveLength(1)
  })

  it('does NOT send INGEST_VIDEO on the second question for the same video', async () => {
    sendMessage.mockResolvedValueOnce(INGEST_OK).mockResolvedValue(ASK_OK)

    await session.handleSend(QUESTION, VIDEO_ID) // first — ingests
    sendMessage.mockClear()
    await session.handleSend('Second question?', VIDEO_ID) // second — no ingest

    const ingestCalls = sendMessage.mock.calls.filter((c: any) => c[0].type === 'INGEST_VIDEO')
    expect(ingestCalls).toHaveLength(0)
  })

  it('shows "Preparing transcript…" loading text during ingest', async () => {
    sendMessage.mockResolvedValueOnce(INGEST_OK).mockResolvedValueOnce(ASK_OK)

    await session.handleSend(QUESTION, VIDEO_ID)

    expect(sidebar.setLoading).toHaveBeenCalledWith(true, { text: 'Preparing transcript\u2026' })
  })
})

// ---------------------------------------------------------------------------
// Cancel mid-request
// ---------------------------------------------------------------------------

describe('cancel', () => {
  it('cancel during ask removes skeleton and ignores response', async () => {
    // First ask: ingest succeeds so vid is cached
    sendMessage.mockResolvedValueOnce(INGEST_OK).mockResolvedValueOnce(ASK_OK)
    await session.handleSend(QUESTION, VIDEO_ID)
    sidebar.setCancellable.mockClear()
    sidebar.finalizeMessage.mockClear()
    sidebar.removeMessage.mockClear()
    sendMessage.mockClear()

    // Second ask: ASK_QUESTION never resolves (pending)
    let resolveAsk: any
    sendMessage.mockImplementation(
      () =>
        new Promise((r) => {
          resolveAsk = r
        }),
    )

    const askPromise = session.handleSend('New question?', VIDEO_ID)
    await flushAsync() // let handleSend reach the await sendMessage

    // Grab cancel callback and invoke it
    const cancelFn = sidebar.setCancellable.mock.calls.at(-1)?.[0]
    expect(cancelFn).toBeTypeOf('function')
    cancelFn!()

    // Now resolve the ask (after cancel)
    resolveAsk!(ASK_OK)
    await askPromise

    expect(sidebar.removeMessage).toHaveBeenCalled()
    expect(sidebar.finalizeMessage).not.toHaveBeenCalled()
  })

  it('cancel during ingest phase stops before asking', async () => {
    let resolveIngest: any
    sendMessage.mockImplementation(
      () =>
        new Promise((r) => {
          resolveIngest = r
        }),
    )

    const askPromise = session.handleSend(QUESTION, VIDEO_ID)
    await flushAsync()

    const cancelFn = sidebar.setCancellable.mock.calls.at(-1)?.[0]
    cancelFn!()

    resolveIngest!(INGEST_OK)
    await askPromise

    // ASK_QUESTION was never sent
    const askCalls = sendMessage.mock.calls.filter((c: any) => c[0].type === 'ASK_QUESTION')
    expect(askCalls).toHaveLength(0)
    expect(sidebar.finalizeMessage).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

describe('no video ID', () => {
  it('shows error message and does not call sendMessage', async () => {
    await session.handleSend(QUESTION, null)

    expect(sendMessage).not.toHaveBeenCalled()
    expect(sidebar.addMessage).toHaveBeenCalledWith(expect.objectContaining({ role: 'error' }))
  })
})

describe('backend unreachable', () => {
  it('shows toast on BACKEND_UNREACHABLE during ask', async () => {
    const unreachable = {
      ok: false,
      error: { code: 'BACKEND_UNREACHABLE', message: 'Cannot reach the backend.' },
    }
    sendMessage.mockResolvedValueOnce(INGEST_OK).mockResolvedValueOnce(unreachable)

    await session.handleSend(QUESTION, VIDEO_ID)

    expect(sidebar.showToast).toHaveBeenCalledWith(expect.objectContaining({ action: 'Retry' }))
  })

  it('shows toast on BACKEND_UNREACHABLE during ingest', async () => {
    const unreachable = {
      ok: false,
      error: { code: 'BACKEND_UNREACHABLE', message: 'Cannot reach the backend.' },
    }
    sendMessage.mockResolvedValueOnce(unreachable) // INGEST fails

    await session.handleSend(QUESTION, VIDEO_ID)

    expect(sidebar.showToast).toHaveBeenCalledWith(expect.objectContaining({ action: 'Retry' }))
    // ASK was never sent
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('health poll clears toast when backend recovers', async () => {
    vi.useFakeTimers()
    const unreachable = {
      ok: false,
      error: { code: 'BACKEND_UNREACHABLE', message: 'Cannot reach the backend.' },
    }
    sendMessage.mockResolvedValueOnce(INGEST_OK).mockResolvedValueOnce(unreachable)

    // Trigger the toast
    await session.handleSend(QUESTION, VIDEO_ID)
    expect(sidebar.showToast).toHaveBeenCalled()

    // PING_HEALTH returns ok now
    sendMessage.mockResolvedValue({ ok: true, data: { status: 'ok' } })

    // Advance past poll interval
    await vi.runAllTimersAsync()

    expect(sidebar.hideToast).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// History: storage integration
// ---------------------------------------------------------------------------

describe('history storage', () => {
  it('forwards conversation history to ASK_QUESTION', async () => {
    const storedTurns: any[] = [
      { role: 'user', content: 'First question?', timestamp: 1 },
      { role: 'assistant', content: 'First answer.', timestamp: 2 },
    ]
    const storage = makeStorage(storedTurns)
    const localSidebar = makeSidebar()
    const localSendMessage = vi.fn().mockResolvedValueOnce(INGEST_OK).mockResolvedValueOnce(ASK_OK)
    const localSession = createQaSession({
      sidebar: localSidebar as any,
      sendMessage: localSendMessage,
      storage,
    })

    await localSession.handleSend(QUESTION, VIDEO_ID)

    const askCall = localSendMessage.mock.calls.find((c: any) => c[0].type === 'ASK_QUESTION')
    expect(askCall![0].history).toEqual(storedTurns)
  })

  it('includes threadId: null on first question', async () => {
    const storage = makeStorage([])
    const localSidebar = makeSidebar()
    const localSendMessage = vi.fn().mockResolvedValueOnce(INGEST_OK).mockResolvedValueOnce(ASK_OK)
    const localSession = createQaSession({
      sidebar: localSidebar as any,
      sendMessage: localSendMessage,
      storage,
    })

    await localSession.handleSend(QUESTION, VIDEO_ID)

    const askCall = localSendMessage.mock.calls.find((c: any) => c[0].type === 'ASK_QUESTION')
    expect(askCall![0].threadId).toBe(null)
  })

  it('stores thread_id from response and includes it in subsequent questions', async () => {
    const askWithThread = {
      ok: true,
      data: { answer: 'First answer.', refused: false, citations: [], thread_id: 'thread-abc' },
    }
    const storage = makeStorage([])
    const localSidebar = makeSidebar()
    const localSendMessage = vi
      .fn()
      .mockResolvedValueOnce(INGEST_OK)
      .mockResolvedValueOnce(askWithThread)
      .mockResolvedValueOnce({
        ok: true,
        data: { answer: 'Second answer.', refused: false, citations: [], thread_id: 'thread-abc' },
      })
    const localSession = createQaSession({
      sidebar: localSidebar as any,
      sendMessage: localSendMessage,
      storage,
    })

    // First question
    await localSession.handleSend(QUESTION, VIDEO_ID)
    const firstAskCall = localSendMessage.mock.calls.find((c: any) => c[0].type === 'ASK_QUESTION')
    expect(firstAskCall![0].threadId).toBe(null)

    // Second question — should include thread_id
    await localSession.handleSend('Follow-up question?', VIDEO_ID)
    const secondAskCall = localSendMessage.mock.calls.filter(
      (c: any) => c[0].type === 'ASK_QUESTION',
    )[1]
    expect(secondAskCall[0].threadId).toBe('thread-abc')
  })

  it('deletes thread_id on handleClear', async () => {
    const askWithThread = {
      ok: true,
      data: { answer: 'Answer.', refused: false, citations: [], thread_id: 'thread-xyz' },
    }
    const storage = makeStorage([])
    const localSidebar = makeSidebar()
    const localSendMessage = vi
      .fn()
      .mockResolvedValueOnce(INGEST_OK)
      .mockResolvedValueOnce(askWithThread)
      .mockResolvedValueOnce(ASK_OK)
    const localSession = createQaSession({
      sidebar: localSidebar as any,
      sendMessage: localSendMessage,
      storage,
    })

    // First question establishes thread_id
    await localSession.handleSend(QUESTION, VIDEO_ID)
    const firstAskCall = localSendMessage.mock.calls.find((c: any) => c[0].type === 'ASK_QUESTION')
    expect(firstAskCall![0].threadId).toBe(null)

    // Clear conversation
    await localSession.handleClear(VIDEO_ID)

    // Next question should have threadId: null again
    await localSession.handleSend('New conversation?', VIDEO_ID)
    const afterClearCall = localSendMessage.mock.calls.filter(
      (c) => c[0].type === 'ASK_QUESTION',
    )[1]
    expect(afterClearCall[0].threadId).toBe(null)
  })

  it('appends user and assistant turns after a successful ask', async () => {
    const storage = makeStorage()
    const localSidebar = makeSidebar()
    const localSendMessage = vi.fn().mockResolvedValueOnce(INGEST_OK).mockResolvedValueOnce(ASK_OK)
    const localSession = createQaSession({
      sidebar: localSidebar as any,
      sendMessage: localSendMessage,
      storage,
    })

    await localSession.handleSend(QUESTION, VIDEO_ID)

    expect(storage.appendTurn).toHaveBeenCalledWith(VIDEO_ID, { role: 'user', content: QUESTION })
    expect(storage.appendTurn).toHaveBeenCalledWith(VIDEO_ID, {
      role: 'assistant',
      content: ASK_OK.data.answer,
    })
  })

  it('does not append turns when the ask fails', async () => {
    const storage = makeStorage()
    const localSidebar = makeSidebar()
    const localSendMessage = vi
      .fn()
      .mockResolvedValueOnce(INGEST_OK)
      .mockResolvedValueOnce({ ok: false, error: { code: 'ERR', message: 'fail' } })
    const localSession = createQaSession({
      sidebar: localSidebar as any,
      sendMessage: localSendMessage,
      storage,
    })

    await localSession.handleSend(QUESTION, VIDEO_ID)

    expect(storage.appendTurn).not.toHaveBeenCalled()
  })

  it('passes empty history when no prior turns exist', async () => {
    const storage = makeStorage([])
    const localSidebar = makeSidebar()
    const localSendMessage = vi.fn().mockResolvedValueOnce(INGEST_OK).mockResolvedValueOnce(ASK_OK)
    const localSession = createQaSession({
      sidebar: localSidebar as any,
      sendMessage: localSendMessage,
      storage,
    })

    await localSession.handleSend(QUESTION, VIDEO_ID)

    const askCall = localSendMessage.mock.calls.find((c: any) => c[0].type === 'ASK_QUESTION')
    expect(askCall![0].history).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// History: loadHistory
// ---------------------------------------------------------------------------

describe('loadHistory', () => {
  it('loads stored turns and adds them to the sidebar', async () => {
    const storedTurns: any[] = [
      { role: 'user', content: 'q1', timestamp: 1 },
      { role: 'assistant', content: 'a1', timestamp: 2 },
    ]
    const storage = makeStorage(storedTurns)
    const localSidebar = makeSidebar()
    const localSession = createQaSession({
      sidebar: localSidebar as any,
      sendMessage: vi.fn(),
      storage,
    })

    await localSession.loadHistory(VIDEO_ID)

    expect(localSidebar.addMessage).toHaveBeenCalledTimes(2)
    expect(localSidebar.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', text: 'q1' }),
    )
    expect(localSidebar.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'assistant', text: 'a1' }),
    )
  })

  it('adds nothing when history is empty', async () => {
    const storage = makeStorage([])
    const localSidebar = makeSidebar()
    const localSession = createQaSession({
      sidebar: localSidebar as any,
      sendMessage: vi.fn(),
      storage,
    })

    await localSession.loadHistory(VIDEO_ID)

    expect(localSidebar.addMessage).not.toHaveBeenCalled()
  })

  it('is a no-op when no storage is provided', async () => {
    const localSidebar = makeSidebar()
    const localSession = createQaSession({ sidebar: localSidebar as any, sendMessage: vi.fn() })

    await expect(localSession.loadHistory(VIDEO_ID)).resolves.toBeUndefined()
    expect(localSidebar.addMessage).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// History: handleClear
// ---------------------------------------------------------------------------

describe('handleClear', () => {
  it('calls storage.clearHistory with the current video ID', async () => {
    const storage = makeStorage()
    const localSession = createQaSession({
      sidebar: makeSidebar() as any,
      sendMessage: vi.fn(),
      storage,
    })

    await localSession.handleClear(VIDEO_ID)

    expect(storage.clearHistory).toHaveBeenCalledWith(VIDEO_ID)
  })

  it('is a no-op when no storage is provided', async () => {
    const localSession = createQaSession({ sidebar: makeSidebar() as any, sendMessage: vi.fn() })
    await expect(localSession.handleClear(VIDEO_ID)).resolves.toBeUndefined()
  })

  it('is a no-op when videoId is null', async () => {
    const storage = makeStorage()
    const localSession = createQaSession({
      sidebar: makeSidebar() as any,
      sendMessage: vi.fn(),
      storage,
    })
    await localSession.handleClear(null)
    expect(storage.clearHistory).not.toHaveBeenCalled()
  })

  it('deletes stored thread_id on clear', async () => {
    const askWithThread = {
      ok: true,
      data: { answer: 'Answer.', refused: false, citations: [], thread_id: 'thread-clear-test' },
    }
    const storage = makeStorage([])
    const localSidebar = makeSidebar()
    const localSendMessage = vi
      .fn()
      .mockResolvedValueOnce(INGEST_OK)
      .mockResolvedValueOnce(askWithThread)
      .mockResolvedValueOnce(ASK_OK)
    const localSession = createQaSession({
      sidebar: localSidebar as any,
      sendMessage: localSendMessage,
      storage,
    })

    // Establish thread_id
    await localSession.handleSend(QUESTION, VIDEO_ID)

    // Clear should delete thread_id
    await localSession.handleClear(VIDEO_ID)

    // Next question should not have the old thread_id
    await localSession.handleSend('After clear?', VIDEO_ID)
    const afterClearCall = localSendMessage.mock.calls.filter(
      (c) => c[0].type === 'ASK_QUESTION',
    )[1]
    expect(afterClearCall[0].threadId).toBe(null)
  })
})

// ---------------------------------------------------------------------------
// Error routing: ingest errors → empty state or error message
// ---------------------------------------------------------------------------

describe('error routing during ingest', () => {
  it('shows no-captions empty state for TRANSCRIPT_DISABLED', async () => {
    sendMessage.mockResolvedValueOnce({
      ok: false,
      error: { code: 'TRANSCRIPT_DISABLED', message: 'No transcript.' },
    })
    await session.handleSend(QUESTION, VIDEO_ID)
    expect(sidebar.showEmptyState).toHaveBeenCalledWith('no-captions')
    expect(sidebar.addMessage).not.toHaveBeenCalledWith(expect.objectContaining({ role: 'error' }))
  })

  it('shows backend-down empty state for BACKEND_UNREACHABLE during ingest', async () => {
    sendMessage.mockResolvedValueOnce({
      ok: false,
      error: { code: 'BACKEND_UNREACHABLE', message: 'Down.' },
    })
    await session.handleSend(QUESTION, VIDEO_ID)
    expect(sidebar.showEmptyState).toHaveBeenCalledWith('backend-down')
  })

  it('still shows retry toast for BACKEND_UNREACHABLE during ingest', async () => {
    sendMessage.mockResolvedValueOnce({
      ok: false,
      error: { code: 'BACKEND_UNREACHABLE', message: 'Down.' },
    })
    await session.handleSend(QUESTION, VIDEO_ID)
    expect(sidebar.showToast).toHaveBeenCalledWith(expect.objectContaining({ action: 'Retry' }))
  })

  it('shows key-missing empty state for API_KEY_MISSING during ingest', async () => {
    sendMessage.mockResolvedValueOnce({
      ok: false,
      error: { code: 'API_KEY_MISSING', message: 'No key.' },
    })
    await session.handleSend(QUESTION, VIDEO_ID)
    expect(sidebar.showEmptyState).toHaveBeenCalledWith('key-missing')
  })

  it('shows error message (not empty state) for RATE_LIMITED', async () => {
    sendMessage.mockResolvedValueOnce({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Rate limited.' },
    })
    await session.handleSend(QUESTION, VIDEO_ID)
    expect(sidebar.showEmptyState).not.toHaveBeenCalled()
    expect(sidebar.addMessage).toHaveBeenCalledWith(expect.objectContaining({ role: 'error' }))
  })
})

describe('error routing during ask', () => {
  it('uses friendly copy from error map for ask errors', async () => {
    sendMessage.mockResolvedValueOnce(INGEST_OK).mockResolvedValueOnce({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Rate limited.' },
    })
    await session.handleSend(QUESTION, VIDEO_ID)
    const call = sidebar.finalizeMessage.mock.calls.at(-1)
    expect(call[1].role).toBe('error')
    expect(call[1].text).toContain('rate limit')
  })
})

// ---------------------------------------------------------------------------
// State machine integration
// ---------------------------------------------------------------------------

describe('state machine', () => {
  it('starts in idle state', () => {
    const localSession = createQaSession({ sidebar: makeSidebar() as any, sendMessage: vi.fn() })
    expect(localSession.getState()).toBe('idle')
  })

  it('transitions to ingesting during ingest phase', async () => {
    let stateAtIngest: any
    const localSidebar = makeSidebar()
    const localSendMessage = vi.fn().mockImplementation(async (msg: any) => {
      if (msg.type === 'INGEST_VIDEO') {
        stateAtIngest = localSession.getState()
        return INGEST_OK
      }
      return ASK_OK
    })
    const localSession = createQaSession({
      sidebar: localSidebar as any,
      sendMessage: localSendMessage,
    })
    await localSession.handleSend(QUESTION, VIDEO_ID)
    expect(stateAtIngest).toBe('ingesting')
  })

  it('returns to idle after successful ask', async () => {
    sendMessage.mockResolvedValueOnce(INGEST_OK).mockResolvedValueOnce(ASK_OK)
    await session.handleSend(QUESTION, VIDEO_ID)
    expect(session.getState()).toBe('idle')
  })

  it('transitions to error state on failed ask', async () => {
    sendMessage.mockResolvedValueOnce(INGEST_OK).mockResolvedValueOnce({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Rate limited.' },
    })
    await session.handleSend(QUESTION, VIDEO_ID)
    expect(session.getState()).toBe('error')
  })

  it('can recover from error state on next send', async () => {
    // First ask fails
    sendMessage.mockResolvedValueOnce(INGEST_OK).mockResolvedValueOnce({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Rate limited.' },
    })
    await session.handleSend(QUESTION, VIDEO_ID)
    expect(session.getState()).toBe('error')

    // Second ask succeeds (ingest already cached)
    sendMessage.mockResolvedValueOnce(ASK_OK)
    await session.handleSend('Follow-up?', VIDEO_ID)
    expect(session.getState()).toBe('idle')
  })
})
