import { describe, expect, it } from 'vitest'
import { extractVideoId } from '../src/utils/videoId.js'

describe('extractVideoId', () => {
  it('returns video ID from basic watch URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('ignores &t= timestamp parameter', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=abc123&t=42')).toBe('abc123')
  })

  it('ignores &list= and &index= playlist parameters', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=abc123&list=PLxxx&index=3')).toBe('abc123')
  })

  it('returns null for youtube.com home page', () => {
    expect(extractVideoId('https://www.youtube.com/')).toBeNull()
  })

  it('returns null for /watch with no v param', () => {
    expect(extractVideoId('https://www.youtube.com/watch')).toBeNull()
  })

  it('returns null for YouTube Shorts URL', () => {
    expect(extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBeNull()
  })

  it('returns null for playlist URL', () => {
    expect(extractVideoId('https://www.youtube.com/playlist?list=PLxxx')).toBeNull()
  })

  it('returns null for channel URL', () => {
    expect(extractVideoId('https://www.youtube.com/@SomeChannel')).toBeNull()
  })

  it('extracts v param from any /watch URL (hostname restriction is in manifest matching)', () => {
    expect(extractVideoId('https://example.com/watch?v=abc')).toBe('abc')
  })

  it('returns null for a completely invalid string', () => {
    expect(extractVideoId('not a url')).toBeNull()
  })
})
