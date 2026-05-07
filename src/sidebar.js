/**
 * ClipConvo Chat Sidebar.
 * Creates a Shadow DOM-isolated sidebar + floating toggle button.
 *
 * @param {{ onSend?: Function, onClose?: Function, onClear?: Function, onSeek?: Function }} [callbacks]
 * @returns {{ host, open, close, addMessage, clearMessages, clearInput, setLoading, isOpen }}
 */

import { parseTimestamp, formatTimestamp } from './utils/timestamp.js'

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');

:host { all: initial; font-family: 'Be Vietnam Pro', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }

/* ---- Toggle button ---- */
.toggle-btn {
  position: fixed; bottom: 24px; right: 24px; z-index: 9001;
  width: 52px; height: 52px; border-radius: 50%;
  background: #2295ed; color: #fff; border: none; cursor: pointer;
  box-shadow: 0 4px 20px rgba(34,149,237,.45); font-size: 22px;
  display: flex; align-items: center; justify-content: center;
  transition: transform .2s, box-shadow .2s;
}
.toggle-btn:hover { transform: scale(1.07); box-shadow: 0 6px 24px rgba(34,149,237,.6); }

/* ---- Popup panel ---- */
.sidebar {
  position: fixed; bottom: 88px; right: 24px;
  width: 360px; max-height: 600px; z-index: 9000;
  display: flex; flex-direction: column;
  transform: scale(0.95) translateY(10px);
  opacity: 0; pointer-events: none;
  transition: transform .2s cubic-bezier(.34,1.56,.64,1), opacity .15s ease;
  transform-origin: bottom right;
  background: #131313; border-radius: 16px;
  border: 1px solid rgba(255,255,255,.08);
  box-shadow: 0 12px 48px rgba(0,0,0,.7), 0 0 0 0.5px rgba(255,255,255,.04);
  overflow: hidden; color: #f0f0f0;
}
:host(.open) .sidebar { transform: scale(1) translateY(0); opacity: 1; pointer-events: auto; }

/* Fullscreen — hide everything */
:host(.fullscreen) .sidebar,
:host(.fullscreen) .toggle-btn { display: none; }

/* Theater mode */
:host(.theater) .sidebar { bottom: 24px; }

