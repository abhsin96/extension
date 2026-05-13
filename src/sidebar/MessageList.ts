import { parseTimestamp, formatTimestamp } from '../utils/timestamp.js'
import type { DisplayCitation, AddMessageOptions, FinalizeMessageOptions } from './index.js'

export interface MessageListApi {
  addMessage(opts: AddMessageOptions): HTMLElement
  addSkeletonMessage(id: string): HTMLElement
  finalizeMessage(id: string, opts: FinalizeMessageOptions): HTMLElement
  removeMessage(id: string): void
  clearMessages(): void
}

interface MessageListDeps {
  messageList: HTMLElement
  onSeek?: (sec: number) => void
  onClear?: () => void
}

type Token = { type: 'char'; ch: string } | { type: 'link'; el: HTMLAnchorElement }

// Regex that identifies bracketed timestamps: [mm:ss] or [hh:mm:ss] in message text.
const TS_RE = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g

function _isRichRole(role: string, refused: boolean): boolean {
  return role === 'assistant' || refused
}

export function createMessageList({ messageList, onSeek, onClear }: MessageListDeps): MessageListApi {
  let loadingEl: HTMLElement | null = null

  function _makeSeekLink(raw: string, sec: number): HTMLAnchorElement {
    const a = document.createElement('a')
    a.className = 'ts-link'
    a.dataset.sec = String(sec)
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

  function _renderText(container: HTMLElement, text: string): void {
    TS_RE.lastIndex = 0
    let last = 0
    let m: RegExpExecArray | null
    while ((m = TS_RE.exec(text)) !== null) {
      if (m.index > last) container.appendChild(document.createTextNode(text.slice(last, m.index)))
      const sec = parseTimestamp(m[1])
      container.appendChild(sec !== null ? _makeSeekLink(m[0], sec) : document.createTextNode(m[0]))
      last = m.index + m[0].length
    }
    if (last < text.length) container.appendChild(document.createTextNode(text.slice(last)))
  }

  function _buildCitationBlock(citations: DisplayCitation[]): HTMLElement | null {
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

  // Reveal *text* into *bubble* one character at a time, handling timestamp links.
  // Returns a cancel() function. Citations are appended via onComplete().
  function _typewriterReveal(
    bubble: HTMLElement,
    text: string,
    { onComplete, onTick }: { onComplete?: () => void; onTick?: () => void } = {},
  ): () => void {
    TS_RE.lastIndex = 0
    const tokens: Token[] = []
    let last = 0
    let m: RegExpExecArray | null
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
    let currentTextNode: Text | null = null
    let rafId: number

    function tick(): void {
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

  function addMessage({ id, role, text, refused = false, citations = [] }: AddMessageOptions): HTMLElement {
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

  function addSkeletonMessage(id: string): HTMLElement {
    const msgDiv = document.createElement('div')
    msgDiv.className = 'message message--skeleton message--assistant'
    msgDiv.dataset.id = id
    const bubble = document.createElement('div')
    bubble.className = 'message-bubble'
    bubble.textContent = ' '
    msgDiv.appendChild(bubble)
    messageList.appendChild(msgDiv)
    messageList.scrollTop = messageList.scrollHeight
    return msgDiv
  }

  function finalizeMessage(
    id: string,
    { role, text, refused = false, citations = [], animate = false }: FinalizeMessageOptions,
  ): HTMLElement {
    const el = messageList.querySelector<HTMLElement>(`[data-id="${id}"]`)
    if (!el) return addMessage({ id, role, text, refused, citations })
    const effectiveRole = refused ? 'refusal' : role
    el.className = `message message--${effectiveRole}`
    el.dataset.role = role
    const bubble = el.querySelector<HTMLElement>('.message-bubble')!
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

  function removeMessage(id: string): void {
    messageList.querySelector(`[data-id="${id}"]`)?.remove()
  }

  function clearMessages(): void {
    messageList.innerHTML = ''
    loadingEl = null
    onClear?.()
  }

  return {
    addMessage,
    addSkeletonMessage,
    finalizeMessage,
    removeMessage,
    clearMessages,
  }
}
