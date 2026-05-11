/**
 * Per-video conversation history backed by chrome.storage.local.
 * Each turn: { role: 'user'|'assistant', content: string, timestamp: number }
 */

export interface Turn {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export const MAX_HISTORY_TURNS = 10
const KEY_PREFIX = 'history:'

function key(videoId: string): string {
  return KEY_PREFIX + videoId
}

export async function getHistory(videoId: string): Promise<Turn[]> {
  const result = await chrome.storage.local.get(key(videoId))
  return (result[key(videoId)] as Turn[] | undefined) ?? []
}

export async function appendTurn(
  videoId: string,
  { role, content }: { role: 'user' | 'assistant'; content: string },
): Promise<void> {
  const current = await getHistory(videoId)
  const updated: Turn[] = [...current, { role, content, timestamp: Date.now() }]
  const truncated = updated.slice(-MAX_HISTORY_TURNS)
  await chrome.storage.local.set({ [key(videoId)]: truncated })
}

export async function clearHistory(videoId: string): Promise<void> {
  await chrome.storage.local.remove(key(videoId))
}
