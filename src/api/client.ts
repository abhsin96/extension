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
import type { AskResponse, Citation, HealthResponse, IngestResponse } from './types.js'

/** Default backend URL used when nothing is stored in chrome.storage.sync. */
export const DEFAULT_API_BASE = 'http://localhost:8000'

/** Current base URL — updated from chrome.storage.sync and via _setBaseUrl(). */
let _baseUrl = DEFAULT_API_BASE

/** Return the active backend base URL. */
export function getBaseUrl(): string {
  return _baseUrl
}

/**
 * Override the base URL. Called by the chrome.storage listener in production
 * and directly in tests.
 */
export function _setBaseUrl(url: string): void {
  _baseUrl = url
}

// Sync with chrome.storage — no-op in non-extension environments (tests, Node).
if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
  chrome.storage.sync.get({ backendUrl: DEFAULT_API_BASE }, ({ backendUrl }) => {
    _baseUrl = backendUrl as string
  })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.backendUrl) {
      _baseUrl = changes.backendUrl.newValue as string
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
 */
async function _request(path: string, options: RequestInit = {}): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${_baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch (cause) {
    throw new BackendUnreachableError(cause)
  }

  const requestId = response.headers.get('X-Request-ID')
  if (requestId) console.debug('[api] X-Request-ID:', requestId)

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as { detail?: string }
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

// Raw shape of the /query response before it is normalised to AskResponse.
interface RawQueryResponse {
  answer: string
  refused?: boolean
  citations?: Citation[]
  sources?: Citation[]
  tokens_used?: number
  thread_id?: string | null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const apiClient = {
  /**
   * Check that the backend is alive and configured.
   * @throws {BackendUnreachableError}
   */
  async pingHealth(): Promise<HealthResponse> {
    return _request('/health') as Promise<HealthResponse>
  },

  /**
   * Ingest a YouTube video into the vector store.
   *
   * When `stream` is true the request uses SSE.  `onProgress` is called for
   * each `{"type":"progress"}` frame so the sidebar can update a step label
   * and progress bar.  The method still resolves with an `IngestResponse` once
   * the `{"type":"done"}` frame arrives.
   *
   * @throws {TranscriptDisabledError} When the video has no transcript (502)
   * @throws {BackendUnreachableError}
   * @throws {ApiError}
   */
  async ingest(
    videoId: string,
    {
      force = false,
      stream = false,
      onProgress,
    }: {
      force?: boolean
      stream?: boolean
      onProgress?: (step: string, pct: number) => void
    } = {},
  ): Promise<IngestResponse> {
    if (!stream) {
      try {
        return (await _request('/ingest', {
          method: 'POST',
          body: JSON.stringify({ video_id: videoId, force }),
        })) as IngestResponse
      } catch (err) {
        if (err instanceof ApiError && err.status === 502) {
          throw new TranscriptDisabledError(err.message)
        }
        throw err
      }
    }

    // Streaming path — use fetch directly so we can read the SSE body.
    let response: Response
    try {
      response = await fetch(`${_baseUrl}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId, force, stream: true }),
      })
    } catch (cause) {
      throw new BackendUnreachableError(cause)
    }

    const streamRequestId = response.headers.get('X-Request-ID')
    if (streamRequestId) console.debug('[api] X-Request-ID:', streamRequestId)

    if (!response.ok) {
      let detail = `HTTP ${response.status}`
      try {
        const body = (await response.json()) as { detail?: string }
        if (body.detail) detail = body.detail
      } catch {
        /* keep status-code fallback */
      }
      const { status } = response
      if (status === 401 || status === 403) throw new ApiKeyMissingError(detail)
      if (status === 429) throw new RateLimitedError(detail)
      if (status === 502) throw new TranscriptDisabledError(detail)
      throw new ApiError(detail, status)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop()! // last entry may be an incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event: Record<string, unknown>
          try {
            event = JSON.parse(line.slice(6)) as Record<string, unknown>
          } catch {
            continue
          }

          if (event['type'] === 'progress') {
            onProgress?.(event['step'] as string, event['pct'] as number)
          } else if (event['type'] === 'done') {
            return {
              status: event['status'] as IngestResponse['status'],
              chunk_count: event['chunk_count'] as number,
              cached: event['cached'] as boolean,
            }
          } else if (event['type'] === 'error') {
            const message = (event['message'] as string | undefined) ?? 'Ingestion failed'
            if (String(message).toLowerCase().includes('transcript')) {
              throw new TranscriptDisabledError(message)
            }
            throw new ApiError(message, 502)
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    throw new ApiError('Stream ended without a done event', 500)
  },

  /**
   * Ask a question about an ingested video.
   *
   * Maps to POST /query on the backend with unified endpoint.
   * Detects refusals from the model and surfaces them via `refused: true`.
   *
   * @throws {VideoNotIngestedError} When the video has not been ingested (404)
   * @throws {BackendUnreachableError}
   * @throws {ApiError}
   */
  async ask(
    videoId: string,
    question: string,
    history: unknown[] = [],
    {
      k = 5,
      stream = false,
      advanced = true,
      threadId = null as string | null,
    }: { k?: number; stream?: boolean; advanced?: boolean; threadId?: string | null } = {},
  ): Promise<AskResponse> {
    let raw: RawQueryResponse
    try {
      raw = (await _request('/query', {
        method: 'POST',
        body: JSON.stringify({
          video_id: videoId,
          question,
          k,
          stream,
          advanced,
          // Once the server has issued a thread_id it maintains history
          // server-side.  Only send the local history on the very first turn
          // (no thread_id yet) to seed or restore the thread.
          conversation_history: threadId ? [] : history,
          thread_id: threadId,
        }),
      })) as RawQueryResponse
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
