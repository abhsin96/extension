/**
 * YouTube Q&A Chat Sidebar.
 * Creates a Shadow DOM-isolated sidebar + floating toggle button.
 *
 * @param {{ onSend?: Function, onClose?: Function, onClear?: Function, onSeek?: Function }} [callbacks]
 * @returns {{ host, open, close, addMessage, clearMessages, clearInput, setLoading, isOpen }}
 */

import { parseTimestamp, formatTimestamp } from './utils/timestamp.js'

const CSS = `
:host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

/* ---- Toggle button ---- */
.toggle-btn {
  position: fixed; bottom: 72px; right: 16px; z-index: 9001;
  width: 48px; height: 48px; border-radius: 50%;
  background: #cc0000; color: #fff; border: none; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,.35); font-size: 22px;
  display: flex; align-items: center; justify-content: center;
  transition: opacity .2s, transform .2s;
}
.toggle-btn:hover { background: #aa0000; transform: scale(1.05); }
:host(.open) .toggle-btn { opacity: 0; pointer-events: none; }

/* ---- Sidebar panel ---- */
.sidebar {
  position: fixed; top: 56px; right: 0; width: 360px;
  height: calc(100vh - 56px); z-index: 9000;
  display: flex; flex-direction: column;
  transform: translateX(100%); transition: transform .25s ease;
  background: #fff; border-left: 1px solid #e5e5e5;
  box-shadow: -4px 0 16px rgba(0,0,0,.1);
}
:host(.open) .sidebar { transform: translateX(0); }

@media (prefers-color-scheme: dark) {
  .sidebar { background: #1f1f1f; border-left-color: #3f3f3f; color: #e8e8e8; }
}

/* Fullscreen — hide everything */
:host(.fullscreen) .sidebar,
:host(.fullscreen) .toggle-btn { display: none; }

/* ---- Header ---- */
.sidebar-header {
  display: flex; align-items: center; padding: 12px 16px;
  border-bottom: 1px solid #e5e5e5; flex-shrink: 0;
}
@media (prefers-color-scheme: dark) {
  .sidebar-header { border-bottom-color: #3f3f3f; }
}
.sidebar-title { font-size: 15px; font-weight: 600; flex: 1; color: #cc0000; }
.close-btn {
  background: none; border: none; cursor: pointer;
  font-size: 18px; color: #606060; padding: 4px 8px; border-radius: 4px;
}
.close-btn:hover { background: rgba(0,0,0,.08); }

/* ---- Message list ---- */
.message-list {
  flex: 1; overflow-y: auto; padding: 12px;
  display: flex; flex-direction: column; gap: 10px;
}
.message-list:empty::before {
  content: 'Ask a question to get started.';
  color: #aaa; font-size: 13px; text-align: center; margin-top: 32px;
  align-self: center;
}
.message { display: flex; max-width: 90%; }
.message--user { align-self: flex-end; }
.message--assistant, .message--error { align-self: flex-start; }
.message-bubble {
  padding: 8px 12px; border-radius: 12px;
  font-size: 14px; line-height: 1.5; word-break: break-word; white-space: pre-wrap;
}
.message--user .message-bubble {
  background: #cc0000; color: #fff; border-bottom-right-radius: 4px;
}
.message--assistant .message-bubble {
  background: #f0f0f0; color: #0f0f0f; border-bottom-left-radius: 4px;
}
@media (prefers-color-scheme: dark) {
  .message--assistant .message-bubble { background: #2f2f2f; color: #e8e8e8; }
}
.message--refusal .message-bubble {
  background: #fff8e1; color: #6d4c0f; font-style: italic;
  border: 1px solid #f9c74f; border-bottom-left-radius: 4px;
}
@media (prefers-color-scheme: dark) {
  .message--refusal .message-bubble { background: #2a2010; color: #f9c74f; border-color: #6d4c0f; }
}
.message--error .message-bubble {
  background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5;
  border-bottom-left-radius: 4px; font-size: 13px;
}
@media (prefers-color-scheme: dark) {
  .message--error .message-bubble { background: #2a1010; color: #f87171; border-color: #7f1d1d; }
}

/* ---- Loading indicator ---- */
.loading {
  align-self: flex-start;
  padding: 8px 14px; background: #f0f0f0; border-radius: 12px;
  border-bottom-left-radius: 4px; font-size: 13px; color: #606060;
}
.loading::after {
  content: ''; display: inline-block; width: 4px; height: 4px;
  margin-left: 4px; border-radius: 50%; background: currentColor;
  animation: dot 1.2s infinite;
}
@keyframes dot { 0%,80%,100% { opacity: 0 } 40% { opacity: 1 } }
@media (prefers-color-scheme: dark) {
  .loading { background: #2f2f2f; color: #aaa; }
}

/* ---- Footer ---- */
.sidebar-footer {
  padding: 12px; border-top: 1px solid #e5e5e5;
  flex-shrink: 0; display: flex; flex-direction: column; gap: 8px;
}
@media (prefers-color-scheme: dark) {
  .sidebar-footer { border-top-color: #3f3f3f; }
}

/* ---- Textarea ---- */
.input {
  width: 100%; box-sizing: border-box; resize: none;
  border: 1px solid #d1d5db; border-radius: 8px;
  padding: 8px 12px; font-size: 14px; font-family: inherit;
  line-height: 1.5; outline: none; background: #fff; color: #0f0f0f;
  overflow-y: hidden; transition: border-color .15s;
}
.input:focus { border-color: #cc0000; }
@media (prefers-color-scheme: dark) {
  .input { background: #2f2f2f; color: #e8e8e8; border-color: #4f4f4f; }
  .input:focus { border-color: #cc0000; }
  .input::placeholder { color: #888; }
}

/* ---- Action row ---- */
.action-row { display: flex; gap: 8px; justify-content: flex-end; }
button {
  padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 500;
  cursor: pointer; border: none; transition: opacity .15s, background .15s;
}
button:disabled { opacity: .4; cursor: default; }
.send-btn { background: #cc0000; color: #fff; }
.send-btn:not(:disabled):hover { background: #aa0000; }
.clear-btn { background: #f0f0f0; color: #606060; }
.clear-btn:hover { background: #e0e0e0; }
.clear-btn--confirm { background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; }
.clear-btn--confirm:hover { background: #fee2e2; }
@media (prefers-color-scheme: dark) {
  .clear-btn { background: #3f3f3f; color: #aaa; }
  .clear-btn:hover { background: #4f4f4f; }
  .clear-btn--confirm { background: #2a1010; color: #f87171; border-color: #7f1d1d; }
  .clear-btn--confirm:hover { background: #3a1515; }
}

/* Theater mode — sidebar remains a fixed overlay; keep open state intact */
:host(.theater) .sidebar { top: 0; height: 100vh; }

/* ---- Timestamp links ---- */
.ts-link {
  color: #065fd4; text-decoration: none; cursor: pointer;
  border-radius: 2px; padding: 0 1px;
}
.ts-link:hover { text-decoration: underline; }
.ts-link:active { color: #003f8a; }
@media (prefers-color-scheme: dark) {
  .ts-link { color: #3ea6ff; }
  .ts-link:active { color: #7bbfff; }
}

/* ---- Citation block ---- */
.citations { margin-top: 8px; font-size: 12px; }
.citations summary {
  cursor: pointer; user-select: none; color: #065fd4;
  font-size: 12px; list-style: none; padding: 2px 0;
}
.citations summary:hover { text-decoration: underline; }
.citation-list {
  margin: 6px 0 0; padding: 0; list-style: none;
  display: flex; flex-direction: column; gap: 6px;
}
.citation-item {
  background: #f8f8f8; border-left: 2px solid #e0e0e0;
  padding: 6px 8px; border-radius: 0 6px 6px 0;
}
.citation-text { color: #606060; font-size: 12px; line-height: 1.4; }
@media (prefers-color-scheme: dark) {
  .citations summary { color: #3ea6ff; }
  .citation-item { background: #252525; border-left-color: #4f4f4f; }
  .citation-text { color: #aaa; }
}

/* ---- Skeleton shimmer placeholder ---- */
.message--skeleton .message-bubble {
  background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
  color: transparent; min-width: 160px; min-height: 1em;
}
@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
@media (prefers-color-scheme: dark) {
  .message--skeleton .message-bubble {
    background: linear-gradient(90deg, #2f2f2f 25%, #3a3a3a 50%, #2f2f2f 75%);
    background-size: 200% 100%;
  }
}

/* ---- Cancel button ---- */
.cancel-btn { background: #f0f0f0; color: #606060; }
.cancel-btn:hover { background: #e0e0e0; }
@media (prefers-color-scheme: dark) {
  .cancel-btn { background: #3f3f3f; color: #aaa; }
  .cancel-btn:hover { background: #4f4f4f; }
}

/* ---- API key required banner ---- */
.key-banner {
  padding: 10px 16px; background: #fef2f2; color: #dc2626;
  border-bottom: 1px solid #fca5a5; font-size: 13px;
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
@media (prefers-color-scheme: dark) {
  .key-banner { background: #2a1010; color: #f87171; border-bottom-color: #7f1d1d; }
}
.key-banner-link {
  margin-left: auto; padding: 3px 10px; background: transparent;
  border: 1px solid currentColor; border-radius: 4px; cursor: pointer;
  font-size: 12px; color: inherit; flex-shrink: 0; font-family: inherit;
}
.key-banner-link:hover { background: rgba(220,38,38,.08); }

/* ---- Toast banner ---- */
.toast {
  padding: 10px 16px; font-size: 13px;
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  /* default: warn — yellow */
  background: #fff3cd; color: #664d03; border-bottom: 1px solid #ffda6a;
}
.toast--warn { background: #fff3cd; color: #664d03; border-bottom-color: #ffda6a; }
.toast--error { background: #fef2f2; color: #dc2626; border-bottom-color: #fca5a5; }
.toast--info  { background: #eff6ff; color: #1d4ed8; border-bottom-color: #93c5fd; }
@media (prefers-color-scheme: dark) {
  .toast, .toast--warn { background: #2a1f00; color: #ffd966; border-bottom-color: #664d03; }
  .toast--error { background: #2a1010; color: #f87171; border-bottom-color: #7f1d1d; }
  .toast--info  { background: #0d1a33; color: #93c5fd; border-bottom-color: #1e3a5f; }
}
.toast-action {
  margin-left: auto; padding: 3px 10px; background: transparent;
  border: 1px solid currentColor; border-radius: 4px; cursor: pointer;
  font-size: 12px; color: inherit; flex-shrink: 0; font-family: inherit;
}
.toast-action:hover { background: rgba(0,0,0,.08); }

/* ---- Empty state cards ---- */
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  text-align: center; padding: 40px 24px 24px; gap: 8px;
}
.empty-state-icon { font-size: 36px; line-height: 1; }
.empty-state-heading { font-weight: 600; font-size: 14px; color: #0f0f0f; margin: 0; }
.empty-state-body { font-size: 13px; color: #606060; line-height: 1.5; margin: 0; max-width: 240px; }
.empty-state-action {
  margin-top: 6px; padding: 6px 16px;
  background: #cc0000; color: #fff; border-radius: 6px;
  font-size: 13px; cursor: pointer; border: none; font-family: inherit;
}
.empty-state-action:hover { background: #aa0000; }
@media (prefers-color-scheme: dark) {
  .empty-state-heading { color: #e8e8e8; }
  .empty-state-body { color: #aaa; }
}
`

