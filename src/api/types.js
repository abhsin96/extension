/**
 * JSDoc type definitions for the API contract.
 * Mirrors the Pydantic models in backend/src/main.py.
 * This file contains no runtime code — import it only for editor intellisense.
 */

/**
 * @typedef {Object} HealthResponse
 * @property {string}  status             - Always "ok"
 * @property {string}  version            - Server version string
 * @property {boolean} langsmith_enabled  - Whether LangSmith tracing is active
 * @property {boolean} has_api_key        - Whether an OpenAI key is configured
 */

/**
 * @typedef {Object} IngestRequest
 * @property {string}  video_id  - YouTube video ID (e.g. "dQw4w9WgXcQ")
 * @property {boolean} [force]   - Re-ingest even if the collection already exists
 */

/**
 * @typedef {Object} IngestResponse
 * @property {'done'|'skipped'|'error'} status  - Pipeline outcome
 * @property {number}  chunk_count               - Number of chunks stored
 * @property {boolean} cached                    - True when the collection was already present
 */

/**
 * A single transcript excerpt returned alongside an answer.
 *
 * @typedef {Object} Citation
 * @property {string} chunk_id  - Unique chunk identifier
 * @property {number} start_ts  - Start timestamp in seconds
 * @property {number} end_ts    - End timestamp in seconds
 * @property {string} text      - Excerpt text
 */

/**
 * @typedef {Object} AskRequest
 * @property {string} question  - Natural-language question
 * @property {number} [k]       - Number of chunks to retrieve (default 5)
 */

/**
 * @typedef {Object} AskResponse
 * @property {string}    answer      - Model's answer
 * @property {Citation[]} citations  - Source excerpts used
 * @property {boolean}   refused     - True when the model could not answer from context
 * @property {number|undefined} tokens_used  - Prompt token count (undefined until BE exposes it)
 */

/**
 * Standard FastAPI error envelope.
 *
 * @typedef {Object} ErrorEnvelope
 * @property {string} detail  - Human-readable error description
 */

/**
 * @typedef {Object} StatusResponse
 * @property {boolean} has_api_key  - Whether an API key is stored on the server
 */

export {}
