import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { injectSeekBridge, seekVideo, SEEK_MSG_TYPE } from '../src/utils/seek_bridge.js'

// ---------------------------------------------------------------------------
// seekVideo
// ---------------------------------------------------------------------------

describe('seekVideo', () => {
  let postMessageSpy

  beforeEach(() => {
    postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {})
  })

  afterEach(() => {
    postMessageSpy.mockRestore()
  })

  it('calls window.postMessage with the correct type and seconds', () => {
    seekVideo(83)
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: SEEK_MSG_TYPE, sec: 83 },
      '*',
    )
  })

  it('forwards the exact seconds value', () => {
    seekVideo(5025)
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ sec: 5025 }),
      '*',
    )
  })
})

// ---------------------------------------------------------------------------
// injectSeekBridge
// ---------------------------------------------------------------------------

describe('injectSeekBridge', () => {
  const BRIDGE_ID = 'yt-qa-seek-bridge'

  afterEach(() => {
    document.getElementById(BRIDGE_ID)?.remove()
  })

  it('injects a <script> element with the bridge ID', () => {
    injectSeekBridge()
    expect(document.getElementById(BRIDGE_ID)).toBeTruthy()
  })

  it('is idempotent — calling twice does not add a second script', () => {
    injectSeekBridge()
    injectSeekBridge()
    expect(document.querySelectorAll(`#${BRIDGE_ID}`)).toHaveLength(1)
  })

  it('injected script contains the seek message type', () => {
    injectSeekBridge()
    const script = document.getElementById(BRIDGE_ID)
    expect(script.textContent).toContain(SEEK_MSG_TYPE)
  })
})
