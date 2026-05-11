/**
 * TypeScript type definitions for the API contract.
 * Mirrors the Pydantic models in backend/src/main.py.
 * This file contains no runtime code.
 */

export interface HealthResponse {
  status: string;
  version: string;
  langsmith_enabled: boolean;
  has_api_key: boolean;
}

export interface IngestRequest {
  video_id: string;
  force?: boolean;
}

export interface IngestResponse {
  status: 'done' | 'skipped' | 'error';
  chunk_count: number;
  cached: boolean;
}

/** A single transcript excerpt returned alongside an answer. */
export interface Citation {
  chunk_id: string;
  start_ts: number;
  end_ts: number;
  text: string;
}

export interface AskRequest {
  question: string;
  k?: number;
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
  refused: boolean;
  /** Prompt token count (undefined until BE exposes it). */
  tokens_used?: number;
  thread_id?: string | null;
}

/** Standard FastAPI error envelope. */
export interface ErrorEnvelope {
  detail: string;
}

export interface StatusResponse {
  has_api_key: boolean;
}
