// src/api/errors.js
var ApiError = class extends Error {
  /**
   * @param {string} message  User-facing description
   * @param {number} status   HTTP status code
   * @param {string} [code]   Machine-readable error code (defaults to 'API_ERROR')
   */
  constructor(message, status, code = "API_ERROR") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
};
var BackendUnreachableError = class extends Error {
  /** @param {unknown} [cause]  Original TypeError from fetch */
  constructor(cause) {
    super("Cannot reach the backend \u2014 is the server running on localhost:8000?");
    this.name = "BackendUnreachableError";
    this.code = "BACKEND_UNREACHABLE";
    this.cause = cause;
  }
};
var ApiKeyMissingError = class extends ApiError {
  /** @param {string} [detail]  Server-provided detail, if any */
  constructor(detail) {
    super(
      detail ?? "An OpenAI API key is required \u2014 add one in the extension options.",
      401,
      "API_KEY_MISSING"
    );
    this.name = "ApiKeyMissingError";
  }
};
var TranscriptDisabledError = class extends ApiError {
  /** @param {string} [detail]  Server-provided detail, if any */
  constructor(detail) {
    super(detail ?? "This video does not have a transcript available.", 502, "TRANSCRIPT_DISABLED");
    this.name = "TranscriptDisabledError";
  }
};
var VideoNotIngestedError = class extends ApiError {
  /** @param {string} videoId */
  constructor(videoId) {
    super(
      `This video hasn't been analysed yet \u2014 click "Analyse" to get started.`,
      404,
      "VIDEO_NOT_INGESTED"
    );
    this.name = "VideoNotIngestedError";
    this.videoId = videoId;
  }
};
var RateLimitedError = class extends ApiError {
  /** @param {string} [detail] */
  constructor(detail) {
    super(
      detail ?? "The AI service is busy \u2014 please wait a moment and try again.",
      429,
      "RATE_LIMITED"
    );
    this.name = "RateLimitedError";
  }
};

// src/api/client.js
var API_BASE = "http://localhost:8000";
var REFUSAL_SENTINEL = "isn't available in the video transcript";
async function _request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
  } catch (cause) {
    throw new BackendUnreachableError(cause);
  }
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body.detail) detail = body.detail;
    } catch {
    }
    const { status } = response;
    if (status === 401 || status === 403) throw new ApiKeyMissingError(detail);
    if (status === 429) throw new RateLimitedError(detail);
    throw new ApiError(detail, status);
  }
  return response.json();
}
var apiClient = {
  /**
   * Check that the backend is alive and configured.
   *
   * @returns {Promise<import('./types.js').HealthResponse>}
   * @throws {BackendUnreachableError}
   */
  async pingHealth() {
    return _request("/health");
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
      return await _request("/ingest", {
        method: "POST",
        body: JSON.stringify({ video_id: videoId, force })
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 502) {
        throw new TranscriptDisabledError(err.message);
      }
      throw err;
    }
  },
  /**
   * Ask a question about an ingested video.
   *
   * Maps to POST /chat/{videoId} on the backend.
   * Detects refusals from the model and surfaces them via `refused: true`
   * rather than as an exception — callers can choose to show the answer text
   * or prompt the user to re-phrase.
   *
   * @param {string}   videoId
   * @param {string}   question
   * @param {Array}    [history]  - Reserved for future multi-turn support
   * @param {{ k?: number }} [opts]
   * @returns {Promise<import('./types.js').AskResponse>}
   * @throws {VideoNotIngestedError} When the video has not been ingested (404)
   * @throws {BackendUnreachableError}
   * @throws {ApiError}
   */
  async ask(videoId, question, _history = [], { k = 5 } = {}) {
    let raw;
    try {
      raw = await _request(`/chat/${videoId}`, {
        method: "POST",
        body: JSON.stringify({ question, k })
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        throw new VideoNotIngestedError(videoId);
      }
      throw err;
    }
    const refused = raw.answer?.toLowerCase().includes(REFUSAL_SENTINEL) ?? false;
    return {
      answer: raw.answer,
      citations: (raw.sources ?? []).map((s) => ({
        chunk_id: s.chunk_id,
        start_ts: s.start_ts,
        end_ts: s.end_ts,
        text: s.text
      })),
      refused,
      tokens_used: raw.tokens_used
      // undefined until BE exposes it
    };
  },
  /**
   * Store an OpenAI API key on the server.
   * Stub — endpoint not yet implemented on the backend.
   *
   * @param {string} key
   * @returns {Promise<void>}
   * @throws {BackendUnreachableError}
   * @throws {ApiError}
   */
  async setApiKey(key) {
    await _request("/config/api-key", {
      method: "PUT",
      body: JSON.stringify({ api_key: key })
    });
  },
  /**
   * Remove the stored OpenAI API key from the server.
   * Stub — endpoint not yet implemented on the backend.
   *
   * @returns {Promise<void>}
   * @throws {BackendUnreachableError}
   * @throws {ApiError}
   */
  async clearApiKey() {
    await _request("/config/api-key", { method: "DELETE" });
  },
  /**
   * Fetch server configuration status.
   * Stub — endpoint not yet implemented on the backend.
   *
   * @returns {Promise<import('./types.js').StatusResponse>}
   * @throws {BackendUnreachableError}
   * @throws {ApiError}
   */
  async getStatus() {
    return _request("/config/status");
  }
};
var client_default = apiClient;

// src/background.js
chrome.runtime.onInstalled.addListener(() => {
  console.log("YouTube Q&A: service worker installed");
});
async function handleVideoChanged({ videoId }) {
  const health = await client_default.pingHealth();
  return { videoId, health };
}
async function handleIngestVideo({ videoId, force = false }) {
  return client_default.ingest(videoId, { force });
}
async function handleAskQuestion({ videoId, question, k }) {
  const opts = k !== void 0 ? { k } : {};
  return client_default.ask(videoId, question, [], opts);
}
async function handleGetStatus() {
  return client_default.getStatus();
}
async function handleSetApiKey({ key }) {
  await client_default.setApiKey(key);
  return {};
}
async function handleClearApiKey() {
  await client_default.clearApiKey();
  return {};
}
var HANDLERS = {
  VIDEO_CHANGED: handleVideoChanged,
  INGEST_VIDEO: handleIngestVideo,
  ASK_QUESTION: handleAskQuestion,
  GET_STATUS: handleGetStatus,
  SET_API_KEY: handleSetApiKey,
  CLEAR_API_KEY: handleClearApiKey
};
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = HANDLERS[message?.type];
  if (!handler) {
    sendResponse({
      ok: false,
      error: { code: "UNKNOWN_MESSAGE_TYPE", message: `Unknown message type: ${message?.type}` }
    });
    return false;
  }
  handler(message).then((data) => sendResponse({ ok: true, data })).catch(
    (err) => sendResponse({
      ok: false,
      error: {
        code: err.code ?? "UNKNOWN",
        message: err.message ?? "An unexpected error occurred."
      }
    })
  );
  return true;
});
