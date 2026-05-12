import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSidebar } from '../src/sidebar.js'

// Silence window.postMessage from seek_bridge.js in tests
vi.spyOn(window, 'postMessage').mockImplementation(() => {})

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let host: any, shadow: any, api: any

function q(sel: string) {
  return shadow.querySelector(sel)
}
function qAll(sel: string) {
  return [...shadow.querySelectorAll(sel)]
}

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

  it('renders message list with initial welcome card', () => {
    expect(q('.message-list')).toBeTruthy()
    expect(q('.welcome-card')).toBeTruthy()
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
    const input = q('.input') as HTMLTextAreaElement
    input.value = 'What is this?'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect((q('.send-btn') as HTMLButtonElement).disabled).toBe(false)
  })

  it('Enter key calls onSend with the question text', () => {
    const onSend = vi.fn()
    const s = createSidebar({ onSend })
    document.body.appendChild(s.host)
    const input = s.host.shadowRoot!.querySelector('.input') as HTMLTextAreaElement
    input.value = 'What happened?'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onSend).toHaveBeenCalledWith('What happened?')
    s.host.remove()
  })

  it('Shift+Enter does not send', () => {
    const onSend = vi.fn()
    const s = createSidebar({ onSend })
    document.body.appendChild(s.host)
    const input = s.host.shadowRoot!.querySelector('.input') as HTMLTextAreaElement
    input.value = 'draft'
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
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
    shadow
      .querySelector('div')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'l', metaKey: true, bubbles: true }))
    expect(q('.input').value).toBe('')
  })

  it('Ctrl+L clears input', () => {
    q('.input').value = 'some text'
    shadow
      .querySelector('div')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, bubbles: true }))
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
    expect(q('.clear-btn-label').textContent).toBe('Sure?')
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
    expect(q('.clear-btn-label').textContent).toBe('Clear')
  })

  it('confirmation state resets after timeout', async () => {
    vi.useFakeTimers()
    q('.clear-btn').click()
    expect(q('.clear-btn-label').textContent).toBe('Sure?')
    vi.advanceTimersByTime(3001)
    expect(q('.clear-btn-label').textContent).toBe('Clear')
    expect(q('.message-list').children.length).toBe(2) // not cleared
    vi.useRealTimers()
  })

  it('close() resets pending confirmation', () => {
    api.open()
    q('.clear-btn').click()
    expect(q('.clear-btn-label').textContent).toBe('Sure?')
    api.close()
    expect(q('.clear-btn-label').textContent).toBe('Clear')
    expect(q('.clear-btn').classList.contains('clear-btn--confirm')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Fullscreen mode
// ---------------------------------------------------------------------------

describe('fullscreen mode', () => {
  it('adds .fullscreen class to host when fullscreenchange fires with element', () => {
    Object.defineProperty(document, 'fullscreenElement', {
      value: document.body,
      configurable: true,
    })
    document.dispatchEvent(new Event('fullscreenchange'))
    expect(host.classList.contains('fullscreen')).toBe(true)
  })

  it('removes .fullscreen class when exiting fullscreen', () => {
    Object.defineProperty(document, 'fullscreenElement', {
      value: document.body,
      configurable: true,
    })
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
  let onSeek: any

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
    const link = q('.ts-link') as HTMLElement
    expect(link).toBeTruthy()
    expect(link.textContent).toBe('[01:23]')
    expect((link as any).dataset.sec).toBe('83')
  })

  it('renders [hh:mm:ss] as a .ts-link anchor', () => {
    api.addMessage({ id: '2', role: 'assistant', text: 'Starts at [01:23:45].' })
    expect((q('.ts-link') as any).dataset.sec).toBe('5025')
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
    let onSeek: any
    host.remove()
    onSeek = vi.fn()
    const s = createSidebar({ onSend: vi.fn(), onSeek })
    document.body.appendChild(s.host)
    s.addMessage({ id: '4', role: 'assistant', text: 'Answer.', citations: [CITATIONS[0]] })
    const tsLinks = [...s.host.shadowRoot!.querySelectorAll('.citation-item .ts-link')]
    expect(tsLinks).toHaveLength(1)
    expect((tsLinks[0] as any).dataset.sec).toBe('83')
    ;(tsLinks[0] as HTMLElement).click()
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

// ---------------------------------------------------------------------------
// Toast severity
// ---------------------------------------------------------------------------

describe('toast severity', () => {
  it('defaults to error severity class', () => {
    api.showToast({ text: 'Oops.' })
    expect(q('.toast').className).toContain('toast--error')
  })

  it('applies warn severity class', () => {
    api.showToast({ text: 'Watch out.', severity: 'warn' })
    expect(q('.toast').className).toContain('toast--warn')
  })

  it('applies info severity class', () => {
    api.showToast({ text: 'FYI.', severity: 'info' })
    expect(q('.toast').className).toContain('toast--info')
  })

  it('auto-dismisses info toast after autoDismissMs', async () => {
    vi.useFakeTimers()
    api.showToast({ text: 'Info.', severity: 'info', autoDismissMs: 100 })
    expect(q('.toast').hidden).toBe(false)
    await vi.runAllTimersAsync()
    expect(q('.toast').hidden).toBe(true)
    vi.useRealTimers()
  })

  it('auto-dismisses warn toast after autoDismissMs', async () => {
    vi.useFakeTimers()
    api.showToast({ text: 'Warn.', severity: 'warn', autoDismissMs: 100 })
    await vi.runAllTimersAsync()
    expect(q('.toast').hidden).toBe(true)
    vi.useRealTimers()
  })

  it('does NOT auto-dismiss error toast', async () => {
    vi.useFakeTimers()
    api.showToast({ text: 'Error.', severity: 'error' })
    await vi.runAllTimersAsync()
    expect(q('.toast').hidden).toBe(false)
    vi.useRealTimers()
  })

  it('replaces previous toast when shown again', () => {
    api.showToast({ text: 'First', severity: 'info' })
    api.showToast({ text: 'Second', severity: 'error' })
    expect(q('.toast').textContent).toContain('Second')
    expect(q('.toast').className).toContain('toast--error')
  })
})

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

describe('empty states', () => {
  it('showEmptyState renders a card in the message list', () => {
    api.showEmptyState('no-captions')
    expect(q('.empty-state')).toBeTruthy()
    expect(q('.message-list').contains(q('.empty-state'))).toBe(true)
  })

  it('no-captions card contains the right heading', () => {
    api.showEmptyState('no-captions')
    expect(q('.empty-state-heading').textContent).toMatch(/caption/i)
  })

  it('backend-down card contains the right heading', () => {
    api.showEmptyState('backend-down')
    expect(q('.empty-state-heading').textContent).toMatch(/backend/i)
  })

  it('key-missing card contains the right heading', () => {
    api.showEmptyState('key-missing')
    expect(q('.empty-state-heading').textContent).toMatch(/api key/i)
  })

  it('key-missing card renders a Configure action button', () => {
    api.showEmptyState('key-missing')
    expect(q('.empty-state-action')).toBeTruthy()
  })

  it('key-missing action button calls onOpenOptions', () => {
    const onOpenOptions = vi.fn()
    const localApi = createSidebar({ onOpenOptions })
    const localShadow = localApi.host.shadowRoot
    document.body.appendChild(localApi.host)
    localApi.showEmptyState('key-missing')
    ;(localShadow!.querySelector('.empty-state-action') as HTMLElement).click()
    expect(onOpenOptions).toHaveBeenCalled()
    localApi.host.remove()
  })

  it('clearEmptyState removes the empty state element', () => {
    api.showEmptyState('no-captions')
    expect(q('.empty-state')).toBeTruthy()
    api.clearEmptyState()
    expect(q('.empty-state')).toBeFalsy()
  })

  it('showEmptyState replaces a previous empty state', () => {
    api.showEmptyState('no-captions')
    api.showEmptyState('backend-down')
    expect(qAll('.empty-state')).toHaveLength(1)
    expect(q('.empty-state-heading').textContent).toMatch(/backend/i)
  })

  it('addMessage clears the empty state', () => {
    api.showEmptyState('backend-down')
    api.addMessage({ id: 'm1', role: 'user', text: 'Hello' })
    expect(q('.empty-state')).toBeFalsy()
  })

  it('unknown type does not render anything', () => {
    api.showEmptyState('does-not-exist')
    expect(q('.empty-state')).toBeFalsy()
  })
})
