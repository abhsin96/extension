/**
 * Background service worker — message router.
 *
 * Content scripts and the popup communicate via chrome.runtime.sendMessage.
 * Each message must carry a `type` field; the router dispatches to the
 * appropriate apiClient call and sends back { ok, data } or { ok, error }.
 *
 * Message types
 * ─────────────
 *   VIDEO_CHANGED  { videoId }         → pingHealth (sanity check on tab change)
 *   INGEST_VIDEO   { videoId, force? } → apiClient.ingest
 *   ASK_QUESTION   { videoId, question, k? } → apiClient.ask
 *   GET_STATUS     {}                  → apiClient.getStatus
 */

import apiClient from './api/client.js'

chrome.runtime.onInstalled.addListener(() => {
  console.log('YouTube Q&A: service worker installed')
})

// ---------------------------------------------------------------------------
// Handlers — each returns a Promise that resolves with the data to send back
// ---------------------------------------------------------------------------

async function handleVideoChanged({ videoId }) {
  const health = await apiClient.pingHealth()
  return { videoId, health }
}

async function handleIngestVideo({ videoId, force = false }) {
  return apiClient.ingest(videoId, { force })
}

async function handleAskQuestion({ videoId, question, k }) {
  const opts = k !== undefined ? { k } : {}
  return apiClient.ask(videoId, question, [], opts)
}

async function handleGetStatus() {
  return apiClient.getStatus()
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const HANDLERS = {
  VIDEO_CHANGED: handleVideoChanged,
  INGEST_VIDEO: handleIngestVideo,
  ASK_QUESTION: handleAskQuestion,
  GET_STATUS: handleGetStatus,
}

/**
 * Central message listener.
 * Returning `true` keeps the message channel open while the async handler runs.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = HANDLERS[message?.type]

  if (!handler) {
    sendResponse({
      ok: false,
      error: { code: 'UNKNOWN_MESSAGE_TYPE', message: `Unknown message type: ${message?.type}` },
    })
    return false
  }

  handler(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) =>
      sendResponse({
        ok: false,
        error: {
          code: err.code ?? 'UNKNOWN',
          message: err.message ?? 'An unexpected error occurred.',
        },
      }),
    )

  // Return true to signal that sendResponse will be called asynchronously.
  return true
})
