/**
 * Content script — injected on youtube.com/watch* pages at document_idle.
 * Handles video ID detection AND the Q&A chat sidebar.
 */

import { extractVideoId } from './utils/videoId.js'
import { createSidebar } from './sidebar.js'
import { createQaSession } from './wiring.js'
import { injectSeekBridge, seekVideo } from './utils/seek_bridge.js'
import * as historyStorage from './history.js'

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
let hasTranscript = false

document.getElementById('yt-qa-root')?.remove()
injectSeekBridge()

const sidebar = createSidebar({
  onSend: (question) => session.handleSend(question, currentVideoId),
  onClear: () => session.handleClear(currentVideoId),
  onSeek: seekVideo,
  onOpenOptions: () => chrome.runtime.openOptionsPage(),
})

const session = createQaSession({
  sidebar,
  sendMessage: (msg) => chrome.runtime.sendMessage(msg),
  storage: historyStorage,
})

// Inject sidebar host adjacent to #secondary (YouTube's recommendations panel)
// so it sits logically next to the player. The host uses position:fixed so the
// actual parent does not affect visual layout, but placement here keeps the
// extension's node organised with the page structure.
function mountSidebar() {
  if (document.getElementById('yt-qa-root')) return
  const anchor = document.querySelector('#secondary, ytd-watch-next-secondary-results-renderer')
  if (anchor) {
    anchor.parentElement.insertBefore(sidebar.host, anchor)
  } else {
    document.body.appendChild(sidebar.host)
  }
}

mountSidebar()

// Retry once after a short delay for SPA navigations where #secondary is added
// to the DOM after the content script has already run.
if (!document.getElementById('yt-qa-root')) {
  requestAnimationFrame(mountSidebar)
}

// Check if the current video has a transcript available
async function checkTranscriptAvailability(videoId) {
  if (!videoId) {
    hasTranscript = false
    sidebar.hideToggleButton()
    return
  }

  try {
    // Try to check if transcript is available by attempting a lightweight check
    // We'll use the ingest endpoint with force=false to see if it can access the transcript
    const response = await chrome.runtime.sendMessage({
      type: 'CHECK_TRANSCRIPT',
      videoId,
    })

    hasTranscript = response?.ok && response?.data?.hasTranscript

    if (hasTranscript) {
      sidebar.showToggleButton()
    } else {
      sidebar.hideToggleButton()
    }
  } catch (err) {
    console.warn('[YouTube Q&A] Failed to check transcript availability:', err)
    hasTranscript = false
    sidebar.hideToggleButton()
  }
}

// ---------------------------------------------------------------------------
// Navigation detection
// ---------------------------------------------------------------------------

let lastVideoId = null

function broadcast(videoId, url) {
  if (videoId !== currentVideoId) {
    currentVideoId = videoId
    sidebar.clearMessages()
    session.loadHistory(videoId)
    checkTranscriptAvailability(videoId)
  }
  console.log(SENTINEL, { videoId, url })
  chrome.runtime.sendMessage({ type: 'VIDEO_CHANGED', videoId, url })
    .then((res) => {
      if (res?.ok && res.data?.health) {
        const hasKey = res.data.health.has_api_key
        sidebar.setApiKeyRequired(!hasKey)
        if (!hasKey) {
          sidebar.showEmptyState('key-missing')
        } else {
          sidebar.clearEmptyState()
        }
      } else if (!res?.ok) {
        sidebar.showEmptyState('backend-down')
      }
    })
    .catch(() => {
      sidebar.showEmptyState('backend-down')
    })
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
