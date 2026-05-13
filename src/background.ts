/**
 * Background service worker — message router.
 *
 * Content scripts and the popup communicate via chrome.runtime.sendMessage.
 * Each message must carry a `type` field; the router dispatches to the
 * appropriate apiClient call and sends back { ok, data } or { ok, error }.
 *
 * Message types
 * ─────────────
 *   VIDEO_CHANGED     { videoId }            → pingHealth (sanity check on tab change)
 *   INGEST_VIDEO      { videoId, force? }    → apiClient.ingest
 *   ASK_QUESTION      { videoId, question, k? } → apiClient.ask
 *   GET_CURRENT_VIDEO {}                     → current tracked video ID
 */

import apiClient from './api/client.js'

type MessageHandler = (msg: Record<string, unknown>) => Promise<unknown>

// In-memory single source of truth; restored from session storage on startup.
let currentVideoId: string | null = null

chrome.runtime.onInstalled.addListener(() => {
  console.log('YouTube Q&A: service worker installed')
})

// Restore last known video ID across service worker restarts
chrome.storage.session
  .get('currentVideoId')
  .then(({ currentVideoId: id }) => {
    if (id) currentVideoId = id as string
  })
  .catch(() => {})

// Ensure backend URL permission exists on startup
if (chrome?.storage?.sync && chrome?.permissions) {
  chrome.storage.sync.get({ backendUrl: null }, async ({ backendUrl }) => {
    if (backendUrl) {
      const hasPermission = await chrome.permissions.contains({
        origins: [backendUrl + '/*'],
      })
      if (!hasPermission) {
        console.warn('Backend URL permission missing:', backendUrl)
        // apiClient will surface BACKEND_UNREACHABLE when requests fail
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Handlers — each returns a Promise that resolves with the data to send back
// ---------------------------------------------------------------------------

async function handleVideoChanged(msg: Record<string, unknown>): Promise<unknown> {
  const videoId = msg['videoId'] as string
  const url = msg['url'] as string | undefined
  currentVideoId = videoId
  await chrome.storage.session.set({ currentVideoId: videoId })

  const health = await apiClient.pingHealth()

  return { videoId, url: url ?? null, health }
}

async function handleIngestVideo(msg: Record<string, unknown>): Promise<unknown> {
  const videoId = msg['videoId'] as string
  const force = (msg['force'] as boolean | undefined) ?? false
  const tabId = msg['tabId'] as number | undefined

  // If tabId is provided, enable streaming and push progress events to the content script
  if (tabId !== undefined) {
    return apiClient.ingest(videoId, {
      force,
      stream: true,
      onProgress: (step: string, pct: number) => {
        chrome.tabs
          .sendMessage(tabId, {
            type: 'INGEST_PROGRESS',
            step,
            pct,
          })
          .catch(() => {
            // Tab may have closed — ignore
          })
      },
    })
  }

  // Fallback to non-streaming mode
  return apiClient.ingest(videoId, { force })
}

async function handleAskQuestion(msg: Record<string, unknown>): Promise<unknown> {
  const videoId = msg['videoId'] as string
  const question = msg['question'] as string
  const history = (msg['history'] as unknown[]) ?? []
  const k = msg['k'] as number | undefined
  const threadId = (msg['threadId'] as string | null | undefined) ?? null
  const opts = { ...(k !== undefined ? { k } : {}), threadId }
  return apiClient.ask(videoId, question, history, opts)
}

async function handleGetCurrentVideo(): Promise<unknown> {
  if (currentVideoId) return { videoId: currentVideoId }
  const { currentVideoId: stored } = await chrome.storage.session.get('currentVideoId')
  return { videoId: (stored as string | undefined) ?? null }
}

async function handlePingHealth(): Promise<unknown> {
  return apiClient.pingHealth()
}

async function handleCheckTranscript(msg: Record<string, unknown>): Promise<unknown> {
  const videoId = msg['videoId'] as string
  try {
    const result = await apiClient.ingest(videoId, { force: false })
    return { hasTranscript: true, cached: result.cached }
  } catch (err) {
    if ((err as { code?: string }).code === 'TRANSCRIPT_DISABLED') {
      return { hasTranscript: false }
    }
    return { hasTranscript: false, error: (err as Error).message }
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const HANDLERS: Record<string, MessageHandler> = {
  VIDEO_CHANGED: handleVideoChanged,
  INGEST_VIDEO: handleIngestVideo,
  ASK_QUESTION: handleAskQuestion,
  PING_HEALTH: handlePingHealth,
  CHECK_TRANSCRIPT: handleCheckTranscript,
  GET_CURRENT_VIDEO: handleGetCurrentVideo,
}

/**
 * Central message listener.
 * Returning `true` keeps the message channel open while the async handler runs.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const msgWithTab =
    (message as { type?: string })?.type === 'INGEST_VIDEO' && sender.tab?.id !== undefined
      ? { ...(message as Record<string, unknown>), tabId: sender.tab.id }
      : message
  const handler = HANDLERS[(message as { type?: string })?.type ?? '']

  if (!handler) {
    sendResponse({
      ok: false,
      error: {
        code: 'UNKNOWN_MESSAGE_TYPE',
        message: `Unknown message type: ${(message as { type?: string })?.type}`,
      },
    })
    return false
  }

  handler(msgWithTab as Record<string, unknown>)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err: unknown) =>
      sendResponse({
        ok: false,
        error: {
          code: (err as { code?: string }).code ?? 'UNKNOWN',
          message: (err as Error).message ?? 'An unexpected error occurred.',
        },
      }),
    )

  // Return true to signal that sendResponse will be called asynchronously.
  return true
})
