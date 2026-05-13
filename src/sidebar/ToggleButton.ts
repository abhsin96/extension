export interface ToggleButtonApi {
  showToggleButton(): void
  hideToggleButton(): void
  isOpen(): boolean
  open(): void
  close(): void
}

interface ToggleButtonDeps {
  toggleBtn: HTMLButtonElement
  sidebarEl: HTMLElement
  host: HTMLElement
  textarea: HTMLTextAreaElement
  onClose?: () => void
  onClearPending?: () => void
}

export function createToggleButton({
  toggleBtn,
  sidebarEl,
  host,
  textarea,
  onClose,
  onClearPending,
}: ToggleButtonDeps): ToggleButtonApi {
  let _open = false

  function open(): void {
    _open = true
    host.classList.add('open')
    textarea.focus()
  }

  function close(): void {
    _open = false
    host.classList.remove('open')
    onClearPending?.()
    onClose?.()
  }

  function showToggleButton(): void {
    toggleBtn.style.display = 'flex'
  }

  function hideToggleButton(): void {
    toggleBtn.style.display = 'none'
    if (_open) close()
  }

  // Event wiring
  toggleBtn.addEventListener('click', () => (_open ? close() : open()))

  // Stop ALL keyboard events from propagating to YouTube when sidebar is open
  sidebarEl.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  })

  // Fullscreen — hide when browser enters fullscreen
  document.addEventListener('fullscreenchange', () => {
    host.classList.toggle('fullscreen', !!document.fullscreenElement)
  })

  // Theater mode — watch ytd-watch-flexy for the `theater` attribute.
  function _syncTheater(): void {
    const flexy = document.querySelector('ytd-watch-flexy')
    host.classList.toggle('theater', flexy?.hasAttribute('theater') ?? false)
  }

  let _flexyObserver: MutationObserver | null = null

  function _attachFlexyObserver(): void {
    const flexy = document.querySelector('ytd-watch-flexy')
    if (!flexy || _flexyObserver) return
    _flexyObserver = new MutationObserver(_syncTheater)
    _flexyObserver.observe(flexy, { attributes: true, attributeFilter: ['theater'] })
    _syncTheater()
  }

  const _bodyObserver = new MutationObserver(() => {
    _attachFlexyObserver()
    _syncTheater()
  })
  _bodyObserver.observe(document.body, { childList: true, subtree: true })
  _attachFlexyObserver()

  // Hide by default
  hideToggleButton()

  return {
    showToggleButton,
    hideToggleButton,
    isOpen: () => _open,
    open,
    close,
  }
}
