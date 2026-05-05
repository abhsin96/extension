import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSidebar, msgId } from '../src/sidebar.js'

// Silence window.postMessage from seek_bridge.js in tests
vi.spyOn(window, 'postMessage').mockImplementation(() => {})

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let host, shadow, api

function q(sel) { return shadow.querySelector(sel) }
function qAll(sel) { return [...shadow.querySelectorAll(sel)] }

beforeEach(() => {
  api = createSidebar({
    onSend: vi.fn(),
    onClose: vi.fn(),
    onClear: vi.fn(),
  })
  host = api.host
  shadow = host.shadowRoot
  document.body.appendChild(host)
})

afterEach(() => {
  host.remove()
})

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe('structure', () => {
  it('mounts a shadow root', () => {
    expect(host.shadowRoot).toBeTruthy()
  })

  it('renders toggle button', () => {
    expect(q('.toggle-btn')).toBeTruthy()
  })

  it('renders sidebar panel', () => {
    expect(q('.sidebar')).toBeTruthy()
  })

  it('renders empty message list', () => {
    expect(q('.message-list')).toBeTruthy()
    expect(q('.message-list').children.length).toBe(0)
  })

  it('renders textarea and send button', () => {
    expect(q('.input')).toBeTruthy()
    expect(q('.send-btn')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Open / Close
// ---------------------------------------------------------------------------

describe('open / close', () => {
  it('starts closed', () => {
    expect(api.isOpen()).toBe(false)
    expect(host.classList.contains('open')).toBe(false)
  })

  it('open() adds .open class to host', () => {
    api.open()
    expect(host.classList.contains('open')).toBe(true)
    expect(api.isOpen()).toBe(true)
  })

  it('close() removes .open class', () => {
    api.open()
    api.close()
    expect(host.classList.contains('open')).toBe(false)
    expect(api.isOpen()).toBe(false)
  })

  it('close() calls onClose callback', () => {
    const onClose = vi.fn()
    const s = createSidebar({ onClose })
    document.body.appendChild(s.host)
    s.open()
    s.close()
    expect(onClose).toHaveBeenCalledOnce()
    s.host.remove()
  })

  it('toggle button opens sidebar when closed', () => {
    q('.toggle-btn').click()
    expect(api.isOpen()).toBe(true)
  })

  it('close button closes sidebar', () => {
    api.open()
    q('.close-btn').click()
    expect(api.isOpen()).toBe(false)
  })

  it('Esc key closes sidebar', () => {
    api.open()
    q('.input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(api.isOpen()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

describe('addMessage', () => {
  it('appends a user message', () => {
    api.addMessage({ id: '1', role: 'user', text: 'Hello' })
    const msg = q('.message--user')
    expect(msg).toBeTruthy()
    expect(msg.querySelector('.message-bubble').textContent).toBe('Hello')
  })

  it('appends an assistant message', () => {
    api.addMessage({ id: '2', role: 'assistant', text: 'Hi there' })
    expect(q('.message--assistant')).toBeTruthy()
  })

  it('marks refused assistant messages with message--refusal class', () => {
    api.addMessage({ id: '3', role: 'assistant', text: 'Sorry', refused: true })
    expect(q('.message--refusal')).toBeTruthy()
    expect(q('.message--assistant')).toBeFalsy()
  })

  it('appends an error message', () => {
    api.addMessage({ id: '4', role: 'error', text: 'Something went wrong' })
    expect(q('.message--error')).toBeTruthy()
  })

  it('stores data-role on the message element', () => {
    api.addMessage({ id: '5', role: 'user', text: 'test' })
    expect(q('[data-role="user"]')).toBeTruthy()
  })
})

describe('clearMessages', () => {
  it('empties the message list', () => {
    api.addMessage({ id: '1', role: 'user', text: 'Q' })
    api.addMessage({ id: '2', role: 'assistant', text: 'A' })
    api.clearMessages()
    expect(q('.message-list').children.length).toBe(0)
  })

  it('clear button clears messages after two-tap confirmation', () => {
    api.addMessage({ id: '1', role: 'user', text: 'Q' })
    q('.clear-btn').click()
    q('.clear-btn').click()
    expect(q('.message-list').children.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Input / Send
// ---------------------------------------------------------------------------

describe('input', () => {
  it('send button is disabled when input is empty', () => {
    expect(q('.send-btn').disabled).toBe(true)
  })

  it('send button enables when input has text', () => {
    q('.input').value = 'What is this?'
    q('.input').dispatchEvent(new Event('input', { bubbles: true }))
    expect(q('.send-btn').disabled).toBe(false)
  })

  it('Enter key calls onSend with the question text', () => {
    const onSend = vi.fn()
    const s = createSidebar({ onSend })
    document.body.appendChild(s.host)
    s.host.shadowRoot.querySelector('.input').value = 'What happened?'
    s.host.shadowRoot.querySelector('.input').dispatchEvent(new Event('input'))
    s.host.shadowRoot.querySelector('.input').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    )
    expect(onSend).toHaveBeenCalledWith('What happened?')
    s.host.remove()
  })

  it('Shift+Enter does not send', () => {
    const onSend = vi.fn()
    const s = createSidebar({ onSend })
    document.body.appendChild(s.host)
    s.host.shadowRoot.querySelector('.input').value = 'draft'
    s.host.shadowRoot.querySelector('.input').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
    )
    expect(onSend).not.toHaveBeenCalled()
    s.host.remove()
  })

  it('clearInput empties the textarea', () => {
    q('.input').value = 'some text'
    api.clearInput()
    expect(q('.input').value).toBe('')
  })

  it('send button disabled while loading', () => {
    q('.input').value = 'question'
    q('.input').dispatchEvent(new Event('input'))
    api.setLoading(true)
    expect(q('.send-btn').disabled).toBe(true)
  })

  it('setLoading(true) shows loading indicator', () => {
    api.setLoading(true)
    expect(q('.loading')).toBeTruthy()
  })

  it('setLoading(false) removes loading indicator', () => {
    api.setLoading(true)
    api.setLoading(false)
    expect(q('.loading')).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

describe('keyboard shortcuts', () => {
  it('Cmd+L clears input', () => {
    q('.input').value = 'some text'
    shadow.querySelector('div').dispatchEvent(new KeyboardEvent('keydown', { key: 'l', metaKey: true, bubbles: true }))
    expect(q('.input').value).toBe('')
  })

  it('Ctrl+L clears input', () => {
    q('.input').value = 'some text'
    shadow.querySelector('div').dispatchEvent(new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, bubbles: true }))
    expect(q('.input').value).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Clear button — two-tap confirmation
// ---------------------------------------------------------------------------

describe('clear button confirmation', () => {
  beforeEach(() => {
    api.addMessage({ id: '1', role: 'user', text: 'Q' })
    api.addMessage({ id: '2', role: 'assistant', text: 'A' })
  })

  it('first click changes button text to "Sure?"', () => {
    q('.clear-btn').click()
    expect(q('.clear-btn').textContent).toBe('Sure?')
  })

  it('first click does NOT clear messages', () => {
    q('.clear-btn').click()
    expect(q('.message-list').children.length).toBe(2)
  })

  it('first click adds confirm CSS class', () => {
    q('.clear-btn').click()
    expect(q('.clear-btn').classList.contains('clear-btn--confirm')).toBe(true)
  })

  it('second click clears messages', () => {
    q('.clear-btn').click()
    q('.clear-btn').click()
    expect(q('.message-list').children.length).toBe(0)
  })

  it('second click resets button text to "Clear"', () => {
    q('.clear-btn').click()
    q('.clear-btn').click()
    expect(q('.clear-btn').textContent).toBe('Clear')
  })

  it('confirmation state resets after timeout', async () => {
    vi.useFakeTimers()
    q('.clear-btn').click()
    expect(q('.clear-btn').textContent).toBe('Sure?')
    vi.advanceTimersByTime(3001)
    expect(q('.clear-btn').textContent).toBe('Clear')
    expect(q('.message-list').children.length).toBe(2) // not cleared
    vi.useRealTimers()
  })

  it('close() resets pending confirmation', () => {
    api.open()
    q('.clear-btn').click()
    expect(q('.clear-btn').textContent).toBe('Sure?')
    api.close()
    expect(q('.clear-btn').textContent).toBe('Clear')
    expect(q('.clear-btn').classList.contains('clear-btn--confirm')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Fullscreen mode
// ---------------------------------------------------------------------------

describe('fullscreen mode', () => {
  it('adds .fullscreen class to host when fullscreenchange fires with element', () => {
    Object.defineProperty(document, 'fullscreenElement', { value: document.body, configurable: true })
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(host.classList.contains('fullscreen')).toBe(true)
  })

  it('removes .fullscreen class when exiting fullscreen', () => {
    Object.defineProperty(document, 'fullscreenElement', { value: document.body, configurable: true })
    document.dispatchEvent(new Event('fullscreenchange'))

    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(host.classList.contains('fullscreen')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Theater mode
// ---------------------------------------------------------------------------

describe('theater mode', () => {
  function makeFlexy(theater = false) {
    const el = document.createElement('ytd-watch-flexy')
    if (theater) el.setAttribute('theater', '')
    document.body.appendChild(el)
    return el
  }

  afterEach(() => {
    document.querySelector('ytd-watch-flexy')?.remove()
  })

  it('adds .theater class when ytd-watch-flexy has theater attribute', async () => {
    const flexy = makeFlexy(true)
    // Trigger a DOM mutation so the body observer fires
    document.body.appendChild(document.createElement('span'))
    // Allow MutationObserver microtasks to run
    await Promise.resolve()
    expect(host.classList.contains('theater')).toBe(true)
    flexy.remove()
  })

  it('removes .theater class when theater attribute is removed', async () => {
    const flexy = makeFlexy(true)
    document.body.appendChild(document.createElement('span'))
    await Promise.resolve()

    flexy.removeAttribute('theater')
    await Promise.resolve()
    expect(host.classList.contains('theater')).toBe(false)
    flexy.remove()
  })
})

// ---------------------------------------------------------------------------
// Timestamp links in assistant messages
// ---------------------------------------------------------------------------

describe('timestamp links', () => {
  let onSeek

  beforeEach(() => {
    host.remove()
    onSeek = vi.fn()
    api = createSidebar({ onSend: vi.fn(), onClose: vi.fn(), onClear: vi.fn(), onSeek })
    host = api.host
    shadow = host.shadowRoot
    document.body.appendChild(host)
  })

  it('renders [mm:ss] as a .ts-link anchor in assistant messages', () => {
    api.addMessage({ id: '1', role: 'assistant', text: 'See [01:23] for details.' })
    const link = q('.ts-link')
    expect(link).toBeTruthy()
    expect(link.textContent).toBe('[01:23]')
    expect(link.dataset.sec).toBe('83')
  })

  it('renders [hh:mm:ss] as a .ts-link anchor', () => {
    api.addMessage({ id: '2', role: 'assistant', text: 'Starts at [01:23:45].' })
    expect(q('.ts-link').dataset.sec).toBe('5025')
  })

  it('clicking .ts-link calls onSeek with the correct seconds', () => {
    api.addMessage({ id: '3', role: 'assistant', text: 'Check [01:23].' })
    q('.ts-link').click()
    expect(onSeek).toHaveBeenCalledWith(83)
  })

  it('malformed bracketed text is rendered as plain text, not a link', () => {
    api.addMessage({ id: '4', role: 'assistant', text: 'See [abc] for info.' })
    expect(q('.ts-link')).toBeFalsy()
    expect(q('.message-bubble').textContent).toContain('[abc]')
  })

  it('does NOT render timestamps as links in user messages', () => {
    api.addMessage({ id: '5', role: 'user', text: 'What about [01:23]?' })
    expect(q('.ts-link')).toBeFalsy()
  })

  it('renders multiple timestamps in the same message', () => {
    api.addMessage({ id: '6', role: 'assistant', text: '[00:10] intro and [01:23] main part.' })
    const links = qAll('.ts-link')
    expect(links).toHaveLength(2)
    expect(links[0].dataset.sec).toBe('10')
    expect(links[1].dataset.sec).toBe('83')
  })

  it('finalizeMessage renders timestamps when replacing a skeleton', () => {
    api.addSkeletonMessage('sk1')
    api.finalizeMessage('sk1', { role: 'assistant', text: 'See [02:00].' })
    expect(q('.ts-link')).toBeTruthy()
    expect(q('.ts-link').dataset.sec).toBe('120')
  })
})

// ---------------------------------------------------------------------------
// Citation block
// ---------------------------------------------------------------------------

describe('citation block', () => {
  const CITATIONS = [
    { chunk_id: 'c1', start_ts: 83, end_ts: 143, text: 'First excerpt text.' },
    { chunk_id: 'c2', start_ts: 200, end_ts: 260, text: 'Second excerpt text.' },
  ]

  it('renders a <details> citation block for assistant messages with citations', () => {
    api.addMessage({ id: '1', role: 'assistant', text: 'Answer.', citations: CITATIONS })
    expect(q('.citations')).toBeTruthy()
  })

  it('shows the correct source count in the summary', () => {
    api.addMessage({ id: '2', role: 'assistant', text: 'Answer.', citations: CITATIONS })
    expect(q('.citations summary').textContent).toBe('2 sources')
  })

  it('renders one list item per citation', () => {
    api.addMessage({ id: '3', role: 'assistant', text: 'Answer.', citations: CITATIONS })
    expect(qAll('.citation-item')).toHaveLength(2)
  })

  it('renders citation timestamp as a clickable ts-link', () => {
    let onSeek
    host.remove()
    onSeek = vi.fn()
    const s = createSidebar({ onSend: vi.fn(), onSeek })
    document.body.appendChild(s.host)
    s.addMessage({ id: '4', role: 'assistant', text: 'Answer.', citations: [CITATIONS[0]] })
    const tsLinks = [...s.host.shadowRoot.querySelectorAll('.citation-item .ts-link')]
    expect(tsLinks).toHaveLength(1)
    expect(tsLinks[0].dataset.sec).toBe('83')
    tsLinks[0].click()
    expect(onSeek).toHaveBeenCalledWith(83)
    s.host.remove()
  })

  it('does not render citation block when citations array is empty', () => {
    api.addMessage({ id: '5', role: 'assistant', text: 'Answer.', citations: [] })
    expect(q('.citations')).toBeFalsy()
  })

  it('shows "1 source" (singular) for one citation', () => {
    api.addMessage({ id: '6', role: 'assistant', text: 'A.', citations: [CITATIONS[0]] })
    expect(q('.citations summary').textContent).toBe('1 source')
  })

  it('finalizeMessage replaces citations correctly', () => {
    api.addSkeletonMessage('sk1')
    api.finalizeMessage('sk1', { role: 'assistant', text: 'Answer.', citations: CITATIONS })
    expect(qAll('.citation-item')).toHaveLength(2)
  })
})
