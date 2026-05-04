/**
 * Content script — injected on youtube.com/watch* pages at document_idle.
 *
 * Detection strategy (most to least reliable):
 *   1. yt-navigate-finish  — YouTube's own SPA navigation event
 *   2. history.pushState / replaceState patching — catches navigations that
 *      don't fire yt-navigate-finish
 *   3. popstate — browser back/forward
 *
 * All paths go through handleNavigation(), which deduplicates by video ID
 * and debounces 200 ms to collapse bursts from multiple simultaneous signals.
 */

import { extractVideoId } from './utils/videoId.js'

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
// Core logic
// ---------------------------------------------------------------------------

let lastVideoId = null

function broadcast(videoId, url) {
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

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

// Primary: YouTube's own SPA event (most reliable)
document.addEventListener('yt-navigate-finish', (e) => {
  handleNavigation(e.detail?.url)
})

// Secondary: History API patching (fires when yt-navigate-finish doesn't)
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

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

handleNavigation()
