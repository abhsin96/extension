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

function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  ms: number,
): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: T) => {
    clearTimeout(timer ?? undefined)
    timer = setTimeout(() => fn(...args), ms)
  }
}

function resolveAbsolute(url: string | URL | null | undefined): string {
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

let currentVideoId: string | null = null

document.getElementById('yt-qa-root')?.remove()
injectSeekBridge()

const sidebar = createSidebar({
  onSend: (question) => void session.handleSend(question, currentVideoId),
  onClear: () => void session.handleClear(currentVideoId),
  onSeek: seekVideo,
  onOpenOptions: () => chrome.runtime.openOptionsPage(),
})

const session = createQaSession({
  sidebar,
  sendMessage: (msg) => chrome.runtime.sendMessage(msg),
  storage: historyStorage,
})

// Inject sidebar host adjacent to #secondary (YouTube's recommendations panel)
function mountSidebar(): void {
  if (document.getElementById('yt-qa-root')) return
  const anchor = document.querySelector('#secondary, ytd-watch-next-secondary-results-renderer')
  if (anchor) {
    anchor.parentElement!.insertBefore(sidebar.host, anchor)
  } else {
    document.body.appendChild(sidebar.host)
  }
}

mountSidebar()

if (!document.getElementById('yt-qa-root')) {
  requestAnimationFrame(mountSidebar)
}

function checkTranscriptAvailability(videoId: string | null): void {
  if (videoId) {
    sidebar.showToggleButton()
  } else {
    sidebar.hideToggleButton()
  }
}

// ---------------------------------------------------------------------------
// Navigation detection
// ---------------------------------------------------------------------------

let lastVideoId: string | null = null

function broadcast(videoId: string, url: string): void {
  if (videoId !== currentVideoId) {
    currentVideoId = videoId
    sidebar.clearMessages()
    void session.loadHistory(videoId)
    checkTranscriptAvailability(videoId)
  }
  console.log(SENTINEL, { videoId, url })
  void chrome.runtime.sendMessage({ type: 'VIDEO_CHANGED', videoId, url })
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

function handleNavigation(rawUrl?: string | URL | null): void {
  const url = resolveAbsolute(rawUrl)
  const videoId = extractVideoId(url)
  if (!videoId || videoId === lastVideoId) return
  lastVideoId = videoId
  debouncedBroadcast(videoId, url)
}

// Primary: YouTube's own SPA event
document.addEventListener('yt-navigate-finish', (e) => {
  handleNavigation((e as CustomEvent<{ url?: string }>).detail?.url)
})

// Secondary: History API patching
const _pushState = history.pushState.bind(history)
history.pushState = function (data, unused, url) {
  _pushState(data, unused, url)
  handleNavigation(url)
}

const _replaceState = history.replaceState.bind(history)
history.replaceState = function (data, unused, url) {
  _replaceState(data, unused, url)
  handleNavigation(url)
}

window.addEventListener('popstate', () => handleNavigation())

// Initial load
handleNavigation()
