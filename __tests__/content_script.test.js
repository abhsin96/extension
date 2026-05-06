import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Chrome stub
const sendMessage = vi.fn().mockResolvedValue({})
const storageMock = {
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
}
vi.stubGlobal('chrome', {
  runtime: {
    sendMessage,
    getURL: (p) => `chrome-extension://fake/${p}`,
  },
  storage: { local: storageMock },
})

// ---------------------------------------------------------------------------
// Listener / history-patch cleanup between tests
// ---------------------------------------------------------------------------

// We track listeners added to document and window so we can remove them
// after each test (the module is re-imported each time but old listeners
// from previous instances would otherwise pile up).
const _origDocAddEL = document.addEventListener.bind(document)
const _origWinAddEL = window.addEventListener.bind(window)

let _trackedDocListeners = []
let _trackedWinListeners = []
let _origPushState
let _origReplaceState

function patchAddEventListeners() {
  document.addEventListener = (type, fn, opts) => {
    _trackedDocListeners.push({ type, fn, opts })
    _origDocAddEL(type, fn, opts)
  }
  window.addEventListener = (type, fn, opts) => {
    _trackedWinListeners.push({ type, fn, opts })
    _origWinAddEL(type, fn, opts)
  }
}

function removeTrackedListeners() {
  for (const { type, fn, opts } of _trackedDocListeners) {
    document.removeEventListener(type, fn, opts)
  }
  for (const { type, fn, opts } of _trackedWinListeners) {
    window.removeEventListener(type, fn, opts)
  }
  _trackedDocListeners = []
  _trackedWinListeners = []
}

function saveHistoryMethods() {
  _origPushState = history.pushState
  _origReplaceState = history.replaceState
}

function restoreHistoryMethods() {
  if (_origPushState) history.pushState = _origPushState
  if (_origReplaceState) history.replaceState = _origReplaceState
}

// Re-import the module fresh for each test to reset lastVideoId state
async function loadScript() {
  vi.resetModules()
  vi.stubGlobal('chrome', {
    runtime: { sendMessage, getURL: (p) => `chrome-extension://fake/${p}` },
    storage: { local: storageMock },
  })
  patchAddEventListeners()
  await import('../src/content_script.js')
}

beforeEach(async () => {
  vi.useFakeTimers()
  sendMessage.mockClear()
  saveHistoryMethods()
  await loadScript()
})

afterEach(() => {
  vi.runAllTimers()
  removeTrackedListeners()
  restoreHistoryMethods()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

describe('initial load', () => {
  it('broadcasts VIDEO_CHANGED for the initial watch page URL', async () => {
    // jsdom URL is set to youtube.com/watch?v=dQw4w9WgXcQ in vitest.config.js
    vi.runAllTimers()
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'VIDEO_CHANGED',
      videoId: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    })
  })
})

// ---------------------------------------------------------------------------
// yt-navigate-finish
// ---------------------------------------------------------------------------

describe('yt-navigate-finish event', () => {
  it('broadcasts VIDEO_CHANGED on navigation to a new video', () => {
    vi.runAllTimers() // flush initial load

    sendMessage.mockClear()
    document.dispatchEvent(
      new CustomEvent('yt-navigate-finish', {
        detail: { url: 'https://www.youtube.com/watch?v=newVid99' },
      }),
    )
    vi.runAllTimers()

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'VIDEO_CHANGED',
      videoId: 'newVid99',
      url: 'https://www.youtube.com/watch?v=newVid99',
    })
  })

  it('ignores navigation to a non-watch URL', () => {
    vi.runAllTimers()
    sendMessage.mockClear()

    document.dispatchEvent(
      new CustomEvent('yt-navigate-finish', {
        detail: { url: 'https://www.youtube.com/' },
      }),
    )
    vi.runAllTimers()

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('ignores duplicate video ID', () => {
    vi.runAllTimers()
    sendMessage.mockClear()

    // Same video ID as initial load
    document.dispatchEvent(
      new CustomEvent('yt-navigate-finish', {
        detail: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      }),
    )
    vi.runAllTimers()

    expect(sendMessage).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// history.pushState
// ---------------------------------------------------------------------------

describe('history.pushState', () => {
  it('broadcasts VIDEO_CHANGED when pushState navigates to a new video', () => {
    vi.runAllTimers()
    sendMessage.mockClear()

    history.pushState({}, '', '/watch?v=pushedVid')
    vi.runAllTimers()

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'VIDEO_CHANGED', videoId: 'pushedVid' }),
    )
  })
})

// ---------------------------------------------------------------------------
// Debounce
// ---------------------------------------------------------------------------

describe('debounce', () => {
  it('collapses rapid yt-navigate-finish events into one broadcast', () => {
    vi.runAllTimers()
    sendMessage.mockClear()

    for (const id of ['v1', 'v2', 'v3']) {
      document.dispatchEvent(
        new CustomEvent('yt-navigate-finish', {
          detail: { url: `https://www.youtube.com/watch?v=${id}` },
        }),
      )
    }

    // Before timers run, nothing should have fired
    expect(sendMessage).not.toHaveBeenCalled()

    vi.runAllTimers()

    // Only one VIDEO_CHANGED should fire (for v3 — the last debounced event)
    const videoChangedCalls = sendMessage.mock.calls.filter(
      ([m]) => m?.type === 'VIDEO_CHANGED',
    )
    expect(videoChangedCalls).toHaveLength(1)
    expect(videoChangedCalls[0][0]).toEqual(
      expect.objectContaining({ type: 'VIDEO_CHANGED', videoId: 'v3' }),
    )
  })
})
