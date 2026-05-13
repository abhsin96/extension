export interface EmptyStateApi {
  showEmptyState(type: string): void
  clearEmptyState(): void
}

interface EmptyStateSpec {
  icon?: string
  heading: string
  body: string
  action?: string
  actionLabel?: string
  onAction?: () => void
}

interface EmptyStateDeps {
  messageList: HTMLElement
  onOpenOptions?: () => void
}

export function createEmptyState({ messageList, onOpenOptions }: EmptyStateDeps): EmptyStateApi {
  const EMPTY_STATE_CONTENT: Record<string, EmptyStateSpec> = {
    'no-captions': {
      icon: '🚫',
      heading: 'No captions available',
      body: 'This video has no captions. Try a video with auto-generated captions enabled.',
    },
    'backend-down': {
      icon: '🔌',
      heading: 'Backend is not running',
      body: 'Start your local backend to use YouTube Q&A.',
      action: 'cd backend && make run',
    },
    'key-missing': {
      icon: '🔑',
      heading: 'API key required',
      body: 'Configure your OpenAI API key in the extension options.',
      actionLabel: 'Configure →',
      onAction: () => onOpenOptions?.(),
    },
  }

  function showEmptyState(type: string): void {
    clearEmptyState()
    const spec = EMPTY_STATE_CONTENT[type]
    if (!spec) return
    const div = document.createElement('div')
    div.className = `empty-state empty-state--${type}`
    div.setAttribute('role', 'status')
    if (spec.icon) {
      const icon = document.createElement('div')
      icon.className = 'empty-state-icon'
      icon.textContent = spec.icon
      div.appendChild(icon)
    }
    const heading = document.createElement('p')
    heading.className = 'empty-state-heading'
    heading.textContent = spec.heading
    div.appendChild(heading)
    const body = document.createElement('p')
    body.className = 'empty-state-body'
    body.textContent = spec.body
    div.appendChild(body)
    if (spec.action) {
      const code = document.createElement('code')
      code.style.cssText = 'display:block;margin-top:6px;font-size:12px;color:#606060;'
      code.textContent = spec.action
      div.appendChild(code)
    }
    if (spec.actionLabel) {
      const btn = document.createElement('button')
      btn.className = 'empty-state-action'
      btn.textContent = spec.actionLabel
      if (spec.onAction) btn.addEventListener('click', spec.onAction)
      div.appendChild(btn)
    }
    messageList.appendChild(div)
  }

  function clearEmptyState(): void {
    messageList.querySelector('.empty-state, .welcome-card')?.remove()
  }

  return {
    showEmptyState,
    clearEmptyState,
  }
}
