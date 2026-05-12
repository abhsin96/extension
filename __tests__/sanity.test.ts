import { describe, expect, it } from 'vitest'

describe('sanity', () => {
  it('true is true', () => {
    expect(true).toBe(true)
  })

  it('jsdom is available', () => {
    expect(typeof document).toBe('object')
  })
})
