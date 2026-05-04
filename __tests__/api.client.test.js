import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_BASE, chat, health, ingest } from '../src/api/client.js'

function makeFetchMock(body, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', makeFetchMock({ status: 'ok' }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('health()', () => {
  it('calls GET /health', async () => {
    await health()
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/health`, {})
  })
})

describe('ingest()', () => {
  it('calls POST /ingest with correct body', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ task_id: '123' }))
    await ingest('abc123')
    expect(fetch).toHaveBeenCalledOnce()
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe(`${API_BASE}/ingest`)
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ video_id: 'abc123', force: false })
  })

  it('sends force: true when specified', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ task_id: '456' }))
    await ingest('abc123', { force: true })
    const [, opts] = fetch.mock.calls[0]
    expect(JSON.parse(opts.body)).toEqual({ video_id: 'abc123', force: true })
  })
})

describe('chat()', () => {
  it('calls POST /chat/{videoId} with correct body', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ answer: 'hello' }))
    await chat('vid42', 'What is this about?')
    expect(fetch).toHaveBeenCalledOnce()
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe(`${API_BASE}/chat/vid42`)
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ question: 'What is this about?', k: 5 })
  })

  it('sends k: 3 when specified', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ answer: 'hi' }))
    await chat('vid42', 'What is this about?', { k: 3 })
    const [, opts] = fetch.mock.calls[0]
    expect(JSON.parse(opts.body)).toEqual({ question: 'What is this about?', k: 3 })
  })
})

describe('error handling', () => {
  it('throws with detail message from JSON body on non-ok response', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ detail: 'Video not found' }, false, 404))
    await expect(ingest('bad-id')).rejects.toThrow('Video not found')
  })
})
