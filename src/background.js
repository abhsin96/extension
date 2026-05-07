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
 *   GET_CURRENT_VIDEO {}                  → current tracked video ID
 */

import apiClient from './api/client.js'

// In-memory single source of truth; restored from session storage on startup.
let currentVideoId = null

chrome.runtime.onInstalled.addListener(() => {
  console.log('YouTube Q&A: service worker installed')
})

// Restore last known video ID across service worker restarts
chrome.storage.session
  .get('currentVideoId')
  .then(({ currentVideoId: id }) => {
    if (id) currentVideoId = id
  })
  .catch(() => {})

// ---------------------------------------------------------------------------
// Handlers — each returns a Promise that resolves with the data to send back
// ---------------------------------------------------------------------------

async function handleVideoChanged({ videoId, url }) {
  currentVideoId = videoId
  await chrome.storage.session.set({ currentVideoId: videoId })

  const health = await apiClient.pingHealth()

  return { videoId, url: url ?? null, health }
}

async function handleIngestVideo({ videoId, force = false }) {
  return apiClient.ingest(videoId, { force })
}

async function handleAskQuestion({ videoId, question, history = [], k }) {
  const opts = k !== undefined ? { k } : {}
  return apiClient.ask(videoId, question, history, opts)
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

async function handleGetCurrentVideo() {
  if (currentVideoId) return { videoId: currentVideoId }
  const { currentVideoId: stored } = await chrome.storage.session.get('currentVideoId')
  return { videoId: stored ?? null }
}

async function handlePingHealth() {
  return apiClient.pingHealth()
}

async function handleCheckTranscript({ videoId }) {
  try {
    // Try to ingest with force=false to check if transcript is available
    // If the video already exists, it will return cached:true
    // If transcript is unavailable, it will throw TranscriptDisabledError
    const result = await apiClient.ingest(videoId, { force: false })
    return { hasTranscript: true, cached: result.cached }
  } catch (err) {
    // TranscriptDisabledError means no transcript available
    if (err.code === 'TRANSCRIPT_DISABLED') {
      return { hasTranscript: false }
    }
    // For other errors (network, etc.), assume transcript might be available
    // but we can't confirm right now
    return { hasTranscript: false, error: err.message }
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const HANDLERS = {
  VIDEO_CHANGED: handleVideoChanged,
  INGEST_VIDEO: handleIngestVideo,
  ASK_QUESTION: handleAskQuestion,
  PING_HEALTH: handlePingHealth,
  CHECK_TRANSCRIPT: handleCheckTranscript,
  GET_STATUS: handleGetStatus,
  SET_API_KEY: handleSetApiKey,
  CLEAR_API_KEY: handleClearApiKey,
  GET_CURRENT_VIDEO: handleGetCurrentVideo,
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
