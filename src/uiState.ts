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
} as const)

export type StateValue = (typeof STATES)[keyof typeof STATES]

interface TransitionEvent {
  from: StateValue
  to: StateValue
  payload: Record<string, unknown>
}

export interface StateMachine {
  getState(): StateValue
  transition(next: StateValue, payload?: Record<string, unknown>): boolean
}

const ALLOWED: Record<StateValue, StateValue[]> = {
  [STATES.IDLE]: [STATES.INGESTING, STATES.ASKING, STATES.ERROR],
  [STATES.INGESTING]: [STATES.ASKING, STATES.IDLE, STATES.ERROR],
  [STATES.ASKING]: [STATES.IDLE, STATES.ERROR],
  [STATES.ERROR]: [STATES.IDLE, STATES.INGESTING, STATES.ASKING],
}

export function createStateMachine(
  onTransition?: (event: TransitionEvent) => void,
): StateMachine {
  let _state: StateValue = STATES.IDLE

  return {
    getState() {
      return _state
    },
    transition(next: StateValue, payload: Record<string, unknown> = {}) {
      if (!ALLOWED[_state].includes(next)) {
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
