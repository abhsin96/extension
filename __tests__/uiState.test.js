import { describe, expect, it, vi } from 'vitest'
import { createStateMachine, STATES } from '../src/uiState.js'

describe('STATES constants', () => {
  it('exports idle, ingesting, asking, error', () => {
    expect(STATES.IDLE).toBe('idle')
    expect(STATES.INGESTING).toBe('ingesting')
    expect(STATES.ASKING).toBe('asking')
    expect(STATES.ERROR).toBe('error')
  })

  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(STATES)).toBe(true)
  })
})

describe('createStateMachine', () => {
  it('starts in idle state', () => {
    const sm = createStateMachine()
    expect(sm.getState()).toBe(STATES.IDLE)
  })

  it('transitions idle → ingesting', () => {
    const sm = createStateMachine()
    const ok = sm.transition(STATES.INGESTING)
    expect(ok).toBe(true)
    expect(sm.getState()).toBe(STATES.INGESTING)
  })

  it('transitions idle → asking', () => {
    const sm = createStateMachine()
    const ok = sm.transition(STATES.ASKING)
    expect(ok).toBe(true)
    expect(sm.getState()).toBe(STATES.ASKING)
  })

  it('transitions idle → error', () => {
    const sm = createStateMachine()
    sm.transition(STATES.ERROR)
    expect(sm.getState()).toBe(STATES.ERROR)
  })

  it('transitions ingesting → asking', () => {
    const sm = createStateMachine()
    sm.transition(STATES.INGESTING)
    sm.transition(STATES.ASKING)
    expect(sm.getState()).toBe(STATES.ASKING)
  })

  it('transitions ingesting → error', () => {
    const sm = createStateMachine()
    sm.transition(STATES.INGESTING)
    sm.transition(STATES.ERROR)
    expect(sm.getState()).toBe(STATES.ERROR)
  })

  it('transitions asking → idle', () => {
    const sm = createStateMachine()
    sm.transition(STATES.ASKING)
    sm.transition(STATES.IDLE)
    expect(sm.getState()).toBe(STATES.IDLE)
  })

  it('transitions asking → error', () => {
    const sm = createStateMachine()
    sm.transition(STATES.ASKING)
    sm.transition(STATES.ERROR)
    expect(sm.getState()).toBe(STATES.ERROR)
  })

  it('transitions error → idle', () => {
    const sm = createStateMachine()
    sm.transition(STATES.ERROR)
    sm.transition(STATES.IDLE)
    expect(sm.getState()).toBe(STATES.IDLE)
  })

  it('transitions error → ingesting', () => {
    const sm = createStateMachine()
    sm.transition(STATES.ERROR)
    sm.transition(STATES.INGESTING)
    expect(sm.getState()).toBe(STATES.INGESTING)
  })
})

describe('invalid transitions', () => {
  it('returns false for invalid transition', () => {
    const sm = createStateMachine()
    sm.transition(STATES.ASKING) // idle → asking
    const ok = sm.transition(STATES.INGESTING) // asking → ingesting is NOT allowed
    expect(ok).toBe(false)
  })

  it('stays in current state after invalid transition', () => {
    const sm = createStateMachine()
    sm.transition(STATES.ASKING)
    sm.transition(STATES.INGESTING) // invalid
    expect(sm.getState()).toBe(STATES.ASKING)
  })
})

describe('onTransition callback', () => {
  it('fires with { from, to, payload } on valid transition', () => {
    const cb = vi.fn()
    const sm = createStateMachine(cb)
    sm.transition(STATES.INGESTING, { videoId: 'v1' })
    expect(cb).toHaveBeenCalledWith({ from: STATES.IDLE, to: STATES.INGESTING, payload: { videoId: 'v1' } })
  })

  it('does NOT fire on invalid transition', () => {
    const cb = vi.fn()
    const sm = createStateMachine(cb)
    sm.transition(STATES.ASKING) // valid (idle → asking)
    cb.mockClear()
    sm.transition(STATES.INGESTING) // invalid (asking → ingesting)
    expect(cb).not.toHaveBeenCalled()
  })

  it('works without a callback (no error)', () => {
    const sm = createStateMachine()
    expect(() => sm.transition(STATES.INGESTING)).not.toThrow()
  })
})
