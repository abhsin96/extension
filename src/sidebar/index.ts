import { createMessageList } from './MessageList.js'
import { createInputArea } from './InputArea.js'
import { createToast, type ShowToastOptions } from './Toast.js'
import { createEmptyState } from './EmptyState.js'
import { createToggleButton } from './ToggleButton.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DisplayCitation {
  chunk_id?: string
  start_ts?: number | string | null
  end_ts?: number | string | null
  text?: string
}

export interface AddMessageOptions {
  id: string
  role: string
  text: string
  refused?: boolean
  citations?: DisplayCitation[]
}

export interface FinalizeMessageOptions {
  role: string
  text: string
  refused?: boolean
  citations?: DisplayCitation[]
  animate?: boolean
}

interface LoadingOptions {
  text?: string
}

interface SidebarCallbacks {
  onSend?: (text: string) => void
  onClose?: () => void
  onClear?: () => void
  onSeek?: (sec: number) => void
  onOpenOptions?: () => void
}

export interface SidebarApi {
  host: HTMLElement
  open(): void
  close(): void
  addMessage(opts: AddMessageOptions): HTMLElement
  addSkeletonMessage(id: string): HTMLElement
  finalizeMessage(id: string, opts: FinalizeMessageOptions): HTMLElement
  removeMessage(id: string): void
  clearMessages(): void
  clearInput(): void
  setLoading(loading: boolean, opts?: LoadingOptions): void
  setCancellable(fn: () => void): void
  clearCancellable(): void
  showToast(opts?: ShowToastOptions): void
  hideToast(): void
  showEmptyState(type: string): void
  clearEmptyState(): void
  setApiKeyRequired(required: boolean): void
  showToggleButton(): void
  hideToggleButton(): void
  isOpen(): boolean
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _injectFonts(): void {
  const fonts = [
    'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap',
  ]
  for (const href of fonts) {
    if (document.head.querySelector(`link[href="${href}"]`)) continue
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
  }
}

const CSS = `
:host { all: initial; font-family: 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, sans-serif; }

.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal; font-style: normal;
  line-height: 1; letter-spacing: normal; text-transform: none;
  display: inline-block; white-space: nowrap; direction: ltr;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  -moz-osx-font-smoothing: grayscale; font-feature-settings: 'liga';
}

/* ---- Toggle button (FAB) ---- */
.toggle-btn {
  position: fixed; bottom: 24px; right: 24px; z-index: 9001;
  width: 60px; height: 60px; border-radius: 50%;
  background: linear-gradient(135deg, #2295ed 0%, #ff5540 100%);
  color: #fff; border: none; cursor: pointer;
  box-shadow: 0 8px 32px rgba(34,149,237,.45), 0 4px 16px rgba(255,85,64,.35);
  display: flex; align-items: center; justify-content: center;
  transition: transform .2s, box-shadow .2s;
}
.toggle-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 12px 40px rgba(34,149,237,.55), 0 6px 20px rgba(255,85,64,.45);
}
.toggle-btn .material-symbols-outlined {
  font-size: 26px;
  font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24;
}

/* ---- Popup panel ---- */
.sidebar {
  position: fixed; bottom: 96px; right: 24px;
  width: 380px; height: 600px; z-index: 9000;
  display: flex; flex-direction: column;
  transform: translateY(16px) scale(0.97);
  opacity: 0; pointer-events: none;
  transition: transform .25s cubic-bezier(.34,1.56,.64,1), opacity .2s ease;
  transform-origin: bottom right;
  background: #131313; border-radius: 20px;
  border: 1px solid #3a2a28;
  box-shadow: 0 24px 80px rgba(0,0,0,.8), 0 8px 32px rgba(0,0,0,.6);
  overflow: hidden; color: #f0f0f0;
}
:host(.open) .sidebar { transform: translateY(0) scale(1); opacity: 1; pointer-events: auto; }

/* Fullscreen — hide everything */
:host(.fullscreen) .sidebar,
:host(.fullscreen) .toggle-btn { display: none; }

/* Theater mode */
:host(.theater) .sidebar { bottom: 24px; }

/* ---- Header ---- */
.sidebar-header {
  display: flex; align-items: center; padding: 13px 14px;
  border-bottom: 1px solid rgba(255,255,255,.06); flex-shrink: 0;
  background: #201f1f; gap: 8px;
}
.header-brand-icon {
  font-size: 20px;
  font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24;
  background: linear-gradient(135deg, #2295ed, #ff5540);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.sidebar-title { font-size: 15px; font-weight: 700; flex: 1; color: #ffffff; letter-spacing: -0.01em; }
.header-actions { display: flex; gap: 2px; }
.header-icon-btn, .close-btn {
  background: none; border: none; cursor: pointer;
  width: 32px; height: 32px; border-radius: 8px;
  color: #666;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s, color .15s; font-family: inherit;
}
.header-icon-btn:hover, .close-btn:hover { background: rgba(255,255,255,.08); color: #e0e0e0; }
.header-icon-btn .material-symbols-outlined,
.close-btn .material-symbols-outlined {
  font-size: 18px;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20;
}

/* ---- Message list ---- */
.message-list {
  flex: 1; overflow-y: auto; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 10px;
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.12) transparent;
  background: #131313;
}
.message-list::-webkit-scrollbar { width: 4px; }
.message-list::-webkit-scrollbar-track { background: transparent; }
.message-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 2px; }

/* ---- Welcome card ---- */
.welcome-card {
  background: #2a2a2a; border-radius: 16px;
  padding: 24px 20px 16px; display: flex; flex-direction: column;
  align-items: center; text-align: center; gap: 12px;
  margin: 4px 0;
}
.welcome-icon-wrap {
  width: 72px; height: 72px; border-radius: 50%;
  background: #2295ed;
  display: flex; align-items: center; justify-content: center;
}
.welcome-icon-wrap .material-symbols-outlined {
  font-size: 34px; color: #0d1b2a;
  font-variation-settings: 'FILL' 1, 'wght' 600, 'GRAD' 0, 'opsz' 40;
}
.welcome-title { font-size: 15px; font-weight: 700; color: #f0f0f0; margin: 0; }
.welcome-sub { font-size: 13px; color: #888; line-height: 1.55; margin: 0; }
.welcome-cta {
  width: 100%; margin-top: 4px;
  padding: 12px 16px; border-radius: 12px;
  background: #131313; color: #ff7b6b;
  font-size: 13px; font-weight: 700; text-align: center;
  box-sizing: border-box;
}

/* ---- Messages ---- */
.message { display: flex; flex-direction: column; gap: 8px; max-width: 90%; }
.message--user { align-self: flex-end; }
.message--assistant, .message--error { align-self: flex-start; }
.message-bubble {
  padding: 9px 13px; border-radius: 12px;
  font-size: 14px; line-height: 1.55; word-break: break-word; white-space: pre-wrap;
}
.message--user .message-bubble {
  background: #2295ed; color: #fff; border-bottom-right-radius: 4px;
}
.message--assistant .message-bubble {
  background: #201f1f; color: #f0f0f0;
  border-left: 2px solid rgba(34,149,237,.5);
  border-radius: 0 12px 12px 4px;
}
.message--refusal .message-bubble {
  background: rgba(255,85,64,.1); color: #ff9b8e; font-style: italic;
  border: 1px solid rgba(255,85,64,.25); border-bottom-left-radius: 4px;
}
.message--error .message-bubble {
  background: rgba(255,85,64,.1); color: #ff7b6b;
  border: 1px solid rgba(255,85,64,.2); border-bottom-left-radius: 4px; font-size: 13px;
}

/* ---- Loading indicator ---- */
.loading {
  align-self: flex-start;
  padding: 9px 14px; background: #201f1f;
  border-left: 2px solid rgba(34,149,237,.5);
  border-radius: 0 12px 12px 4px;
  font-size: 13px; color: #777;
}
.loading::after {
  content: ''; display: inline-block; width: 4px; height: 4px;
  margin-left: 4px; border-radius: 50%; background: currentColor;
  animation: dot 1.2s infinite;
}
@keyframes dot { 0%,80%,100% { opacity: 0 } 40% { opacity: 1 } }

/* ---- Typewriter cursor ---- */
.message-bubble--typing::after {
  content: '|'; display: inline-block; margin-left: 1px;
  color: #2295ed; animation: blink-cursor .7s step-end infinite;
}
@keyframes blink-cursor { 0%,100% { opacity: 1 } 50% { opacity: 0 } }

/* ---- Footer ---- */
.sidebar-footer {
  padding: 10px 12px 12px; border-top: 1px solid rgba(255,255,255,.06);
  flex-shrink: 0; display: flex; flex-direction: column; gap: 8px;
  background: #201f1f;
}

/* ---- Quick action chips ---- */
.quick-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 11px; border-radius: 20px; font-size: 12px; font-weight: 500;
  cursor: pointer; border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.05); color: #999;
  transition: background .15s, border-color .15s, color .15s; font-family: inherit;
}
.chip .material-symbols-outlined {
  font-size: 14px;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20;
}
.chip:hover { background: rgba(34,149,237,.14); border-color: rgba(34,149,237,.35); color: #7ec8f7; }

/* ---- Input row ---- */
.input-row { display: flex; gap: 8px; align-items: flex-end; }
.input {
  flex: 1; box-sizing: border-box; resize: none;
  border: none; border-radius: 12px;
  padding: 9px 12px; font-size: 14px; font-family: inherit;
  line-height: 1.5; outline: none;
  background: #2a2a2a; color: #f0f0f0;
  overflow-y: hidden; transition: background .15s;
}
.input:focus { background: #333; }
.input::placeholder { color: #555; }

/* ---- Action buttons ---- */
.send-btn {
  width: 36px; height: 36px; flex-shrink: 0; border-radius: 50%;
  background: #2295ed; color: #fff; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: opacity .15s, background .15s;
}
.send-btn:disabled { opacity: .35; cursor: default; }
.send-btn:not(:disabled):hover { background: #1a7fd0; }
.send-btn .material-symbols-outlined {
  font-size: 18px;
  font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 20;
}

.action-row { display: flex; gap: 8px; align-items: center; }
button { font-family: inherit; cursor: pointer; border: none; }
button:disabled { opacity: .35; cursor: default; }

.clear-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 11px; border-radius: 8px; font-size: 12px; font-weight: 500;
  background: rgba(255,255,255,.06); color: #888; border: 1px solid rgba(255,255,255,.08);
  transition: background .15s, color .15s;
}
.clear-btn .material-symbols-outlined {
  font-size: 15px;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20;
}
.clear-btn:hover { background: rgba(255,255,255,.1); color: #bbb; }
.clear-btn--confirm { background: rgba(255,85,64,.1); color: #ff9b8e; border-color: rgba(255,85,64,.3); }
.clear-btn--confirm:hover { background: rgba(255,85,64,.18); }

.cancel-btn {
  display: flex; align-items: center;
  padding: 5px 11px; border-radius: 8px; font-size: 12px; font-weight: 500;
  background: rgba(255,255,255,.06); color: #888; border: 1px solid rgba(255,255,255,.08);
  transition: background .15s, color .15s;
}
.cancel-btn:hover { background: rgba(255,255,255,.1); color: #bbb; }

[hidden] { display: none !important; }

/* ---- Toast banner ---- */
.toast {
  padding: 10px 16px; font-size: 13px;
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  background: rgba(255,211,0,.08); color: #ffd966; border-bottom: 1px solid rgba(255,211,0,.18);
}
.toast--warn { background: rgba(255,211,0,.08); color: #ffd966; border-bottom-color: rgba(255,211,0,.18); }
.toast--error { background: rgba(255,85,64,.1); color: #ff9b8e; border-bottom-color: rgba(255,85,64,.18); }
.toast--info { background: rgba(34,149,237,.1); color: #7ec8f7; border-bottom-color: rgba(34,149,237,.18); }
.toast-action {
  margin-left: auto; padding: 3px 10px; background: transparent;
  border: 1px solid currentColor; border-radius: 6px; cursor: pointer;
  font-size: 12px; color: inherit; flex-shrink: 0; font-family: inherit;
  transition: background .15s;
}
.toast-action:hover { background: rgba(255,255,255,.08); }

/* ---- Timestamp links ---- */
.ts-link {
  color: #2295ed; text-decoration: none; cursor: pointer;
  border-radius: 3px; padding: 0 1px;
}
.ts-link:hover { text-decoration: underline; }
.ts-link:active { color: #5cb8ff; }

/* ---- Citation block ---- */
.citations { margin-top: 8px; font-size: 12px; }
.citations summary {
  cursor: pointer; user-select: none; color: #2295ed;
  font-size: 12px; list-style: none; padding: 2px 0;
}
.citations summary:hover { text-decoration: underline; }
.citation-list {
  margin: 6px 0 0; padding: 0; list-style: none;
  display: flex; flex-direction: column; gap: 6px;
}
.citation-item {
  background: rgba(255,255,255,.04); border-left: 2px solid rgba(34,149,237,.35);
  padding: 6px 8px; border-radius: 0 6px 6px 0;
}
.citation-text { color: #777; font-size: 12px; line-height: 1.4; }

/* ---- Skeleton shimmer ---- */
.message--skeleton .message-bubble {
  background: linear-gradient(90deg, #201f1f 25%, #2a2929 50%, #201f1f 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
  color: transparent; min-width: 160px; min-height: 1em;
}
@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }

/* ---- Empty state cards ---- */
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  text-align: center; padding: 40px 24px 24px; gap: 8px;
}
.empty-state-icon { font-size: 36px; line-height: 1; }
.empty-state-heading { font-weight: 600; font-size: 14px; color: #f0f0f0; margin: 0; }
.empty-state-body { font-size: 13px; color: #777; line-height: 1.5; margin: 0; max-width: 240px; }
.empty-state-action {
  margin-top: 6px; padding: 7px 18px;
  background: #2295ed; color: #fff; border-radius: 8px;
  font-size: 13px; cursor: pointer; border: none; font-family: inherit;
  transition: background .15s;
}
.empty-state-action:hover { background: #1a7fd0; }
`

function buildTemplate(): string {
  return `
    <button class="toggle-btn" aria-label="Toggle ClipConvo" title="ClipConvo" data-testid="sidebar-toggle">
      <span class="material-symbols-outlined">chat</span>
    </button>
    <aside class="sidebar" role="complementary" aria-label="ClipConvo Chat" data-testid="sidebar-panel">
      <header class="sidebar-header">
        <span class="material-symbols-outlined header-brand-icon">auto_awesome</span>
        <span class="sidebar-title">ClipConvo</span>
        <div class="header-actions">
          <button class="header-icon-btn history-btn" aria-label="History" title="History">
            <span class="material-symbols-outlined">history</span>
          </button>
          <button class="header-icon-btn settings-btn" aria-label="Settings" title="Settings">
            <span class="material-symbols-outlined">settings</span>
          </button>
          <button class="close-btn" aria-label="Close sidebar" data-testid="close-btn">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      </header>

      <div class="toast" hidden role="alert" data-testid="toast"></div>
      <div class="message-list" role="log" aria-live="polite" aria-label="Chat messages" data-testid="message-list">
        <div class="welcome-card">
          <div class="welcome-icon-wrap">
            <span class="material-symbols-outlined">chat_bubble</span>
          </div>
          <p class="welcome-title">Welcome to ClipConvo</p>
          <p class="welcome-sub">AI companion for this video. Summarize, extract facts, or ask questions.</p>
          <div class="welcome-cta">Ask a question to get started.</div>
        </div>
      </div>
      <footer class="sidebar-footer">
        <div class="quick-chips" aria-label="Quick actions">
          <button class="chip" data-chip="summarize">
            <span class="material-symbols-outlined">summarize</span>Summarize
          </button>
          <button class="chip" data-chip="takeaways">
            <span class="material-symbols-outlined">key</span>Key Takeaways
          </button>
          <button class="chip" data-chip="quiz">
            <span class="material-symbols-outlined">quiz</span>Quiz Me
          </button>
        </div>
        <div class="input-row">
          <textarea
            class="input"
            placeholder="Ask about this video…"
            rows="1"
            aria-label="Question"
            data-testid="question-input"
          ></textarea>
          <button class="send-btn" disabled aria-label="Send question" data-testid="send-btn">
            <span class="material-symbols-outlined">send</span>
          </button>
        </div>
        <div class="action-row">
          <button class="cancel-btn" hidden aria-label="Cancel" data-testid="cancel-btn">Cancel</button>
          <button class="clear-btn" aria-label="Clear conversation" data-testid="clear-btn">
            <span class="material-symbols-outlined">delete_sweep</span>
            <span class="clear-btn-label">Clear</span>
          </button>
        </div>
      </footer>
    </aside>
  `
}

let _idCounter = 0
export function msgId(): string {
  return `msg-${++_idCounter}`
}

export function createSidebar({
  onSend,
  onClose,
  onClear,
  onSeek,
  onOpenOptions,
}: SidebarCallbacks = {}): SidebarApi {
  _injectFonts()

  const host = document.createElement('div')
  host.id = 'yt-qa-root'

  const shadow = host.attachShadow({ mode: 'open' })

  // Keyboard events bubble from the shadow DOM up through the host into the
  // main page, where YouTube intercepts them as shortcuts. Stop them in the
  // bubble phase (NOT capture) so the shadow DOM's own listeners fire first,
  // then we block further propagation to YouTube before it reaches the document.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    host.addEventListener(type, (e) => e.stopPropagation())
  }

