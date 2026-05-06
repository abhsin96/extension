import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendTurn, clearHistory, getHistory, MAX_HISTORY_TURNS } from '../src/history.js'

// ---------------------------------------------------------------------------
// chrome.storage.local stub
// ---------------------------------------------------------------------------

let _store = {}

const storage = {
  get: vi.fn(async (key) => ({ [key]: _store[key] })),
  set: vi.fn(async (obj) => { Object.assign(_store, obj) }),
  remove: vi.fn(async (key) => { delete _store[key] }),
}

vi.stubGlobal('chrome', { storage: { local: storage } })

beforeEach(() => {
  _store = {}
  storage.get.mockClear()
  storage.set.mockClear()
  storage.remove.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// getHistory
// ---------------------------------------------------------------------------

describe('getHistory', () => {
  it('returns empty array for unknown video', async () => {
    const result = await getHistory('vid-unknown')
    expect(result).toEqual([])
  })

  it('returns stored turns for known video', async () => {
    _store['history:vid1'] = [{ role: 'user', content: 'hi', timestamp: 1 }]
    const result = await getHistory('vid1')
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('hi')
  })
})

// ---------------------------------------------------------------------------
// appendTurn
// ---------------------------------------------------------------------------

describe('appendTurn', () => {
  it('adds a turn with a timestamp', async () => {
    await appendTurn('vid1', { role: 'user', content: 'hello' })
    const turns = await getHistory('vid1')
    expect(turns).toHaveLength(1)
    expect(turns[0].role).toBe('user')
    expect(turns[0].content).toBe('hello')
    expect(typeof turns[0].timestamp).toBe('number')
  })

  it('accumulates multiple turns in order', async () => {
    await appendTurn('vid1', { role: 'user', content: 'q1' })
    await appendTurn('vid1', { role: 'assistant', content: 'a1' })
    await appendTurn('vid1', { role: 'user', content: 'q2' })
    const turns = await getHistory('vid1')
    expect(turns.map((t) => t.content)).toEqual(['q1', 'a1', 'q2'])
  })

  it('does not affect a different video', async () => {
    await appendTurn('vid1', { role: 'user', content: 'for vid1' })
    const vid2 = await getHistory('vid2')
    expect(vid2).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Truncation
// ---------------------------------------------------------------------------

describe('truncation', () => {
  it(`keeps at most MAX_HISTORY_TURNS (${MAX_HISTORY_TURNS}) turns`, async () => {
    for (let i = 0; i < MAX_HISTORY_TURNS + 3; i++) {
      await appendTurn('vid1', { role: 'user', content: `msg-${i}` })
    }
    const turns = await getHistory('vid1')
    expect(turns).toHaveLength(MAX_HISTORY_TURNS)
  })

  it('drops the oldest turns when over the limit', async () => {
    for (let i = 0; i < MAX_HISTORY_TURNS + 2; i++) {
      await appendTurn('vid1', { role: 'user', content: `msg-${i}` })
    }
    const turns = await getHistory('vid1')
    expect(turns[0].content).toBe(`msg-2`)
    expect(turns[turns.length - 1].content).toBe(`msg-${MAX_HISTORY_TURNS + 1}`)
  })
})

// ---------------------------------------------------------------------------
// clearHistory
// ---------------------------------------------------------------------------

describe('clearHistory', () => {
  it('removes history for the specified video', async () => {
    await appendTurn('vid1', { role: 'user', content: 'hello' })
    await clearHistory('vid1')
    const turns = await getHistory('vid1')
    expect(turns).toEqual([])
  })

  it('does not affect other videos', async () => {
    await appendTurn('vid-a', { role: 'user', content: 'A' })
    await appendTurn('vid-b', { role: 'user', content: 'B' })
    await clearHistory('vid-a')
    const bTurns = await getHistory('vid-b')
    expect(bTurns).toHaveLength(1)
    expect(bTurns[0].content).toBe('B')
  })

  it('calling clear on empty video is safe', async () => {
    await expect(clearHistory('nonexistent')).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Isolation across video IDs
// ---------------------------------------------------------------------------

describe('isolation', () => {
  it('videos A and B have independent histories', async () => {
    await appendTurn('vidA', { role: 'user', content: 'from A' })
    await appendTurn('vidB', { role: 'assistant', content: 'from B' })

    const aHistory = await getHistory('vidA')
    const bHistory = await getHistory('vidB')

    expect(aHistory).toHaveLength(1)
    expect(aHistory[0].content).toBe('from A')
    expect(bHistory).toHaveLength(1)
    expect(bHistory[0].content).toBe('from B')
  })

  it('clearing A leaves B intact', async () => {
    await appendTurn('vidA', { role: 'user', content: 'A-q' })
    await appendTurn('vidA', { role: 'assistant', content: 'A-a' })
    await appendTurn('vidB', { role: 'user', content: 'B-q' })

    await clearHistory('vidA')

    expect(await getHistory('vidA')).toEqual([])
    expect(await getHistory('vidB')).toHaveLength(1)
  })
})
