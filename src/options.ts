/**
 * Options page script — backend URL management.
 */

import { DEFAULT_API_BASE } from './api/client.js'

const backendStatusEl = document.getElementById('backend-status')
const inputUrl = document.getElementById('input-backend-url') as HTMLInputElement | null
const btnSaveUrl = document.getElementById('btn-save-url') as HTMLButtonElement | null
const statusUrlEl = document.getElementById('status-url')

async function checkBackendStatus(): Promise<boolean> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'PING_HEALTH' })
    if (response.ok) {
      if (backendStatusEl) {
        backendStatusEl.textContent = '✓ Backend is running'
        backendStatusEl.className = 'status-ok'
      }
      return true
    }
  } catch {
    if (backendStatusEl) {
      backendStatusEl.textContent =
        '✗ Backend is not running (start it with: cd backend && make run)'
      backendStatusEl.className = 'status-error'
    }
  }
  return false
}

// Load stored backend URL on page load
chrome.storage.sync.get({ backendUrl: DEFAULT_API_BASE }, ({ backendUrl }) => {
  if (inputUrl) inputUrl.value = backendUrl as string
})

// Check backend status on page load
void checkBackendStatus()

btnSaveUrl?.addEventListener('click', async () => {
  const url = inputUrl?.value.trim()
  if (!url) {
    if (statusUrlEl) {
      statusUrlEl.textContent = 'Please enter a URL.'
      statusUrlEl.className = 'error'
    }
    return
  }

  btnSaveUrl.disabled = true
  if (statusUrlEl) {
    statusUrlEl.textContent = ''
    statusUrlEl.className = ''
  }

  try {
    // Request permission for the new backend URL
    const granted = await chrome.permissions.request({
      origins: [url + '/*'],
    })

    if (!granted) {
      if (statusUrlEl) {
        statusUrlEl.textContent = 'Permission denied — Chrome blocked access to that URL.'
        statusUrlEl.className = 'error'
      }
      return
    }

    // Only save if permission was granted
    await chrome.storage.sync.set({ backendUrl: url })
    if (statusUrlEl) statusUrlEl.textContent = 'Backend URL saved.'
  } catch (err) {
    if (statusUrlEl) {
      statusUrlEl.textContent = (err as Error).message ?? 'Failed to save URL.'
      statusUrlEl.className = 'error'
    }
  } finally {
    btnSaveUrl.disabled = false
  }
})
