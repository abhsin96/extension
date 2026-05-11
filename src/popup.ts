/**
 * Popup script — shows backend reachability, API key status, and current video.
 * Communicates with the background service worker via chrome.runtime.sendMessage.
 */

interface StatusOptions {
  text: string
  state: 'ok' | 'err' | 'warn'
}

function setStatus(dotId: string, valId: string, { text, state }: StatusOptions): void {
  const dot = document.getElementById(dotId)
  const val = document.getElementById(valId)
  if (!dot || !val) return
  dot.className = `dot ${state}`
  val.textContent = text
}

async function refresh(): Promise<void> {
  const res = await chrome.runtime.sendMessage({ type: 'GET_STATUS' })

  if (!res.ok) {
    setStatus('dot-backend', 'val-backend', { text: 'unreachable', state: 'err' })
    setStatus('dot-apikey', 'val-apikey', { text: '—', state: 'warn' })
    return
  }

  setStatus('dot-backend', 'val-backend', { text: 'connected', state: 'ok' })
  setStatus('dot-apikey', 'val-apikey', {
    text: res.data.has_api_key ? 'configured' : 'not set',
    state: res.data.has_api_key ? 'ok' : 'warn',
  })
}

async function loadCurrentVideo(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const url = tab?.url ?? ''
  const videoId = new URL(url.startsWith('http') ? url : 'http://x').searchParams.get('v')

  const dotEl = document.getElementById('dot-video')
  const vidEl = document.getElementById('video-id')
  if (!dotEl || !vidEl) return

  if (videoId) {
    dotEl.className = 'dot ok'
    vidEl.textContent = videoId
  } else {
    dotEl.className = 'dot warn'
    vidEl.textContent = 'Not a YouTube video page'
  }
}

document.getElementById('options-link')?.addEventListener('click', (e) => {
  e.preventDefault()
  chrome.runtime.openOptionsPage()
})

void refresh().catch(console.error)
void loadCurrentVideo().catch(console.error)
