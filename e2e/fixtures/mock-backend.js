/**
 * Minimal HTTP server that stands in for the Python backend on port 8000.
 * The extension's service worker fetches directly to http://localhost:8000,
 * so we need a real TCP listener — page.route() can't intercept SW fetches.
 *
 * Usage:
 *   const backend = await startMockBackend()          // default responses
 *   const backend = await startMockBackend({ chat })  // override one handler
 *   await backend.close()
 */

import http from 'node:http'

const PORT = 8000

export const REFUSAL_ANSWER =
  "I'm sorry, but the answer to your question isn't available in the video transcript."

const DEFAULTS = {
  health: { status: 'ok', has_api_key: true },
  ingest: { status: 'done', chunk_count: 5, cached: false },
  chat: {
    answer: 'This is a test video about automated testing. The key concept is explained at [0:30].',
    sources: [
      { chunk_id: 'c1', start_ts: 30, end_ts: 60, text: 'Automated testing concepts at 0:30.' },
    ],
  },
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
  })
}

export function startMockBackend(overrides = {}) {
  const responses = { ...DEFAULTS, ...overrides }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = req.url.split('?')[0]

    if (req.method === 'GET' && url === '/health') {
      res.writeHead(200)
      res.end(JSON.stringify(responses.health))
    } else if (req.method === 'POST' && url === '/ingest') {
      res.writeHead(200)
      res.end(JSON.stringify(responses.ingest))
    } else if (req.method === 'POST' && url.startsWith('/chat/')) {
      res.writeHead(200)
      res.end(JSON.stringify(responses.chat))
    } else if ((req.method === 'PUT' || req.method === 'DELETE') && url === '/config/api-key') {
      res.writeHead(204)
      res.end()
    } else {
      res.writeHead(404)
      res.end(JSON.stringify({ error: 'not found', url }))
    }
  })

  // Track open connections so we can destroy them forcefully on close.
  // Node's server.close() stops accepting new connections but waits for
  // existing keep-alive connections to drain — which hangs tests.
  const _connections = new Set()
  server.on('connection', (sock) => {
    _connections.add(sock)
    sock.on('close', () => _connections.delete(sock))
  })

  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${PORT} is already in use.\n` +
          'Stop any running backend server before running E2E tests:\n' +
          '  cd backend && make stop  (or kill the process listening on port 8000)'
        ))
      } else {
        reject(err)
      }
    })
    server.listen(PORT, '127.0.0.1', () => {
      resolve({
        close: () => {
          for (const sock of _connections) sock.destroy()
          return new Promise((r, e) => server.close((err) => (err ? e(err) : r())))
        },
      })
    })
  })
}
