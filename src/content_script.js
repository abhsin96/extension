/**
 * Content script — injected on youtube.com/watch* pages at document_idle.
 * Handles video ID detection AND the Q&A chat sidebar.
 */

import { extractVideoId } from './utils/videoId.js'
import { createSidebar, msgId } from './sidebar.js'

const SENTINEL = '[YouTube Q&A] content script active'
const DEBOUNCE_MS = 200

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function debounce(fn, ms) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

function resolveAbsolute(url) {
  if (!url) return location.href
  try {
    return new URL(String(url), location.origin).href
  } catch {
    return location.href
  }
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

let currentVideoId = null

document.getElementById('yt-qa-root')?.remove()

const sidebar = createSidebar({
  onSend: async (question) => {
    if (!currentVideoId) {
      sidebar.addMessage({ id: msgId(), role: 'error', text: 'No video detected — navigate to a YouTube watch page first.' })
      return
    }
    sidebar.addMessage({ id: msgId(), role: 'user', text: question })
    sidebar.setLoading(true)
    try {
      const res = await chrome.runtime.sendMessage({ type: 'ASK_QUESTION', videoId: currentVideoId, question })
      if (res.ok) {
        sidebar.addMessage({ id: msgId(), role: 'assistant', text: res.data.answer, refused: res.data.refused })
      } else {
        sidebar.addMessage({ id: msgId(), role: 'error', text: res.error.message })
      }
    } catch (err) {
      sidebar.addMessage({ id: msgId(), role: 'error', text: err?.message ?? 'Connection error.' })
    } finally {
      sidebar.setLoading(false)
    }
  },
})

document.body.appendChild(sidebar.host)

// ---------------------------------------------------------------------------
// Navigation detection
// ---------------------------------------------------------------------------

let lastVideoId = null

function broadcast(videoId, url) {
  if (videoId !== currentVideoId) {
    currentVideoId = videoId
    sidebar.clearMessages()
  }
  console.log(SENTINEL, { videoId, url })
  chrome.runtime.sendMessage({ type: 'VIDEO_CHANGED', videoId, url })
}

const debouncedBroadcast = debounce(broadcast, DEBOUNCE_MS)

function handleNavigation(rawUrl) {
  const url = resolveAbsolute(rawUrl)
  const videoId = extractVideoId(url)
  if (!videoId || videoId === lastVideoId) return
  lastVideoId = videoId
  debouncedBroadcast(videoId, url)
}

// Primary: YouTube's own SPA event
document.addEventListener('yt-navigate-finish', (e) => {
  handleNavigation(e.detail?.url)
})

// Secondary: History API patching
const _pushState = history.pushState.bind(history)
history.pushState = function (state, title, url) {
  _pushState(state, title, url)
  handleNavigation(url)
}

const _replaceState = history.replaceState.bind(history)
history.replaceState = function (state, title, url) {
  _replaceState(state, title, url)
  handleNavigation(url)
}

window.addEventListener('popstate', () => handleNavigation())

// Initial load
handleNavigation()
