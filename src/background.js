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
 *   SET_API_KEY    { key }             → apiClient.setApiKey
 *   CLEAR_API_KEY  {}                  → apiClient.clearApiKey
 */

import apiClient from './api/client.js'

// Injected at build time from .env — empty string when not set.

const BUILD_API_KEY = __OPENAI_API_KEY__

chrome.runtime.onInstalled.addListener(() => {
  console.log('YouTube Q&A: service worker installed')
  if (BUILD_API_KEY) {
    apiClient.setApiKey(BUILD_API_KEY).catch(console.error)
  }
})

chrome.runtime.onStartup.addListener(() => {
  if (BUILD_API_KEY) {
    apiClient.setApiKey(BUILD_API_KEY).catch(console.error)
  }
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

async function handleSetApiKey({ key }) {
  await apiClient.setApiKey(key)
  return {}
}

async function handleClearApiKey() {
  await apiClient.clearApiKey()
  return {}
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const HANDLERS = {
  VIDEO_CHANGED: handleVideoChanged,
  INGEST_VIDEO: handleIngestVideo,
  ASK_QUESTION: handleAskQuestion,
  GET_STATUS: handleGetStatus,
  SET_API_KEY: handleSetApiKey,
  CLEAR_API_KEY: handleClearApiKey,
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
