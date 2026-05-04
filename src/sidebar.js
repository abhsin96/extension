/**
 * YouTube Q&A Chat Sidebar.
 * Creates a Shadow DOM-isolated sidebar + floating toggle button.
 *
 * @param {{ onSend?: Function, onClose?: Function, onClear?: Function }} [callbacks]
 * @returns {{ host, open, close, addMessage, clearMessages, clearInput, setLoading, isOpen }}
 */

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
@media (prefers-color-scheme: dark) {
  .clear-btn { background: #3f3f3f; color: #aaa; }
  .clear-btn:hover { background: #4f4f4f; }
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
      <div class="message-list" role="log" aria-live="polite" aria-label="Chat messages"></div>
      <footer class="sidebar-footer">
        <textarea
          class="input"
          placeholder="Ask a question about this video…"
          rows="1"
          aria-label="Question"
        ></textarea>
        <div class="action-row">
          <button class="clear-btn" aria-label="Clear conversation">Clear</button>
          <button class="send-btn" disabled aria-label="Send question">Send</button>
        </div>
      </footer>
    </aside>
  `
}

let _idCounter = 0
export function msgId() { return `msg-${++_idCounter}` }

export function createSidebar({ onSend, onClose, onClear } = {}) {
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
  const sidebarEl = $('.sidebar')  // avoid conflict with outer var name
  const closeBtn = $('.close-btn')
  const messageList = $('.message-list')
  const textarea = $('.input')
  const sendBtn = $('.send-btn')
  const clearBtn = $('.clear-btn')

  let _open = false
  let _loading = false
  let loadingEl = null

  // -- Open / Close --
  function open() {
    _open = true
    host.classList.add('open')
    textarea.focus()
  }

  function close() {
    _open = false
    host.classList.remove('open')
    onClose?.()
  }

  // -- Loading indicator --
  function setLoading(loading) {
    _loading = loading
    updateSendBtn()
    if (loading && !loadingEl) {
      loadingEl = document.createElement('div')
      loadingEl.className = 'loading'
      loadingEl.textContent = 'Thinking'
      messageList.appendChild(loadingEl)
      messageList.scrollTop = messageList.scrollHeight
    } else if (!loading && loadingEl) {
      loadingEl.remove()
      loadingEl = null
    }
  }

  // -- Messages --
  function addMessage({ id, role, text, refused = false }) {
    const msgDiv = document.createElement('div')
    const effectiveRole = refused ? 'refusal' : role
    msgDiv.className = `message message--${effectiveRole}`
    msgDiv.dataset.id = id
    msgDiv.dataset.role = role

    const bubble = document.createElement('div')
    bubble.className = 'message-bubble'
    bubble.textContent = text
    msgDiv.appendChild(bubble)

    messageList.appendChild(msgDiv)
    messageList.scrollTop = messageList.scrollHeight
    return msgDiv
  }

  function clearMessages() {
    messageList.innerHTML = ''
    loadingEl = null
    onClear?.()
  }

  // -- Input --
  function updateSendBtn() {
    sendBtn.disabled = _loading || textarea.value.trim() === ''
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
  clearBtn.addEventListener('click', clearMessages)

  textarea.addEventListener('input', () => { autoGrow(); updateSendBtn() })

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    if (e.key === 'Escape') close()
  })

  // Cmd/Ctrl+L clears input from anywhere inside the wrapper div
  wrapper.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'l') { e.preventDefault(); clearInput() }
  })

  // Esc on sidebar itself (when focus is on a non-textarea element)
  sidebarEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close()
  })

  // Fullscreen — hide when browser enters fullscreen
  document.addEventListener('fullscreenchange', () => {
    host.classList.toggle('fullscreen', !!document.fullscreenElement)
  })

  // Theater mode — YouTube sets `theater` attribute on ytd-watch-flexy
  const theaterObserver = new MutationObserver(() => {
    const flexy = document.querySelector('ytd-watch-flexy')
    host.classList.toggle('theater', flexy?.hasAttribute('theater') ?? false)
  })
  theaterObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['theater'],
    subtree: true,
  })

  return {
    host,
    open,
    close,
    addMessage,
    clearMessages,
    clearInput,
    setLoading,
    isOpen: () => _open,
  }
}