  const styleEl = document.createElement('style')
  styleEl.textContent = CSS

  const wrapper = document.createElement('div')
  wrapper.innerHTML = buildTemplate()

  shadow.appendChild(styleEl)
  shadow.appendChild(wrapper)

  const $ = <T extends HTMLElement = HTMLElement>(sel: string): T =>
    shadow.querySelector<T>(sel) as T

  const toggleBtn = $<HTMLButtonElement>('.toggle-btn')
  const sidebarEl = $('.sidebar')
  const closeBtn = $<HTMLButtonElement>('.close-btn')
  const messageList = $('.message-list')
  const textarea = $<HTMLTextAreaElement>('.input')
  const sendBtn = $<HTMLButtonElement>('.send-btn')
  const clearBtn = $<HTMLButtonElement>('.clear-btn')
  const clearBtnLabel = $('.clear-btn-label')
  const cancelBtn = $<HTMLButtonElement>('.cancel-btn')
  const toastEl = $('.toast')
  const historyBtn = $<HTMLButtonElement>('.history-btn')
  const settingsBtn = $<HTMLButtonElement>('.settings-btn')

  let _loading = false
  let _keyRequired = false
  let loadingEl: HTMLElement | null = null
  let _clearPending = false
  let _clearTimer: ReturnType<typeof setTimeout> | null = null
  let _onCancel: (() => void) | null = null

