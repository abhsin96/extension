/**
 * Per-video conversation history backed by chrome.storage.local.
 * Each turn: { role: 'user'|'assistant', content: string, timestamp: number }
 */

export const MAX_HISTORY_TURNS = 10
const KEY_PREFIX = 'history:'

function key(videoId) {
  return KEY_PREFIX + videoId
}

export async function getHistory(videoId) {
  const result = await chrome.storage.local.get(key(videoId))
  return result[key(videoId)] ?? []
}

export async function appendTurn(videoId, { role, content }) {
  const current = await getHistory(videoId)
  const updated = [...current, { role, content, timestamp: Date.now() }]
  const truncated = updated.slice(-MAX_HISTORY_TURNS)
  await chrome.storage.local.set({ [key(videoId)]: truncated })
}

export async function clearHistory(videoId) {
  await chrome.storage.local.remove(key(videoId))
}
