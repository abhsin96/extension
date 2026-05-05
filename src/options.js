/**
 * Options page script — API key management.
 * Sends INGEST-adjacent config messages to the background service worker.
 */

const input = document.getElementById('input-apikey')
const btnSave = document.getElementById('btn-save')
const btnClear = document.getElementById('btn-clear')
const statusEl = document.getElementById('status-msg')
const backendStatusEl = document.getElementById('backend-status')

function showMsg(text, isError = false) {
  statusEl.textContent = text
  statusEl.className = isError ? 'error' : ''
}

function clearMsg() {
  statusEl.textContent = ''
}

async function checkBackendStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'PING_HEALTH' })
    if (response.ok && response.data) {
      const hasKey = response.data.has_api_key
      if (backendStatusEl) {
        backendStatusEl.textContent = hasKey
          ? '✓ Backend is running and has an API key configured'
          : '⚠ Backend is running but no API key is set'
        backendStatusEl.className = hasKey ? 'status-ok' : 'status-warning'
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

// Check backend status on page load
checkBackendStatus()

btnSave?.addEventListener('click', async () => {
  const key = input.value.trim()
  if (!key) {
    showMsg('Please enter an API key.', true)
    return
  }

  btnSave.disabled = true
  clearMsg()

  try {
    const response = await chrome.runtime.sendMessage({ type: 'SET_API_KEY', key })
    if (!response.ok) {
      throw new Error(response.error?.message || 'Failed to save key')
    }
    showMsg('API key saved successfully.')
    input.value = ''
    // Refresh backend status after saving
    setTimeout(checkBackendStatus, 500)
  } catch (err) {
    showMsg(err.message ?? 'Failed to save key. Is the backend running?', true)
  } finally {
    btnSave.disabled = false
  }
})

btnClear?.addEventListener('click', async () => {
  btnClear.disabled = true
  clearMsg()

  try {
    await chrome.runtime.sendMessage({ type: 'CLEAR_API_KEY' })
    showMsg('API key removed.')
  } catch (err) {
    showMsg(err.message ?? 'Failed to remove key.', true)
  } finally {
    btnClear.disabled = false
  }
})
