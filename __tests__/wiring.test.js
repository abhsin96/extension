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

let sidebar
let sendMessage
let session

beforeEach(() => {
  sidebar = makeSidebar()
  sendMessage = vi.fn()
  session = createQaSession({ sidebar, sendMessage })
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
      .mockResolvedValueOnce(INGEST_OK)   // INGEST_VIDEO
      .mockResolvedValueOnce(ASK_OK)      // ASK_QUESTION

    await session.handleSend(QUESTION, VIDEO_ID)

    expect(sendMessage).toHaveBeenCalledWith({ type: 'INGEST_VIDEO', videoId: VIDEO_ID })
    expect(sendMessage).toHaveBeenCalledWith({ type: 'ASK_QUESTION', videoId: VIDEO_ID, question: QUESTION })
    expect(sidebar.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', text: QUESTION }),
    )
    expect(sidebar.finalizeMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ role: 'assistant', text: ASK_OK.data.answer, refused: false }),
    )
  })

  it('shows refused style when backend marks answer refused', async () => {
    const refusedAsk = { ok: true, data: { answer: 'Sorry, not available.', refused: true, citations: [] } }
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

    const ingestCalls = sendMessage.mock.calls.filter((c) => c[0].type === 'INGEST_VIDEO')
    expect(ingestCalls).toHaveLength(1)
  })

  it('does NOT send INGEST_VIDEO on the second question for the same video', async () => {
    sendMessage.mockResolvedValueOnce(INGEST_OK).mockResolvedValue(ASK_OK)

    await session.handleSend(QUESTION, VIDEO_ID)          // first — ingests
    sendMessage.mockClear()
    await session.handleSend('Second question?', VIDEO_ID) // second — no ingest

    const ingestCalls = sendMessage.mock.calls.filter((c) => c[0].type === 'INGEST_VIDEO')
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
    let resolveAsk
    sendMessage.mockImplementation(() => new Promise((r) => { resolveAsk = r }))

    const askPromise = session.handleSend('New question?', VIDEO_ID)
    await flushAsync() // let handleSend reach the await sendMessage

    // Grab cancel callback and invoke it
    const cancelFn = sidebar.setCancellable.mock.calls.at(-1)?.[0]
    expect(cancelFn).toBeTypeOf('function')
    cancelFn()

    // Now resolve the ask (after cancel)
    resolveAsk(ASK_OK)
    await askPromise

    expect(sidebar.removeMessage).toHaveBeenCalled()
    expect(sidebar.finalizeMessage).not.toHaveBeenCalled()
  })

  it('cancel during ingest phase stops before asking', async () => {
    let resolveIngest
    sendMessage.mockImplementation(() => new Promise((r) => { resolveIngest = r }))

    const askPromise = session.handleSend(QUESTION, VIDEO_ID)
    await flushAsync()

    const cancelFn = sidebar.setCancellable.mock.calls.at(-1)?.[0]
    cancelFn()

    resolveIngest(INGEST_OK)
    await askPromise

    // ASK_QUESTION was never sent
    const askCalls = sendMessage.mock.calls.filter((c) => c[0].type === 'ASK_QUESTION')
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
    expect(sidebar.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'error' }),
    )
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

    expect(sidebar.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'Retry' }),
    )
  })

  it('shows toast on BACKEND_UNREACHABLE during ingest', async () => {
    const unreachable = {
      ok: false,
      error: { code: 'BACKEND_UNREACHABLE', message: 'Cannot reach the backend.' },
    }
    sendMessage.mockResolvedValueOnce(unreachable) // INGEST fails

    await session.handleSend(QUESTION, VIDEO_ID)

    expect(sidebar.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'Retry' }),
    )
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