  // -- Clear confirmation (two-tap: first tap → "Sure?", second tap → confirm) --
  function _resetClearPending(): void {
    clearTimeout(_clearTimer ?? undefined)
    _clearPending = false
    clearBtnLabel.textContent = 'Clear'
    clearBtn.classList.remove('clear-btn--confirm')
    clearBtn.setAttribute('aria-label', 'Clear conversation')
  }

  // Create modules
  const messageListApi = createMessageList({
    messageList,
    onSeek,
    onClear: () => {
      onClear?.()
    },
  })

  const inputAreaApi = createInputArea({
    textarea,
    sendBtn,
    shadow,
    onSend,
    onClose: () => toggleButtonApi.close(),
    loading: () => _loading,
    keyRequired: () => _keyRequired,
  }) as { clearInput: () => void; updateSendBtn: () => void }

  const toastApi = createToast({ toastEl })

  const emptyStateApi = createEmptyState({
    messageList,
    onOpenOptions,
  })

  const toggleButtonApi = createToggleButton({
    toggleBtn,
    sidebarEl,
    host,
    textarea,
    onClose,
    onClearPending: _resetClearPending,
  })

  // -- Loading indicator --
  function setLoading(loading: boolean, { text = 'Thinking' }: LoadingOptions = {}): void {
    _loading = loading
    inputAreaApi.updateSendBtn()
    if (loading && !loadingEl) {
      loadingEl = document.createElement('div')
      loadingEl.className = 'loading'
      loadingEl.textContent = text
      messageList.appendChild(loadingEl)
      messageList.scrollTop = messageList.scrollHeight
    } else if (!loading && loadingEl) {
      loadingEl.remove()
      loadingEl = null
    }
  }

