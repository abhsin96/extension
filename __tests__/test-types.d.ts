import type { Mock } from 'vitest'
import type { HealthResponse, IngestResponse, AskResponse } from '../src/api/types'

// Extend global fetch to include Vitest mock properties
declare global {
  var fetch: {
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response>
    mock: {
      calls: Array<[RequestInfo | URL, RequestInit?]>
      results: Array<{ type: string; value: any }>
    }
  }
}

// Type for API client mock
export interface MockApiClient {
  pingHealth: Mock<[], Promise<HealthResponse>>
  ingest: Mock<[string, { force?: boolean; stream?: boolean; onProgress?: (step: string, pct: number) => void }?], Promise<IngestResponse>>
  ask: Mock<[string, string, unknown[]?, { k?: number; stream?: boolean; advanced?: boolean; threadId?: string | null }?], Promise<AskResponse>>
}

// Type for message listener
export type MessageListener = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => boolean | void

// Type for sidebar API (partial for tests)
export interface SidebarApi {
  host: HTMLElement
  open: () => void
  close: () => void
  addMessage: Mock
  addSkeletonMessage: Mock
  finalizeMessage: Mock
  removeMessage: Mock
  clearMessages: Mock
  clearInput: Mock
  setLoading: Mock
  setCancellable: Mock
  clearCancellable: Mock
  showToast: Mock
  hideToast: Mock
  setApiKeyRequired: Mock
  clearApiKeyRequired: Mock
  setEmptyState: Mock
  clearEmptyState: Mock
  isOpen: () => boolean
}
