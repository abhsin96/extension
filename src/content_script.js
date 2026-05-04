/**
 * Content script — injected on youtube.com/watch* pages at document_idle.
 * Detects video ID changes as YouTube navigates between videos (SPA-style)
 * and notifies the background service worker via chrome.runtime.sendMessage.
 */

const SENTINEL = '[YouTube Q&A] content script active'

function getVideoId() {
  return new URLSearchParams(location.search).get('v')
}

function notifyVideoChanged(videoId) {
  chrome.runtime.sendMessage({ type: 'VIDEO_CHANGED', videoId })
}

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

const initial = getVideoId()
if (initial) {
  console.log(SENTINEL, { videoId: initial })
  notifyVideoChanged(initial)
}

// ---------------------------------------------------------------------------
// SPA navigation — YouTube uses history.pushState between videos
// ---------------------------------------------------------------------------

let lastVideoId = initial

new MutationObserver(() => {
  const current = getVideoId()
  if (current && current !== lastVideoId) {
    lastVideoId = current
    console.log(SENTINEL, { videoId: current })
    notifyVideoChanged(current)
  }
}).observe(document.body, { childList: true, subtree: true })
