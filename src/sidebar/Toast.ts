export interface ShowToastOptions {
  text?: string
  action?: string
  onAction?: () => void
  severity?: 'error' | 'warn' | 'info'
  autoDismissMs?: number
}

export interface ToastApi {
  showToast(opts?: ShowToastOptions): void
  hideToast(): void
}

interface ToastDeps {
  toastEl: HTMLElement
}

export function createToast({ toastEl }: ToastDeps): ToastApi {
  let _toastTimer: ReturnType<typeof setTimeout> | null = null

  function showToast({
    text,
    action,
    onAction,
    severity = 'error',
    autoDismissMs,
  }: ShowToastOptions = {}): void {
    clearTimeout(_toastTimer ?? undefined)
    toastEl.innerHTML = ''
    toastEl.className = `toast toast--${severity}`
    const msg = document.createElement('span')
    msg.textContent = text ?? ''
    toastEl.appendChild(msg)
    if (action) {
      const btn = document.createElement('button')
      btn.className = 'toast-action'
      btn.setAttribute('data-testid', 'toast-action')
      btn.textContent = action
      if (onAction) btn.addEventListener('click', onAction)
      toastEl.appendChild(btn)
    }
    toastEl.hidden = false
    const dismiss = autoDismissMs ?? (severity === 'info' ? 3000 : severity === 'warn' ? 5000 : 0)
    if (dismiss > 0) {
      _toastTimer = setTimeout(hideToast, dismiss)
    }
  }

  function hideToast(): void {
    clearTimeout(_toastTimer ?? undefined)
    toastEl.hidden = true
    toastEl.innerHTML = ''
  }

  return {
    showToast,
    hideToast,
  }
}