function buildTemplate() {
  return `
    <button class="toggle-btn" aria-label="Toggle Q&A sidebar" title="YouTube Q&A">💬</button>
    <aside class="sidebar" role="complementary" aria-label="YouTube Q&A Chat">
      <header class="sidebar-header">
        <span class="sidebar-title">YouTube Q&amp;A</span>
        <button class="close-btn" aria-label="Close sidebar">✕</button>
      </header>
      <div class="key-banner" hidden role="alert">
        <span>An API key is required to ask questions.</span>
        <button class="key-banner-link">Configure →</button>
      </div>
      <div class="toast" hidden role="alert"></div>
      <div class="message-list" role="log" aria-live="polite" aria-label="Chat messages"></div>
      <footer class="sidebar-footer">
        <textarea
          class="input"
          placeholder="Ask a question about this video…"
          rows="1"
          aria-label="Question"
        ></textarea>
        <div class="action-row">
          <button class="cancel-btn" hidden aria-label="Cancel">Cancel</button>
          <button class="clear-btn" aria-label="Clear conversation">Clear</button>
          <button class="send-btn" disabled aria-label="Send question">Send</button>
        </div>
      </footer>
    </aside>
  `
}

let _idCounter = 0
export function msgId() {
  return `msg-${++_idCounter}`
}

