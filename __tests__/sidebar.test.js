import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSidebar, msgId } from '../src/sidebar.js'

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

  it('clear button clears messages', () => {
    api.addMessage({ id: '1', role: 'user', text: 'Q' })
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
