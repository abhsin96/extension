import { vi } from 'vitest'
import type { Mock } from 'vitest'

// Extend global fetch to include mock property
declare global {
  var fetch: {
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response>
    mock: {
      calls: Array<[RequestInfo | URL, RequestInit?]>
      results: Array<{ type: string; value: any }>
    }
  }
}

// Extend chrome types for tests
declare global {
  namespace chrome {
    namespace runtime {
      const onInstalled: { addListener: Mock }
      const onStartup: { addListener: Mock }
      const onMessage: { addListener: Mock }
      function sendMessage(message: any): Promise<any>
    }
    namespace storage {
      namespace session {
        function get(keys?: string | string[] | null): Promise<Record<string, any>>
        function set(items: Record<string, any>): Promise<void>
      }
    }
    namespace tabs {
      function query(queryInfo: any): Promise<any[]>
    }
  }
}

export {}