export function createSidebar({ onSend, onClose, onClear, onSeek, onOpenOptions } = {}) {
  const host = document.createElement('div')
  host.id = 'yt-qa-root'

  const shadow = host.attachShadow({ mode: 'open' })

  const styleEl = document.createElement('style')
  styleEl.textContent = CSS

  const wrapper = document.createElement('div')
  wrapper.innerHTML = buildTemplate()

  shadow.appendChild(styleEl)
  shadow.appendChild(wrapper)

  const $ = (sel) => shadow.querySelector(sel)

  const toggleBtn = $('.toggle-btn')
  const sidebarEl = $('.sidebar') // avoid conflict with outer var name
  const closeBtn = $('.close-btn')
  const messageList = $('.message-list')
  const textarea = $('.input')
  const sendBtn = $('.send-btn')
  const clearBtn = $('.clear-btn')
  const cancelBtn = $('.cancel-btn')
  const toastEl = $('.toast')
  const keyBannerEl = $('.key-banner')
  const keyBannerLink = $('.key-banner-link')

  let _open = false
  let _toastTimer = null
  let _loading = false
  let _keyRequired = false
  let loadingEl = null
  let _clearPending = false
  let _clearTimer = null
  let _onCancel = null

  // -- Open / Close --
  function open() {
    _open = true
    host.classList.add('open')
    textarea.focus()
  }

  function close() {
    _open = false
    host.classList.remove('open')
    _resetClearPending()
    onClose?.()
  }

  // -- Clear confirmation (two-tap: first tap → "Sure?", second tap → confirm) --
  function _resetClearPending() {
    clearTimeout(_clearTimer)
    _clearPending = false
    clearBtn.textContent = 'Clear'
    clearBtn.classList.remove('clear-btn--confirm')
    clearBtn.setAttribute('aria-label', 'Clear conversation')
  }

  // -- Loading indicator --
  function setLoading(loading, { text = 'Thinking' } = {}) {
    _loading = loading
    updateSendBtn()
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
  function setCancellable(fn) {
    _onCancel = fn
    cancelBtn.hidden = false
  }

  function clearCancellable() {
    _onCancel = null
    cancelBtn.hidden = true
  }

  // -- Toast banner --
  function showToast({ text, action, onAction, severity = 'error', autoDismissMs } = {}) {
    clearTimeout(_toastTimer)
    toastEl.innerHTML = ''
    toastEl.className = `toast toast--${severity}`
    const msg = document.createElement('span')
    msg.textContent = text ?? ''
    toastEl.appendChild(msg)
    if (action) {
      const btn = document.createElement('button')
      btn.className = 'toast-action'
      btn.textContent = action
      if (onAction) btn.addEventListener('click', onAction)
      toastEl.appendChild(btn)
    }
    toastEl.hidden = false
    const dismiss = autoDismissMs ?? (severity === 'info' ? 3000 : severity === 'warn' ? 5000 : 0)
    if (dismiss > 0) {
      _toastTimer = setTimeout(hideToast, dismiss)
    }
  }

  function hideToast() {
    clearTimeout(_toastTimer)
    toastEl.hidden = true
    toastEl.innerHTML = ''
  }

  // -- Empty state cards (shown in message list when no conversation) --
  const EMPTY_STATE_CONTENT = {
    'no-captions': {
      icon: '🚫',
      heading: 'No captions available',
      body: 'This video has no captions. Try a video with auto-generated captions enabled.',
    },
    'backend-down': {
      icon: '🔌',
      heading: 'Backend is not running',
      body: 'Start your local backend to use YouTube Q&A.',
      action: 'cd backend && make run',
    },
    'key-missing': {
      icon: '🔑',
      heading: 'API key required',
      body: 'Configure your OpenAI API key in the extension options.',
      actionLabel: 'Configure →',
      onAction: () => onOpenOptions?.(),
    },
  }

  function showEmptyState(type) {
    clearEmptyState()
    const spec = EMPTY_STATE_CONTENT[type]
    if (!spec) return
    const div = document.createElement('div')
    div.className = `empty-state empty-state--${type}`
    div.setAttribute('role', 'status')
    if (spec.icon) {
      const icon = document.createElement('div')
      icon.className = 'empty-state-icon'
      icon.textContent = spec.icon
      div.appendChild(icon)
    }
    const heading = document.createElement('p')
    heading.className = 'empty-state-heading'
    heading.textContent = spec.heading
    div.appendChild(heading)
    const body = document.createElement('p')
    body.className = 'empty-state-body'
    body.textContent = spec.body
    div.appendChild(body)
    if (spec.action) {
      const code = document.createElement('code')
      code.style.cssText = 'display:block;margin-top:6px;font-size:12px;color:#606060;'
      code.textContent = spec.action
      div.appendChild(code)
    }
    if (spec.actionLabel) {
      const btn = document.createElement('button')
      btn.className = 'empty-state-action'
      btn.textContent = spec.actionLabel
      btn.addEventListener('click', spec.onAction)
      div.appendChild(btn)
    }
    messageList.appendChild(div)
  }

  function clearEmptyState() {
    messageList.querySelector('.empty-state')?.remove()
  }

  // -- Messages —

  // Regex that identifies bracketed timestamps: [mm:ss] or [hh:mm:ss] in message text.
  const TS_RE = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g

  function _makeSeekLink(raw, sec) {
    const a = document.createElement('a')
    a.className = 'ts-link'
    a.dataset.sec = sec
    a.textContent = raw
    a.setAttribute('role', 'button')
    a.setAttribute('tabindex', '0')
    const handler = () => onSeek?.(sec)
    a.addEventListener('click', handler)
    a.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handler()
    })
    return a
  }

  function _renderText(container, text) {
    TS_RE.lastIndex = 0
    let last = 0
    let m
    while ((m = TS_RE.exec(text)) !== null) {
      if (m.index > last) container.appendChild(document.createTextNode(text.slice(last, m.index)))
      const sec = parseTimestamp(m[1])
      container.appendChild(sec !== null ? _makeSeekLink(m[0], sec) : document.createTextNode(m[0]))
      last = m.index + m[0].length
    }
    if (last < text.length) container.appendChild(document.createTextNode(text.slice(last)))
  }

  function _buildCitationBlock(citations) {
    if (!citations || citations.length === 0) return null
    const details = document.createElement('details')
    details.className = 'citations'
    const summary = document.createElement('summary')
    summary.textContent = `${citations.length} source${citations.length !== 1 ? 's' : ''}`
    details.appendChild(summary)
    const list = document.createElement('ul')
    list.className = 'citation-list'
    for (const c of citations) {
      const li = document.createElement('li')
      li.className = 'citation-item'
      const sec =
        typeof c.start_ts === 'number' ? c.start_ts : parseTimestamp(String(c.start_ts ?? ''))
      if (sec !== null) {
        li.appendChild(_makeSeekLink(`[${formatTimestamp(sec)}]`, sec))
        li.appendChild(document.createTextNode(' '))
      }
      const span = document.createElement('span')
      span.className = 'citation-text'
      span.textContent = c.text ?? ''
      li.appendChild(span)
      list.appendChild(li)
    }
    details.appendChild(list)
    return details
  }

  function _isRichRole(role, refused) {
    return role === 'assistant' || refused
  }

  function addMessage({ id, role, text, refused = false, citations = [] }) {
    clearEmptyState()
    const msgDiv = document.createElement('div')
    const effectiveRole = refused ? 'refusal' : role
    msgDiv.className = `message message--${effectiveRole}`
    msgDiv.dataset.id = id
    msgDiv.dataset.role = role

    const bubble = document.createElement('div')
    bubble.className = 'message-bubble'
    if (_isRichRole(role, refused)) {
      _renderText(bubble, text)
    } else {
      bubble.textContent = text
    }
    msgDiv.appendChild(bubble)

    if (_isRichRole(role, refused)) {
      const cit = _buildCitationBlock(citations)
      if (cit) msgDiv.appendChild(cit)
    }

    messageList.appendChild(msgDiv)
    messageList.scrollTop = messageList.scrollHeight
    return msgDiv
  }

  function addSkeletonMessage(id) {
    const msgDiv = document.createElement('div')
    msgDiv.className = 'message message--skeleton message--assistant'
    msgDiv.dataset.id = id
    const bubble = document.createElement('div')
    bubble.className = 'message-bubble'
    bubble.textContent = '\u00a0'
    msgDiv.appendChild(bubble)
    messageList.appendChild(msgDiv)
    messageList.scrollTop = messageList.scrollHeight
    return msgDiv
  }

  function finalizeMessage(id, { role, text, refused = false, citations = [] }) {
    const el = messageList.querySelector(`[data-id="${id}"]`)
    if (!el) return addMessage({ id, role, text, refused, citations })
    const effectiveRole = refused ? 'refusal' : role
    el.className = `message message--${effectiveRole}`
    el.dataset.role = role
    const bubble = el.querySelector('.message-bubble')
    bubble.innerHTML = ''
    if (_isRichRole(role, refused)) {
      _renderText(bubble, text)
    } else {
      bubble.textContent = text
    }
    el.querySelector('.citations')?.remove()
    if (_isRichRole(role, refused)) {
      const cit = _buildCitationBlock(citations)
      if (cit) el.appendChild(cit)
    }
    return el
  }

  function removeMessage(id) {
    messageList.querySelector(`[data-id="${id}"]`)?.remove()
  }

  function clearMessages() {
    messageList.innerHTML = ''
    loadingEl = null
    onClear?.()
  }

  // -- API key required gate --
  function setApiKeyRequired(required) {
    _keyRequired = !!required
    keyBannerEl.hidden = !_keyRequired
    textarea.disabled = _keyRequired
    updateSendBtn()
  }

  // -- Input --
  function updateSendBtn() {
    sendBtn.disabled = _loading || _keyRequired || textarea.value.trim() === ''
  }

  function autoGrow() {
    textarea.style.height = 'auto'
    const lineH = parseInt(getComputedStyle(textarea).lineHeight) || 20
    textarea.style.height = Math.min(textarea.scrollHeight, lineH * 4) + 'px'
  }

  function clearInput() {
    textarea.value = ''
    textarea.style.height = 'auto'
    updateSendBtn()
  }

  function handleSend() {
    const text = textarea.value.trim()
    if (!text || _loading) return
    clearInput()
    onSend?.(text)
  }

  // -- Event wiring --
  toggleBtn.addEventListener('click', () => (_open ? close() : open()))
  closeBtn.addEventListener('click', close)
  sendBtn.addEventListener('click', handleSend)
  cancelBtn.addEventListener('click', () => { if (_onCancel) _onCancel() })
  keyBannerLink.addEventListener('click', () => onOpenOptions?.())

  clearBtn.addEventListener('click', () => {
    if (!_clearPending) {
      // First tap: enter confirmation state
      _clearPending = true
      clearBtn.textContent = 'Sure?'
      clearBtn.classList.add('clear-btn--confirm')
      clearBtn.setAttribute('aria-label', 'Confirm clear conversation')
      // Auto-reset after 3 s if not confirmed
      _clearTimer = setTimeout(_resetClearPending, 3000)
      return
    }
    // Second tap: confirmed
    _resetClearPending()
    clearMessages()
  })

  textarea.addEventListener('input', () => {
    autoGrow()
    updateSendBtn()
  })

  textarea.addEventListener('keydown', (e) => {
    // Stop all keyboard events from bubbling to YouTube's page
    e.stopPropagation()

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') close()
  })

  // Cmd/Ctrl+L clears input from anywhere inside the wrapper div
  wrapper.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
      e.preventDefault()
      clearInput()
    }
  })

  // Stop ALL keyboard events from propagating to YouTube when sidebar is open
  // This prevents YouTube shortcuts (spacebar, arrow keys, etc.) from triggering
  sidebarEl.addEventListener('keydown', (e) => {
    // Always stop propagation to prevent YouTube shortcuts
    e.stopPropagation()

    if (e.key === 'Escape') close()
  })

  // Fullscreen — hide when browser enters fullscreen
  document.addEventListener('fullscreenchange', () => {
    host.classList.toggle('fullscreen', !!document.fullscreenElement)
  })

  // Theater mode — watch ytd-watch-flexy for the `theater` attribute.
  // We observe body for the element's arrival (SPA), then switch to watching
  // the element itself so we don't fire on every attribute change site-wide.
  function _syncTheater() {
    const flexy = document.querySelector('ytd-watch-flexy')
    host.classList.toggle('theater', flexy?.hasAttribute('theater') ?? false)
  }

  let _flexyObserver = null

  function _attachFlexyObserver() {
    const flexy = document.querySelector('ytd-watch-flexy')
    if (!flexy || _flexyObserver) return
    _flexyObserver = new MutationObserver(_syncTheater)
    _flexyObserver.observe(flexy, { attributes: true, attributeFilter: ['theater'] })
    _syncTheater()
  }

  // Watch for ytd-watch-flexy to be added to the DOM (SPA navigation)
  const _bodyObserver = new MutationObserver(() => {
    _attachFlexyObserver()
    _syncTheater()
  })
  _bodyObserver.observe(document.body, { childList: true, subtree: true })
  _attachFlexyObserver() // attach immediately if already present

  function showToggleButton() {
    toggleBtn.style.display = 'flex'
  }

  function hideToggleButton() {
    toggleBtn.style.display = 'none'
    // Also close the sidebar if it's open when hiding the button
    if (_open) close()
  }

  // Initially hide the toggle button until we check transcript availability
  hideToggleButton()

  return {
    host,
    open,
    close,
    addMessage,
    addSkeletonMessage,
    finalizeMessage,
    removeMessage,
    clearMessages,
    clearInput,
    setLoading,
    setCancellable,
    clearCancellable,
    showToast,
    hideToast,
    showEmptyState,
    clearEmptyState,
    setApiKeyRequired,
    showToggleButton,
    hideToggleButton,
    isOpen: () => _open,
  }
}
