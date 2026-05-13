export interface InputAreaApi {
  clearInput(): void
}

interface InputAreaDeps {
  textarea: HTMLTextAreaElement
  sendBtn: HTMLButtonElement
  shadow: ShadowRoot
  onSend?: (text: string) => void
  onClose?: () => void
  loading: () => boolean
  keyRequired: () => boolean
}

export function createInputArea({
  textarea,
  sendBtn,
  shadow,
  onSend,
  onClose,
  loading,
  keyRequired,
}: InputAreaDeps): InputAreaApi {
  function updateSendBtn(): void {
    sendBtn.disabled = loading() || keyRequired() || textarea.value.trim() === ''
  }

  function autoGrow(): void {
    textarea.style.height = 'auto'
    const lineH = parseInt(getComputedStyle(textarea).lineHeight) || 20
    textarea.style.height = Math.min(textarea.scrollHeight, lineH * 4) + 'px'
  }

  function clearInput(): void {
    textarea.value = ''
    textarea.style.height = 'auto'
    updateSendBtn()
  }

  function handleSend(): void {
    const text = textarea.value.trim()
    if (!text || loading()) return
    clearInput()
    onSend?.(text)
  }

  // Event wiring
  sendBtn.addEventListener('click', handleSend)

  textarea.addEventListener('input', () => {
    autoGrow()
    updateSendBtn()
  })

  textarea.addEventListener('keydown', (e) => {
    e.stopPropagation()

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') onClose?.()
  })

  textarea.addEventListener('keyup', (e) => e.stopPropagation())
  textarea.addEventListener('keypress', (e) => e.stopPropagation())

  // Cmd/Ctrl+L clears input from anywhere inside the shadow root
  const wrapper = shadow.querySelector('div')
  if (wrapper) {
    wrapper.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault()
        clearInput()
      }
    })
  }

  return {
    clearInput,
    updateSendBtn,
  } as InputAreaApi & { updateSendBtn: () => void }
}
