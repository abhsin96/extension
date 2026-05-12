/**
 * Unit tests for popup.ts refresh() function
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { refresh } from '../src/popup.ts'

// Mock chrome API
const mockSendMessage = vi.fn()
const mockGetElementById = vi.fn()

global.chrome = {
  runtime: {
    sendMessage: mockSendMessage,
  },
  tabs: {
    query: vi.fn(),
  },
}

global.document = {
  getElementById: mockGetElementById,
}

describe('popup refresh()', () => {
  let mockDotBackend, mockValBackend, mockDotApikey, mockValApikey

  beforeEach(() => {
    // Create mock DOM elements
    mockDotBackend = { className: '' }
    mockValBackend = { textContent: '' }
    mockDotApikey = { className: '' }
    mockValApikey = { textContent: '' }

    mockGetElementById.mockImplementation((id) => {
      switch (id) {
        case 'dot-backend':
          return mockDotBackend
        case 'val-backend':
          return mockValBackend
        case 'dot-apikey':
          return mockDotApikey
        case 'val-apikey':
          return mockValApikey
        default:
          return null
      }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should send PING_HEALTH message type', async () => {
    mockSendMessage.mockResolvedValue({
      ok: true,
      data: {
        status: 'healthy',
        version: '1.0.0',
        langsmith_enabled: false,
        has_api_key: true,
      },
    })

    await refresh()

    expect(mockSendMessage).toHaveBeenCalledWith({ type: 'PING_HEALTH' })
  })

  it('should handle happy path with API key configured', async () => {
    mockSendMessage.mockResolvedValue({
      ok: true,
      data: {
        status: 'healthy',
        version: '1.0.0',
        langsmith_enabled: false,
        has_api_key: true,
      },
    })

    await refresh()

    expect(mockDotBackend.className).toBe('dot ok')
    expect(mockValBackend.textContent).toBe('connected')
    expect(mockDotApikey.className).toBe('dot ok')
    expect(mockValApikey.textContent).toBe('configured')
  })

  it('should handle happy path without API key', async () => {
    mockSendMessage.mockResolvedValue({
      ok: true,
      data: {
        status: 'healthy',
        version: '1.0.0',
        langsmith_enabled: false,
        has_api_key: false,
      },
    })

    await refresh()

    expect(mockDotBackend.className).toBe('dot ok')
    expect(mockValBackend.textContent).toBe('connected')
    expect(mockDotApikey.className).toBe('dot warn')
    expect(mockValApikey.textContent).toBe('not set')
  })

  it('should handle backend unreachable path', async () => {
    mockSendMessage.mockResolvedValue({
      ok: false,
      error: {
        code: 'BACKEND_UNREACHABLE',
        message: 'Cannot reach backend',
      },
    })

    await refresh()

    expect(mockDotBackend.className).toBe('dot err')
    expect(mockValBackend.textContent).toBe('unreachable')
    expect(mockDotApikey.className).toBe('dot warn')
    expect(mockValApikey.textContent).toBe('—')
  })

  it('should handle network error gracefully', async () => {
    mockSendMessage.mockRejectedValue(new Error('Network error'))

    // Should throw the error since there's no try-catch in refresh()
    await expect(refresh()).rejects.toThrow('Network error')
  })
})