/* ---- Header ---- */
.sidebar-header {
  display: flex; align-items: center; padding: 14px 16px 12px;
  border-bottom: 1px solid rgba(255,255,255,.06); flex-shrink: 0;
  background: #1a1a1a;
}
.sidebar-title { font-size: 15px; font-weight: 700; flex: 1; color: #ffffff; letter-spacing: -0.01em; }
.sidebar-title-spark { color: #2295ed; }
.header-actions { display: flex; gap: 2px; }
.header-icon-btn {
  background: none; border: none; cursor: pointer;
  width: 30px; height: 30px; border-radius: 8px;
  color: #6e6e6e; font-size: 15px;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s, color .15s; font-family: inherit;
}
.header-icon-btn:hover { background: rgba(255,255,255,.08); color: #e0e0e0; }
.close-btn {
  background: none; border: none; cursor: pointer;
  width: 30px; height: 30px; border-radius: 8px;
  color: #6e6e6e; font-size: 15px;
  display: flex; align-items: center; justify-content: center;
  transition: background .15s, color .15s; font-family: inherit;
}
.close-btn:hover { background: rgba(255,255,255,.08); color: #e0e0e0; }

/* ---- Message list ---- */
.message-list {
  flex: 1; overflow-y: auto; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 10px;
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.12) transparent;
}
.message-list::-webkit-scrollbar { width: 4px; }
.message-list::-webkit-scrollbar-track { background: transparent; }
.message-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 2px; }

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
  background: #201f1f; color: #f0f0f0; border-bottom-left-radius: 4px;
  border: 1px solid rgba(255,255,255,.06);
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
  padding: 9px 14px; background: #201f1f; border-radius: 12px;
  border-bottom-left-radius: 4px; font-size: 13px; color: #777;
  border: 1px solid rgba(255,255,255,.06);
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
  background: #1a1a1a;
}

/* ---- Quick action chips ---- */
.quick-chips { display: flex; gap: 6px; flex-wrap: wrap; padding-bottom: 2px; }
.chip {
  padding: 5px 11px; border-radius: 20px; font-size: 12px; font-weight: 500;
  cursor: pointer; border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.05); color: #999;
  transition: background .15s, border-color .15s, color .15s; font-family: inherit;
}
.chip:hover { background: rgba(34,149,237,.14); border-color: rgba(34,149,237,.35); color: #7ec8f7; }

/* ---- Textarea ---- */
.input {
  width: 100%; box-sizing: border-box; resize: none;
  border: 1px solid rgba(255,255,255,.1); border-radius: 10px;
  padding: 9px 12px; font-size: 14px; font-family: inherit;
  line-height: 1.5; outline: none;
  background: #0d0d0d; color: #f0f0f0;
  overflow-y: hidden; transition: border-color .15s;
}
.input:focus { border-color: #2295ed; }
.input::placeholder { color: #444; }

/* ---- Action row ---- */
.action-row { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
button {
  padding: 7px 14px; border-radius: 8px; font-size: 13px; font-weight: 500;
  cursor: pointer; border: none; transition: opacity .15s, background .15s;
  font-family: inherit;
}
button:disabled { opacity: .35; cursor: default; }
.send-btn { background: #2295ed; color: #fff; }
.send-btn:not(:disabled):hover { background: #1a7fd0; }
.clear-btn { background: rgba(255,255,255,.06); color: #888; border: 1px solid rgba(255,255,255,.08); }
.clear-btn:hover { background: rgba(255,255,255,.1); color: #bbb; }
.clear-btn--confirm { background: rgba(255,85,64,.1); color: #ff9b8e; border-color: rgba(255,85,64,.3); }
.clear-btn--confirm:hover { background: rgba(255,85,64,.18); }
.cancel-btn { background: rgba(255,255,255,.06); color: #888; border: 1px solid rgba(255,255,255,.08); }
.cancel-btn:hover { background: rgba(255,255,255,.1); color: #bbb; }

/* ---- API key required banner ---- */
.key-banner {
  padding: 10px 16px; background: rgba(255,85,64,.1); color: #ff9b8e;
  border-bottom: 1px solid rgba(255,85,64,.18); font-size: 13px;
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
.key-banner-link {
  margin-left: auto; padding: 3px 10px; background: transparent;
  border: 1px solid rgba(255,85,64,.4); border-radius: 6px; cursor: pointer;
  font-size: 12px; color: #ff9b8e; flex-shrink: 0; font-family: inherit;
  transition: background .15s;
}
.key-banner-link:hover { background: rgba(255,85,64,.12); }

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

/* ---- Skeleton shimmer placeholder ---- */
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

function buildTemplate() {
  return `
    <button class="toggle-btn" aria-label="Toggle ClipConvo" title="ClipConvo" data-testid="sidebar-toggle">💬</button>
    <aside class="sidebar" role="complementary" aria-label="ClipConvo Chat" data-testid="sidebar-panel">
      <header class="sidebar-header">
        <span class="sidebar-title"><span class="sidebar-title-spark">✦</span> ClipConvo</span>
        <div class="header-actions">
          <button class="header-icon-btn history-btn" aria-label="History" title="History">🕐</button>
          <button class="header-icon-btn settings-btn" aria-label="Settings" title="Settings">⚙</button>
          <button class="close-btn" aria-label="Close sidebar" data-testid="close-btn">✕</button>
        </div>
      </header>
      <div class="key-banner" hidden role="alert" data-testid="key-banner">
        <span>🔑 An API key is required to use ClipConvo.</span>
        <button class="key-banner-link">Configure →</button>
      </div>
      <div class="toast" hidden role="alert" data-testid="toast"></div>
      <div class="message-list" role="log" aria-live="polite" aria-label="Chat messages" data-testid="message-list"></div>
      <footer class="sidebar-footer">
        <div class="quick-chips" aria-label="Quick actions">
          <button class="chip" data-chip="summarize">📄 Summarize</button>
          <button class="chip" data-chip="takeaways">🔑 Key Takeaways</button>
          <button class="chip" data-chip="quiz">📱 Quiz Me</button>
        </div>
        <textarea
          class="input"
          placeholder="Ask about this video…"
          rows="1"
          aria-label="Question"
          data-testid="question-input"
        ></textarea>
        <div class="action-row">
          <button class="cancel-btn" hidden aria-label="Cancel" data-testid="cancel-btn">Cancel</button>
          <button class="clear-btn" aria-label="Clear conversation" data-testid="clear-btn">Clear</button>
          <button class="send-btn" disabled aria-label="Send question" data-testid="send-btn">Send ▶</button>
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
  const historyBtn = $('.history-btn')
  const settingsBtn = $('.settings-btn')

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
      btn.setAttribute('data-testid', 'toast-action')
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

  // Reveal *text* into *bubble* one character at a time, handling timestamp links.
  // Returns a cancel() function. Citations are appended via onComplete().
  function _typewriterReveal(bubble, text, { onComplete, onTick } = {}) {
    // Tokenise: interleave plain chars and pre-built link elements.
    TS_RE.lastIndex = 0
    const tokens = []
    let last = 0
    let m
    while ((m = TS_RE.exec(text)) !== null) {
      for (const ch of text.slice(last, m.index)) tokens.push({ type: 'char', ch })
      const sec = parseTimestamp(m[1])
      if (sec !== null) {
        tokens.push({ type: 'link', el: _makeSeekLink(m[0], sec) })
      } else {
        for (const ch of m[0]) tokens.push({ type: 'char', ch })
      }
      last = m.index + m[0].length
    }
    for (const ch of text.slice(last)) tokens.push({ type: 'char', ch })

    // Scale speed so the animation lasts ~1.5 s regardless of length.
    const charsPerFrame = Math.max(2, Math.ceil(tokens.length / 90))

    bubble.classList.add('message-bubble--typing')
    let i = 0
    let cancelled = false
    let currentTextNode = null
    let rafId

    function tick() {
      if (cancelled) return
      for (let b = 0; b < charsPerFrame && i < tokens.length; b++, i++) {
        const t = tokens[i]
        if (t.type === 'char') {
          if (currentTextNode) {
            currentTextNode.nodeValue += t.ch
          } else {
            currentTextNode = document.createTextNode(t.ch)
            bubble.appendChild(currentTextNode)
          }
        } else {
          currentTextNode = null
          bubble.appendChild(t.el)
        }
      }
      onTick?.()
      if (i < tokens.length) {
        rafId = requestAnimationFrame(tick)
      } else {
        bubble.classList.remove('message-bubble--typing')
        onComplete?.()
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      bubble.classList.remove('message-bubble--typing')
    }
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

  function finalizeMessage(id, { role, text, refused = false, citations = [], animate = false }) {
    const el = messageList.querySelector(`[data-id="${id}"]`)
    if (!el) return addMessage({ id, role, text, refused, citations })
    const effectiveRole = refused ? 'refusal' : role
    el.className = `message message--${effectiveRole}`
    el.dataset.role = role
    const bubble = el.querySelector('.message-bubble')
    bubble.innerHTML = ''
    el.querySelector('.citations')?.remove()

    if (animate && _isRichRole(role, refused)) {
      _typewriterReveal(bubble, text, {
        onTick: () => {
          messageList.scrollTop = messageList.scrollHeight
        },
        onComplete: () => {
          const cit = _buildCitationBlock(citations)
          if (cit) el.appendChild(cit)
          messageList.scrollTop = messageList.scrollHeight
        },
      })
    } else {
      if (_isRichRole(role, refused)) {
        _renderText(bubble, text)
      } else {
        bubble.textContent = text
      }
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
  cancelBtn.addEventListener('click', () => {
    if (_onCancel) _onCancel()
  })
  keyBannerLink.addEventListener('click', () => onOpenOptions?.())
  historyBtn.addEventListener('click', () => onOpenOptions?.())
  settingsBtn.addEventListener('click', () => onOpenOptions?.())

  // Quick action chips — populate textarea and send
  const _CHIP_QUESTIONS = {
    summarize: 'Please summarize the key points of this video.',
    takeaways: 'What are the key takeaways from this video?',
    quiz: 'Create a short quiz to test my understanding of this video.',
  }
  shadow.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (_loading || _keyRequired) return
      const q = _CHIP_QUESTIONS[chip.dataset.chip]
      if (!q) return
      textarea.value = q
      autoGrow()
      updateSendBtn()
      handleSend()
    })
  })

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
    e.stopPropagation()

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') close()
  })

  textarea.addEventListener('keyup', (e) => e.stopPropagation())
  textarea.addEventListener('keypress', (e) => e.stopPropagation())

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