  // -- Cancel button --
  function setCancellable(fn: () => void): void {
    _onCancel = fn
    cancelBtn.hidden = false
  }

  function clearCancellable(): void {
    _onCancel = null
    cancelBtn.hidden = true
  }

  // -- API key required gate --
  function setApiKeyRequired(required: boolean): void {
    _keyRequired = !!required
    inputAreaApi.updateSendBtn()
  }

  // -- Event wiring --
  closeBtn.addEventListener('click', () => toggleButtonApi.close())
  cancelBtn.addEventListener('click', () => {
    if (_onCancel) _onCancel()
  })
  historyBtn.addEventListener('click', () => onOpenOptions?.())
  settingsBtn.addEventListener('click', () => onOpenOptions?.())

  // Quick action chips — populate textarea and send
  const _CHIP_QUESTIONS: Record<string, string> = {
    summarize: 'Please summarize the key points of this video.',
    takeaways: 'What are the key takeaways from this video?',
    quiz: 'Create a short quiz to test my understanding of this video.',
  }
  shadow.querySelectorAll<HTMLElement>('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (_loading || _keyRequired) return
      const q = _CHIP_QUESTIONS[chip.dataset.chip ?? '']
      if (!q) return
      textarea.value = q
      // Auto-grow logic
      textarea.style.height = 'auto'
      const lineH = parseInt(getComputedStyle(textarea).lineHeight) || 20
      textarea.style.height = Math.min(textarea.scrollHeight, lineH * 4) + 'px'
      inputAreaApi.updateSendBtn()
      // Send
      const text = textarea.value.trim()
      if (text && !_loading) {
        inputAreaApi.clearInput()
        onSend?.(text)
      }
    })
  })

  clearBtn.addEventListener('click', () => {
    if (!_clearPending) {
      _clearPending = true
      clearBtnLabel.textContent = 'Sure?'
      clearBtn.classList.add('clear-btn--confirm')
      clearBtn.setAttribute('aria-label', 'Confirm clear conversation')
      _clearTimer = setTimeout(_resetClearPending, 3000)
      return
    }
    _resetClearPending()
    messageListApi.clearMessages()
  })

  function clearEmptyStateWrapper(): void {
    emptyStateApi.clearEmptyState()
  }

  return {
    host,
    open: () => toggleButtonApi.open(),
    close: () => toggleButtonApi.close(),
    addMessage: (opts) => {
      clearEmptyStateWrapper()
      return messageListApi.addMessage(opts)
    },
    addSkeletonMessage: (id) => messageListApi.addSkeletonMessage(id),
    finalizeMessage: (id, opts) => messageListApi.finalizeMessage(id, opts),
    removeMessage: (id) => messageListApi.removeMessage(id),
    clearMessages: () => messageListApi.clearMessages(),
    clearInput: () => inputAreaApi.clearInput(),
    setLoading,
    setCancellable,
    clearCancellable,
    showToast: (opts) => toastApi.showToast(opts),
    hideToast: () => toastApi.hideToast(),
    showEmptyState: (type) => emptyStateApi.showEmptyState(type),
    clearEmptyState: () => emptyStateApi.clearEmptyState(),
    setApiKeyRequired,
    showToggleButton: () => toggleButtonApi.showToggleButton(),
    hideToggleButton: () => toggleButtonApi.hideToggleButton(),
    isOpen: () => toggleButtonApi.isOpen(),
  }
}
