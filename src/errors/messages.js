/**
 * Central map from backend error codes to user-facing copy.
 * Each entry: { message, action, emptyState? }
 *   message    — short user-facing sentence shown in chat or empty state
 *   action     — follow-up hint (shown in empty-state body)
 *   emptyState — if set, the sidebar shows a full empty-state card instead of a chat bubble
 */

export const ERROR_COPY = {
  TRANSCRIPT_DISABLED: {
    message: 'No captions available for this video.',
    action: 'Try a video that has auto-generated captions enabled.',
    emptyState: 'no-captions',
  },
  VIDEO_NOT_FOUND: {
    message: 'Video not found.',
    action: 'Check the URL and try again.',
  },
  RATE_LIMITED: {
    message: "You've hit the rate limit.",
    action: 'Wait a moment, then try again.',
  },
  BACKEND_UNREACHABLE: {
    message: 'Cannot reach the backend.',
    action: 'Start your local backend: cd backend && make run',
    emptyState: 'backend-down',
  },
  API_KEY_MISSING: {
    message: 'API key not configured.',
    action: 'Open the extension options to add your OpenAI API key.',
    emptyState: 'key-missing',
  },
  VIDEO_NOT_INGESTED: {
    message: "This video hasn't been processed yet.",
    action: 'Try asking your question again.',
  },
  INTERNAL_ERROR: {
    message: 'Something went wrong.',
    action: 'Please try again.',
  },
}

export function getErrorCopy(code) {
  return ERROR_COPY[code] ?? ERROR_COPY.INTERNAL_ERROR
}
