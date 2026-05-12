/**
 * QA session — wires the sidebar UI to the Chrome message bus.
 * Extracted from content_script.js so it can be unit-tested independently.
 */

import { msgId, type SidebarApi } from './sidebar.js'
import { getErrorCopy } from './errors/messages.js'
import { createStateMachine, STATES, type StateValue } from './uiState.js'
import type { Turn } from './history.js'

const HEALTH_POLL_MS = 5_000

interface MessageResponse {
  ok: boolean
  data?: Record<string, unknown>
  error?: { code: string; message: string }
}

interface StorageApi {
  getHistory(videoId: string): Promise<Turn[]>
  appendTurn(videoId: string, opts: { role: 'user' | 'assistant'; content: string }): Promise<void>
  clearHistory(videoId: string): Promise<void>
}

interface QaSessionDeps {
  sidebar: SidebarApi
  sendMessage: (msg: Record<string, unknown>) => Promise<MessageResponse | undefined>
  storage?: StorageApi | null
}

export interface QaSession {
  handleSend(question: string, videoId: string | null): Promise<void>
  loadHistory(videoId: string | null): Promise<void>
  handleClear(videoId: string | null): Promise<void>
  getState(): StateValue
}

interface HandleErrorOpts {
  inIngest?: boolean
  skeletonId?: string | null
  question?: string
  videoId?: string | null
}

export function createQaSession({
  sidebar,
  sendMessage,
  storage = null,
}: QaSessionDeps): QaSession {
  const _ingestedIds = new Set<string>()
  const _threadIds = new Map<string, string>()
  let _currentRef: { cancelled: boolean } | null = null
  let _healthTimer: ReturnType<typeof setInterval> | null = null

  const sm = createStateMachine()

  function _stopHealthPoll(): void {
    if (_healthTimer !== null) {
      clearInterval(_healthTimer)
      _healthTimer = null
    }
  }

  function _startHealthPoll(): void {
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

  function _showBackendToast(question: string, videoId: string): void {
    sidebar.showToast({
      text: 'Cannot reach the backend — is the server running?',
      action: 'Retry',
      severity: 'error',
      onAction: () => {
        sidebar.hideToast()
        _stopHealthPoll()
        void handleSend(question, videoId)
      },
    })
    _startHealthPoll()
  }

  function _handleError(
    code: string,
    _message: string | undefined,
    { inIngest = false, skeletonId = null, question, videoId }: HandleErrorOpts = {},
  ): void {
    sm.transition(STATES.ERROR, { code })
    sidebar.setLoading(false)
    sidebar.clearCancellable()
    _currentRef = null

    const copy = getErrorCopy(code)
    const text = copy.message + (copy.action ? ` ${copy.action}` : '')

    if (inIngest && copy.emptyState) {
      sidebar.showEmptyState(copy.emptyState)
    } else if (skeletonId) {
      sidebar.finalizeMessage(skeletonId, { role: 'error', text })
    } else {
      sidebar.addMessage({ id: msgId(), role: 'error', text })
    }

    if (code === 'BACKEND_UNREACHABLE' && question != null && videoId != null) {
      _showBackendToast(question, videoId)
    }
  }

  async function loadHistory(videoId: string | null): Promise<void> {
    if (!storage || !videoId) return
    const turns = await storage.getHistory(videoId)
    if (turns.length === 0) return
    for (const turn of turns) {
      sidebar.addMessage({ id: msgId(), role: turn.role, text: turn.content })
    }
  }

  async function handleClear(videoId: string | null): Promise<void> {
    if (storage && videoId) {
      await storage.clearHistory(videoId)
    }
    if (videoId) {
      _threadIds.delete(videoId)
    }
  }

  async function handleSend(question: string, videoId: string | null): Promise<void> {
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
      sidebar.setLoading(true, { text: 'Preparing transcript…' })
      sidebar.setCancellable(() => {
        ref.cancelled = true
        _currentRef = null
        sm.transition(STATES.IDLE)
        sidebar.setLoading(false)
        sidebar.clearCancellable()
      })

      let ingestRes: MessageResponse | undefined
      try {
        ingestRes = await sendMessage({ type: 'INGEST_VIDEO', videoId })
      } catch (err) {
        if (ref.cancelled) return
        _handleError('BACKEND_UNREACHABLE', (err as Error | undefined)?.message, {
          inIngest: true,
          question,
          videoId,
        })
        return
      }

      if (ref.cancelled) return

      if (!ingestRes?.ok) {
        _handleError(ingestRes?.error?.code ?? 'INTERNAL_ERROR', ingestRes?.error?.message, {
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
    const threadId = _threadIds.get(videoId) ?? null

    let res: MessageResponse | undefined
    try {
      res = await sendMessage({ type: 'ASK_QUESTION', videoId, question, history, threadId })
    } catch (err) {
      if (ref.cancelled) return
      _handleError('BACKEND_UNREACHABLE', (err as Error | undefined)?.message, {
        skeletonId,
        question,
        videoId,
      })
      return
    }

    if (ref.cancelled) return

    sm.transition(STATES.IDLE)
    sidebar.setLoading(false)
    sidebar.clearCancellable()
    _currentRef = null

    if (res?.ok) {
      const answer = (res.data?.['answer'] as string) ?? ''
      const returnedThreadId = res.data?.['thread_id'] as string | null | undefined
      if (returnedThreadId) {
        _threadIds.set(videoId, returnedThreadId)
      }
      sidebar.finalizeMessage(skeletonId, {
        role: 'assistant',
        text: answer,
        refused: res.data?.['refused'] as boolean | undefined,
        citations:
          (res.data?.['citations'] as import('./sidebar.js').DisplayCitation[] | undefined) ?? [],
        animate: true,
      })
      if (storage) {
        await storage.appendTurn(videoId, { role: 'user', content: question })
        await storage.appendTurn(videoId, { role: 'assistant', content: answer })
      }
    } else {
      _handleError(res?.error?.code ?? 'INTERNAL_ERROR', res?.error?.message, {
        skeletonId,
        question,
        videoId,
      })
    }
  }

  return {
    handleSend,
    loadHistory,
    handleClear,
    getState: () => sm.getState(),
  }
}
