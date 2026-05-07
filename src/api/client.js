/**
 * apiClient — single source of truth for all backend calls.
 *
 * Every method either resolves with a typed response object or throws one of:
 *   BackendUnreachableError  — network failure (no response)
 *   TranscriptDisabledError  — ingest: transcript unavailable (502)
 *   VideoNotIngestedError    — ask: video not yet ingested (404)
 *   ApiError                 — any other HTTP error
 *
 * @module api/client
 */

import {
  ApiError,
  ApiKeyMissingError,
  BackendUnreachableError,
  RateLimitedError,
  TranscriptDisabledError,
  VideoNotIngestedError,
} from './errors.js'

/** Default backend URL used when nothing is stored in chrome.storage.sync. */
export const DEFAULT_API_BASE = 'http://localhost:8000'

/** @deprecated Use DEFAULT_API_BASE. Kept for backward compatibility. */
export const API_BASE = DEFAULT_API_BASE

/** Current base URL — updated from chrome.storage.sync and via _setBaseUrl(). */
let _baseUrl = DEFAULT_API_BASE

/** Return the active backend base URL. */
export function getBaseUrl() {
  return _baseUrl
}

/**
 * Override the base URL. Called by the chrome.storage listener in production
 * and directly in tests.
 *
 * @param {string} url
 */
export function _setBaseUrl(url) {
  _baseUrl = url
}

// Sync with chrome.storage — no-op in non-extension environments (tests, Node).
if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
  chrome.storage.sync.get({ backendUrl: DEFAULT_API_BASE }, ({ backendUrl }) => {
    _baseUrl = backendUrl
  })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.backendUrl) {
      _baseUrl = changes.backendUrl.newValue
    }
  })
}

// Substring present in the system-prompt refusal message (see prompts/system_prompt.txt).
const REFUSAL_SENTINEL = "isn't available in the video transcript"

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Low-level fetch wrapper.
 * Throws BackendUnreachableError on network failure, ApiError on non-2xx.
 *
 * @param {string} path
 * @param {RequestInit} [options]
 * @returns {Promise<unknown>}
 */
async function _request(path, options = {}) {
  let response
  try {
    response = await fetch(`${_baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch (cause) {
    throw new BackendUnreachableError(cause)
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const body = await response.json()
      if (body.detail) detail = body.detail
    } catch {
      // JSON parse failure — keep the status-code fallback
    }
    const { status } = response
    if (status === 401 || status === 403) throw new ApiKeyMissingError(detail)
    if (status === 429) throw new RateLimitedError(detail)
    throw new ApiError(detail, status)
  }

  // Handle 204 No Content responses (e.g., /config/api-key)
  if (response.status === 204) {
    return {}
  }

  return response.json()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const apiClient = {
  /**
   * Check that the backend is alive and configured.
   *
   * @returns {Promise<import('./types.js').HealthResponse>}
   * @throws {BackendUnreachableError}
   */
  async pingHealth() {
    return _request('/health')
  },

  /**
   * Ingest a YouTube video into the vector store.
   *
   * @param {string} videoId
   * @param {{ force?: boolean }} [opts]
   * @returns {Promise<import('./types.js').IngestResponse>}
   * @throws {TranscriptDisabledError} When the video has no transcript (502)
   * @throws {BackendUnreachableError}
   * @throws {ApiError}
   */
  async ingest(videoId, { force = false } = {}) {
    try {
      return await _request('/ingest', {
        method: 'POST',
        body: JSON.stringify({ video_id: videoId, force }),
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 502) {
        throw new TranscriptDisabledError(err.message)
      }
      throw err
    }
  },

  /**
   * Ask a question about an ingested video.
   *
   * Maps to POST /query on the backend with unified endpoint.
   * Supports streaming and advanced mode via flags.
   * Detects refusals from the model and surfaces them via `refused: true`
   * rather than as an exception — callers can choose to show the answer text
   * or prompt the user to re-phrase.
   *
   * @param {string}   videoId
   * @param {string}   question
   * @param {Array}    [history]  - Conversation history for multi-turn support
   * @param {{ k?: number, stream?: boolean, advanced?: boolean, threadId?: string }} [opts]
   * @returns {Promise<import('./types.js').AskResponse>}
   * @throws {VideoNotIngestedError} When the video has not been ingested (404)
   * @throws {BackendUnreachableError}
   * @throws {ApiError}
   */
  async ask(
    videoId,
    question,
    history = [],
    { k = 5, stream = false, advanced = true, threadId = null } = {},
  ) {
    let raw
    try {
      raw = await _request('/query', {
        method: 'POST',
        body: JSON.stringify({
          video_id: videoId,
          question,
          k,
          stream,
          advanced,
          conversation_history: history,
          thread_id: threadId,
        }),
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        throw new VideoNotIngestedError(videoId)
      }
      throw err
    }

    // Handle both simple and advanced mode responses
    const refused = raw.refused ?? raw.answer?.toLowerCase().includes(REFUSAL_SENTINEL) ?? false

    return {
      answer: raw.answer,
      citations: (raw.citations ?? raw.sources ?? []).map((s) => ({
        chunk_id: s.chunk_id,
        start_ts: s.start_ts,
        end_ts: s.end_ts,
        text: s.text,
      })),
      refused,
      tokens_used: raw.tokens_used,
      thread_id: raw.thread_id,
    }
  },

}

export default apiClient
