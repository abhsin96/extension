/**
 * Seek bridge — crosses the isolated-world boundary between the content script
 * and the YouTube page context so we can set video.currentTime.
 *
 * Strategy: inject a <script> tag (runs in MAIN world) that registers a
 * postMessage listener. Content script calls seekVideo(sec) which posts the
 * message; the injected handler sets video.currentTime.
 */

const BRIDGE_ID = 'yt-qa-seek-bridge'
export const SEEK_MSG_TYPE = 'YT_QA_SEEK'

/**
 * Inject the seek bridge into the page (idempotent).
 * Must be called from a content script that can write to the DOM.
 * Uses an external script file to comply with CSP.
 */
export function injectSeekBridge(): void {
  if (document.getElementById(BRIDGE_ID)) return
  const script = document.createElement('script')
  script.id = BRIDGE_ID
  script.src = chrome.runtime.getURL('src/utils/seek_bridge_injected.js')
  ;(document.head || document.documentElement).appendChild(script)
}

/**
 * Seek the YouTube player to the given timestamp.
 * Sends a postMessage to the injected bridge in the MAIN world.
 */
export function seekVideo(sec: number): void {
  window.postMessage({ type: SEEK_MSG_TYPE, sec }, '*')
}
