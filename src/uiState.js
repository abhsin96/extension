/**
 * Hand-rolled UI state machine for the sidebar.
 *
 * States: idle → ingesting → asking → idle
 *                                   → error → idle
 */

export const STATES = Object.freeze({
  IDLE: 'idle',
  INGESTING: 'ingesting',
  ASKING: 'asking',
  ERROR: 'error',
})

const ALLOWED = {
  [STATES.IDLE]: [STATES.INGESTING, STATES.ASKING, STATES.ERROR],
  [STATES.INGESTING]: [STATES.ASKING, STATES.IDLE, STATES.ERROR],
  [STATES.ASKING]: [STATES.IDLE, STATES.ERROR],
  [STATES.ERROR]: [STATES.IDLE, STATES.INGESTING, STATES.ASKING],
}

/**
 * @param {(event: { from: string, to: string, payload: object }) => void} [onTransition]
 * @returns {{ getState: () => string, transition: (next: string, payload?: object) => boolean }}
 */
export function createStateMachine(onTransition) {
  let _state = STATES.IDLE

  return {
    getState() {
      return _state
    },
    transition(next, payload = {}) {
      const allowed = ALLOWED[_state]
      if (!allowed?.includes(next)) {
        console.warn(`[UI State] Invalid transition: ${_state} → ${next}`)
        return false
      }
      const from = _state
      _state = next
      onTransition?.({ from, to: next, payload })
      return true
    },
  }
}
