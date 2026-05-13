import { afterEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// DOM template
// ---------------------------------------------------------------------------

const OPTIONS_HTML = `
  <div id="backend-status"></div>
  <input id="input-backend-url" type="text" />
  <button id="btn-save-url">Save</button>
  <div id="status-url"></div>
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let sendMessage: any
let permissionsRequest: any

function q(id: string) {
  return document.getElementById(id)
}

function makePingResponse() {
  return { ok: true, data: { status: 'ok' } }
}

function makeChromeMock(sendMessage: any, permissionsRequest?: any) {
  return {
    runtime: { sendMessage },
    storage: {
      sync: { get: vi.fn((_defaults, cb) => cb({})), set: vi.fn().mockResolvedValue(undefined) },
      onChanged: { addListener: vi.fn() },
    },
    permissions: {
      request: permissionsRequest ?? vi.fn().mockResolvedValue(true),
    },
  }
}

async function loadOptions(pingResponse = makePingResponse(), permissionsRequestMock?: any) {
  vi.resetModules()
  sendMessage = vi.fn().mockResolvedValue(pingResponse)
  vi.stubGlobal('chrome', makeChromeMock(sendMessage, permissionsRequestMock))
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
  it('shows ok style when backend is running', async () => {
    await loadOptions(makePingResponse())
    expect(q('backend-status')!.className).toBe('status-ok')
    expect(q('backend-status')!.textContent).toContain('running')
  })

  it('shows error style when backend is unreachable', async () => {
    vi.resetModules()
    sendMessage = vi.fn().mockRejectedValue(new Error('network'))
    vi.stubGlobal('chrome', makeChromeMock(sendMessage))
    document.body.innerHTML = OPTIONS_HTML
    await import('../src/options.js')
    await new Promise((r) => setTimeout(r, 0))
    expect(q('backend-status')!.className).toBe('status-error')
  })
})

// ---------------------------------------------------------------------------
// Backend URL save with permission handling
// ---------------------------------------------------------------------------

describe('backend URL save with permissions', () => {
  it('saves URL when permission is granted', async () => {
    vi.resetModules()
    sendMessage = vi.fn().mockResolvedValue(makePingResponse())
    permissionsRequest = vi.fn().mockResolvedValue(true)
    const chromeMock = makeChromeMock(sendMessage, permissionsRequest)
    vi.stubGlobal('chrome', chromeMock)
    document.body.innerHTML = OPTIONS_HTML
    await import('../src/options.js')
    await new Promise((r) => setTimeout(r, 0))

    const input = q('input-backend-url') as HTMLInputElement
    const btn = q('btn-save-url') as HTMLButtonElement
    const status = q('status-url')

    input.value = 'http://example.com:8080'
    btn.click()
    await new Promise((r) => setTimeout(r, 0))

    expect(permissionsRequest).toHaveBeenCalledWith({
      origins: ['http://example.com:8080/*'],
    })
    expect(chromeMock.storage.sync.set).toHaveBeenCalledWith({
      backendUrl: 'http://example.com:8080',
    })
    expect(status!.textContent).toBe('Backend URL saved.')
  })

  it('shows error when permission is denied', async () => {
    vi.resetModules()
    sendMessage = vi.fn().mockResolvedValue(makePingResponse())
    permissionsRequest = vi.fn().mockResolvedValue(false)
    const chromeMock = makeChromeMock(sendMessage, permissionsRequest)
    vi.stubGlobal('chrome', chromeMock)
    document.body.innerHTML = OPTIONS_HTML
    await import('../src/options.js')
    await new Promise((r) => setTimeout(r, 0))

    const input = q('input-backend-url') as HTMLInputElement
    const btn = q('btn-save-url') as HTMLButtonElement
    const status = q('status-url')

    input.value = 'http://example.com:8080'
    btn.click()
    await new Promise((r) => setTimeout(r, 0))

    expect(permissionsRequest).toHaveBeenCalledWith({
      origins: ['http://example.com:8080/*'],
    })
    expect(chromeMock.storage.sync.set).not.toHaveBeenCalled()
    expect(status!.textContent).toBe('Permission denied — Chrome blocked access to that URL.')
    expect(status!.className).toBe('error')
  })
})
