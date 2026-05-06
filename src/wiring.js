/**
 * QA session — wires the sidebar UI to the Chrome message bus.
 * Extracted from content_script.js so it can be unit-tested independently.
 *
 * @param {{ sidebar: object, sendMessage: Function, storage?: object }} deps
 * @returns {{ handleSend: Function, loadHistory: Function, handleClear: Function, getState: Function }}
 */

import { msgId } from './sidebar.js'
import { getErrorCopy } from './errors/messages.js'
import { createStateMachine, STATES } from './uiState.js'

const HEALTH_POLL_MS = 5_000

export function createQaSession({ sidebar, sendMessage, storage = null }) {
  const _ingestedIds = new Set()
  let _currentRef = null
  let _healthTimer = null

  const sm = createStateMachine()

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
      severity: 'error',
      onAction: () => {
        sidebar.hideToast()
        _stopHealthPoll()
        handleSend(question, videoId)
      },
    })
    _startHealthPoll()
  }

  function _handleError(code, message, { inIngest = false, skeletonId = null, question, videoId } = {}) {
    sm.transition(STATES.ERROR, { code })
    sidebar.setLoading(false)
    sidebar.clearCancellable()
    _currentRef = null

    const copy = getErrorCopy(code)
    const text = copy.message + (copy.action ? ` ${copy.action}` : '')

    if (inIngest && copy.emptyState) {
      // Pre-conversation error: show as empty state card
      sidebar.showEmptyState(copy.emptyState)
    } else if (skeletonId) {
      sidebar.finalizeMessage(skeletonId, { role: 'error', text })
    } else {
      sidebar.addMessage({ id: msgId(), role: 'error', text })
    }

    if (code === 'BACKEND_UNREACHABLE') {
      _showBackendToast(question, videoId)
    }
  }

  async function loadHistory(videoId) {
    if (!storage || !videoId) return
    const turns = await storage.getHistory(videoId)
    if (turns.length === 0) return
    for (const turn of turns) {
      sidebar.addMessage({ id: msgId(), role: turn.role, text: turn.content })
    }
  }

  async function handleClear(videoId) {
    if (storage && videoId) {
      await storage.clearHistory(videoId)
    }
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
      sm.transition(STATES.INGESTING)
      sidebar.setLoading(true, { text: 'Preparing transcript\u2026' })
      sidebar.setCancellable(() => {
        ref.cancelled = true
        _currentRef = null
        sm.transition(STATES.IDLE)
        sidebar.setLoading(false)
        sidebar.clearCancellable()
      })

      let ingestRes
      try {
        ingestRes = await sendMessage({ type: 'INGEST_VIDEO', videoId })
      } catch (err) {
        if (ref.cancelled) return
        _handleError('BACKEND_UNREACHABLE', err?.message, { inIngest: true, question, videoId })
        return
      }

      if (ref.cancelled) return

      if (!ingestRes.ok) {
        _handleError(ingestRes.error.code, ingestRes.error.message, {
          inIngest: true,
          question,
          videoId,
        })
        return
      }

      sm.transition(STATES.ASKING)
      sidebar.setLoading(false)
      _ingestedIds.add(videoId)
    }

    if (ref.cancelled) return

    // ── Phase 2: ask ──────────────────────────────────────────────────────
    sm.transition(STATES.ASKING)
    const skeletonId = msgId()
    sidebar.addSkeletonMessage(skeletonId)
    sidebar.setLoading(true)
    sidebar.setCancellable(() => {
      ref.cancelled = true
      _currentRef = null
      sm.transition(STATES.IDLE)
      sidebar.removeMessage(skeletonId)
      sidebar.setLoading(false)
      sidebar.clearCancellable()
    })

    const history = storage ? await storage.getHistory(videoId) : []

    let res
    try {
      res = await sendMessage({ type: 'ASK_QUESTION', videoId, question, history })
    } catch (err) {
      if (ref.cancelled) return
      _handleError('BACKEND_UNREACHABLE', err?.message, { skeletonId, question, videoId })
      return
    }

    if (ref.cancelled) return

    sm.transition(STATES.IDLE)
    sidebar.setLoading(false)
    sidebar.clearCancellable()
    _currentRef = null

    if (res.ok) {
      const answer = res.data.answer
      sidebar.finalizeMessage(skeletonId, {
        role: 'assistant',
        text: answer,
        refused: res.data.refused,
        citations: res.data.citations ?? [],
      })
      if (storage) {
        await storage.appendTurn(videoId, { role: 'user', content: question })
        await storage.appendTurn(videoId, { role: 'assistant', content: answer })
      }
    } else {
      _handleError(res.error.code, res.error.message, { skeletonId, question, videoId })
    }
  }

  return {
    handleSend,
    loadHistory,
    handleClear,
    getState: () => sm.getState(),
  }
}
