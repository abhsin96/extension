/**
 * Typed error classes for the API client.
 *
 * Every class exposes:
 *   code     {string}  — machine-readable constant; safe to switch/compare in UI code
 *   message  {string}  — user-facing sentence; suitable for display without further formatting
 *   name     {string}  — matches the class name; survives minification
 *
 * HTTP-backed errors additionally expose:
 *   status   {number}  — HTTP status code
 */

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

/**
 * Base for errors that originate from an HTTP response.
 * Use the subclasses below; only fall back to ApiError for unclassified HTTP errors.
 */
export class ApiError extends Error {
  /**
   * @param {string} message  User-facing description
   * @param {number} status   HTTP status code
   * @param {string} [code]   Machine-readable error code (defaults to 'API_ERROR')
   */
  constructor(message, status, code = 'API_ERROR') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Network-level errors (no HTTP response received)
// ---------------------------------------------------------------------------

/**
 * The network request failed before a response arrived.
 * Typical causes: server not running, wrong port, CORS preflight failure.
 */
export class BackendUnreachableError extends Error {
  /** @param {unknown} [cause]  Original TypeError from fetch */
  constructor(cause) {
    super('Cannot reach the backend — is the server running on localhost:8000?')
    this.name = 'BackendUnreachableError'
    this.code = 'BACKEND_UNREACHABLE'
    this.cause = cause
  }
}

// ---------------------------------------------------------------------------
// Authentication / authorisation errors
// ---------------------------------------------------------------------------

/**
 * The OpenAI API key is missing, empty, or rejected by the backend (HTTP 401 / 403).
 */
export class ApiKeyMissingError extends ApiError {
  /** @param {string} [detail]  Server-provided detail, if any */
  constructor(detail) {
    super(
      detail ?? 'An OpenAI API key is required — add one in the extension options.',
      401,
      'API_KEY_MISSING',
    )
    this.name = 'ApiKeyMissingError'
  }
}

// ---------------------------------------------------------------------------
// Ingestion-specific errors
// ---------------------------------------------------------------------------

/**
 * The YouTube video does not have a transcript available (HTTP 502 from the ingest pipeline).
 */
export class TranscriptDisabledError extends ApiError {
  /** @param {string} [detail]  Server-provided detail, if any */
  constructor(detail) {
    super(detail ?? 'This video does not have a transcript available.', 502, 'TRANSCRIPT_DISABLED')
    this.name = 'TranscriptDisabledError'
  }
}

// ---------------------------------------------------------------------------
// Retrieval-specific errors
// ---------------------------------------------------------------------------

/**
 * The requested video has not been ingested into the vector store (HTTP 404).
 * Callers should prompt the user to trigger ingest() before asking questions.
 */
export class VideoNotIngestedError extends ApiError {
  /** @param {string} videoId */
  constructor(videoId) {
    super(
      `This video hasn't been analysed yet — click "Analyse" to get started.`,
      404,
      'VIDEO_NOT_INGESTED',
    )
    this.name = 'VideoNotIngestedError'
    this.videoId = videoId
  }
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * The OpenAI API is rate-limiting the backend (HTTP 429).
 * The UI should advise the user to wait before retrying.
 */
export class RateLimitedError extends ApiError {
  /** @param {string} [detail] */
  constructor(detail) {
    super(
      detail ?? 'The AI service is busy — please wait a moment and try again.',
      429,
      'RATE_LIMITED',
    )
    this.name = 'RateLimitedError'
  }
}

// ---------------------------------------------------------------------------
// Catch-all
// ---------------------------------------------------------------------------

/**
 * An unexpected error with no more specific classification.
 * Carries the original error as `cause` so it can be logged / reported.
 */
export class UnknownError extends Error {
  /** @param {unknown} [cause] */
  constructor(cause) {
    const message = cause instanceof Error ? cause.message : 'An unexpected error occurred.'
    super(message)
    this.name = 'UnknownError'
    this.code = 'UNKNOWN'
    this.cause = cause
  }
}
