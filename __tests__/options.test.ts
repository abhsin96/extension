import { afterEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// DOM template
// ---------------------------------------------------------------------------

const OPTIONS_HTML = `
  <div id="backend-status"></div>
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let sendMessage: any

function q(id: string) {
  return document.getElementById(id)
}

function makePingResponse() {
  return { ok: true, data: { status: 'ok' } }
}

function makeChromeMock(sendMessage: any) {
  return {
    runtime: { sendMessage },
    storage: {
      sync: { get: vi.fn((_defaults, cb) => cb({})), set: vi.fn().mockResolvedValue(undefined) },
      onChanged: { addListener: vi.fn() },
    },
  }
}

async function loadOptions(pingResponse = makePingResponse()) {
  vi.resetModules()
  sendMessage = vi.fn().mockResolvedValue(pingResponse)
  vi.stubGlobal('chrome', makeChromeMock(sendMessage))
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
