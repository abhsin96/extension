/**
 * QA session — wires the sidebar UI to the Chrome message bus.
 * Extracted from content_script.js so it can be unit-tested independently.
 *
 * @param {{ sidebar: object, sendMessage: Function }} deps
 * @returns {{ handleSend: Function }}
 */

import { msgId } from './sidebar.js'

const HEALTH_POLL_MS = 5_000

export function createQaSession({ sidebar, sendMessage }) {
  // Video IDs we've successfully auto-ingested this browser session.
  const _ingestedIds = new Set()

  // Cancellation token for the currently in-flight ask (null when idle).
  let _currentRef = null

  // Health-poll interval ID (null when not polling).
  let _healthTimer = null

  function _stopHealthPoll() {
    if (_healthTimer !== null) {
      clearInterval(_healthTimer)
      _healthTimer = null
    }
  }

  function _startHealthPoll() {
    if (_healthTimer !== null) return
    _healthTimer = setInterval(async () => {
      try {
        const res = await sendMessage({ type: 'PING_HEALTH' })
        if (res?.ok) {
          sidebar.hideToast()
          _stopHealthPoll()
        }
      } catch {
        // Network still down — keep polling
      }
    }, HEALTH_POLL_MS)
  }

  function _showBackendToast(question, videoId) {
    sidebar.showToast({
      text: 'Cannot reach the backend — is the server running?',
      action: 'Retry',
      onAction: () => {
        sidebar.hideToast()
        _stopHealthPoll()
        handleSend(question, videoId)
      },
    })
    _startHealthPoll()
  }

  async function handleSend(question, videoId) {
    if (!videoId) {
      sidebar.addMessage({
        id: msgId(),
        role: 'error',
        text: 'No video detected — navigate to a YouTube watch page first.',
      })
      return
    }

    const ref = { cancelled: false }
    _currentRef = ref

    sidebar.addMessage({ id: msgId(), role: 'user', text: question })

    // ── Phase 1: auto-ingest on first question for this video ──────────────
    if (!_ingestedIds.has(videoId)) {
      sidebar.setLoading(true, { text: 'Preparing transcript\u2026' })
      sidebar.setCancellable(() => {
        ref.cancelled = true
        _currentRef = null
        sidebar.setLoading(false)
        sidebar.clearCancellable()
      })

      let ingestRes
      try {
        ingestRes = await sendMessage({ type: 'INGEST_VIDEO', videoId })
      } catch (err) {
        if (ref.cancelled) return
        sidebar.setLoading(false)
        sidebar.clearCancellable()
        _currentRef = null
        sidebar.addMessage({ id: msgId(), role: 'error', text: err?.message ?? 'Connection error.' })
        return
      }

      if (ref.cancelled) return
      sidebar.setLoading(false)

      if (!ingestRes.ok) {
        sidebar.clearCancellable()
        _currentRef = null
        sidebar.addMessage({ id: msgId(), role: 'error', text: ingestRes.error.message })
        if (ingestRes.error.code === 'BACKEND_UNREACHABLE') _showBackendToast(question, videoId)
        return
      }

      _ingestedIds.add(videoId)
    }

    if (ref.cancelled) return

    // ── Phase 2: ask ──────────────────────────────────────────────────────
    const skeletonId = msgId()
    sidebar.addSkeletonMessage(skeletonId)
    sidebar.setLoading(true)
    sidebar.setCancellable(() => {
      ref.cancelled = true
      _currentRef = null
      sidebar.removeMessage(skeletonId)
      sidebar.setLoading(false)
      sidebar.clearCancellable()
    })

    let res
    try {
      res = await sendMessage({ type: 'ASK_QUESTION', videoId, question })
    } catch (err) {
      if (ref.cancelled) return
      sidebar.finalizeMessage(skeletonId, { role: 'error', text: err?.message ?? 'Connection error.' })
      sidebar.setLoading(false)
      sidebar.clearCancellable()
      _currentRef = null
      return
    }

    if (ref.cancelled) return

    sidebar.setLoading(false)
    sidebar.clearCancellable()
    _currentRef = null

    if (res.ok) {
      sidebar.finalizeMessage(skeletonId, {
        role: 'assistant',
        text: res.data.answer,
        refused: res.data.refused,
        citations: res.data.citations ?? [],
      })
    } else {
      sidebar.finalizeMessage(skeletonId, { role: 'error', text: res.error.message })
      if (res.error.code === 'BACKEND_UNREACHABLE') _showBackendToast(question, videoId)
    }
  }

  return { handleSend }
}
