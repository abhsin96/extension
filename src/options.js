/**
 * Options page script — backend URL management.
 */

import { DEFAULT_API_BASE } from './api/client.js'

const backendStatusEl = document.getElementById('backend-status')

const inputUrl = document.getElementById('input-backend-url')
const btnSaveUrl = document.getElementById('btn-save-url')
const statusUrlEl = document.getElementById('status-url')

async function checkBackendStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'PING_HEALTH' })
    if (response.ok) {
      if (backendStatusEl) {
        backendStatusEl.textContent = '✓ Backend is running'
        backendStatusEl.className = 'status-ok'
      }
      return true
    }
  } catch (err) {
    if (backendStatusEl) {
      backendStatusEl.textContent =
        '✗ Backend is not running (start it with: cd backend && make run)'
      backendStatusEl.className = 'status-error'
    }
    return false
  }
}

// Load stored backend URL on page load
chrome?.storage?.sync?.get({ backendUrl: DEFAULT_API_BASE }, ({ backendUrl }) => {
  if (inputUrl) inputUrl.value = backendUrl
})

// Check backend status on page load
checkBackendStatus()

btnSaveUrl?.addEventListener('click', async () => {
  const url = inputUrl?.value.trim()
  if (!url) {
    statusUrlEl.textContent = 'Please enter a URL.'
    statusUrlEl.className = 'error'
    return
  }

  btnSaveUrl.disabled = true
  statusUrlEl.textContent = ''
  statusUrlEl.className = ''

  try {
    await chrome?.storage?.sync?.set({ backendUrl: url })
    statusUrlEl.textContent = 'Backend URL saved.'
  } catch (err) {
    statusUrlEl.textContent = err.message ?? 'Failed to save URL.'
    statusUrlEl.className = 'error'
  } finally {
    btnSaveUrl.disabled = false
  }
})
