import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// DOM template
// ---------------------------------------------------------------------------

const OPTIONS_HTML = `
  <input id="input-apikey" />
  <button id="btn-save">Save key</button>
  <button id="btn-clear">Remove key</button>
  <div id="status-msg"></div>
  <div id="backend-status"></div>
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let sendMessage

function q(id) { return document.getElementById(id) }

function makePingResponse(hasKey) {
  return { ok: true, data: { status: 'ok', has_api_key: hasKey } }
}

async function loadOptions(pingResponse = makePingResponse(false)) {
  vi.resetModules()
  sendMessage = vi.fn().mockResolvedValue(pingResponse)
  vi.stubGlobal('chrome', { runtime: { sendMessage } })
  document.body.innerHTML = OPTIONS_HTML
  await import('../src/options.js')
  // Let the initial checkBackendStatus() promise settle
  await new Promise((r) => setTimeout(r, 0))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Status badge on page load
// ---------------------------------------------------------------------------

describe('status badge on load', () => {
  it('shows "key configured" style when has_api_key is true', async () => {
    await loadOptions(makePingResponse(true))
    expect(q('backend-status')?.className ?? q('backend-status')?.className).not.toBe(undefined)
    expect(q('backend-status').className).toBe('status-ok')
    expect(q('backend-status').textContent).toContain('API key configured')
  })

  it('shows warning style when has_api_key is false', async () => {
    await loadOptions(makePingResponse(false))
    expect(q('backend-status').className).toBe('status-warning')
  })

  it('shows error style when backend is unreachable', async () => {
    await loadOptions()
    sendMessage = vi.fn().mockRejectedValue(new Error('network'))
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    vi.resetModules()
    document.body.innerHTML = OPTIONS_HTML
    await import('../src/options.js')
    await new Promise((r) => setTimeout(r, 0))
    expect(q('backend-status').className).toBe('status-error')
  })
})

// ---------------------------------------------------------------------------
// Save key
// ---------------------------------------------------------------------------

describe('save key', () => {
  beforeEach(async () => { await loadOptions() })

  it('calls SET_API_KEY with the trimmed key', async () => {
    sendMessage.mockResolvedValue({ ok: true, data: {} })
    q('input-apikey').value = '  sk-test123  '
    q('btn-save').click()
    await new Promise((r) => setTimeout(r, 0))
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_API_KEY', key: 'sk-test123' }),
    )
  })

  it('shows success message after save', async () => {
    sendMessage.mockResolvedValue({ ok: true, data: {} })
    q('input-apikey').value = 'sk-abc'
    q('btn-save').click()
    await new Promise((r) => setTimeout(r, 0))
    expect(q('status-msg').textContent).toContain('saved')
  })

  it('clears the input after successful save', async () => {
    sendMessage.mockResolvedValue({ ok: true, data: {} })
    q('input-apikey').value = 'sk-abc'
    q('btn-save').click()
    await new Promise((r) => setTimeout(r, 0))
    expect(q('input-apikey').value).toBe('')
  })

  it('shows error if input is empty and does NOT call sendMessage', async () => {
    sendMessage.mockClear()
    q('input-apikey').value = '   '
    q('btn-save').click()
    await new Promise((r) => setTimeout(r, 0))
    const setApiKeyCalls = sendMessage.mock.calls.filter(([m]) => m?.type === 'SET_API_KEY')
    expect(setApiKeyCalls).toHaveLength(0)
    expect(q('status-msg').className).toBe('error')
  })

  it('shows error message when backend returns error', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: { message: 'Invalid key format' } })
    q('input-apikey').value = 'bad-key'
    q('btn-save').click()
    await new Promise((r) => setTimeout(r, 0))
    expect(q('status-msg').className).toBe('error')
    expect(q('status-msg').textContent).toContain('Invalid key format')
  })
})

// ---------------------------------------------------------------------------
// Clear key
// ---------------------------------------------------------------------------

describe('clear key', () => {
  beforeEach(async () => { await loadOptions() })

  it('calls CLEAR_API_KEY', async () => {
    sendMessage.mockResolvedValue({ ok: true, data: {} })
    q('btn-clear').click()
    await new Promise((r) => setTimeout(r, 0))
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CLEAR_API_KEY' }),
    )
  })

  it('shows confirmation message after clear', async () => {
    sendMessage.mockResolvedValue({ ok: true, data: {} })
    q('btn-clear').click()
    await new Promise((r) => setTimeout(r, 0))
    expect(q('status-msg').textContent).toContain('removed')
  })

  it('refreshes the status badge after clearing', async () => {
    const clearRes = { ok: true, data: {} }
    const pingRes = makePingResponse(false)
    sendMessage
      .mockResolvedValueOnce(clearRes)  // CLEAR_API_KEY
      .mockResolvedValue(pingRes)       // subsequent PING_HEALTH

    q('btn-clear').click()
    await new Promise((r) => setTimeout(r, 0))
    expect(sendMessage).toHaveBeenCalledWith({ type: 'CLEAR_API_KEY' })
    expect(sendMessage).toHaveBeenCalledWith({ type: 'PING_HEALTH' })
  })
})
