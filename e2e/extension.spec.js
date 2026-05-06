/**
 * E2E test suite for the YouTube Q&A Chrome extension.
 *
 * Prerequisites:
 *   1. npm run build          — produces dist/ from src/
 *   2. No process on port 8000 — the mock backend binds there
 *
 * Run:  npm run test:e2e
 */

import { test, expect } from './fixtures/extension.js'
import { startMockBackend, REFUSAL_ANSWER } from './fixtures/mock-backend.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIDEO_ID = 'testE2EVideoAbc'
const WATCH_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the sidebar toggle to appear (requires backend up + transcript check
 * to succeed) and click it to open the panel.
 */
async function openSidebar(page) {
  // The toggle is hidden until checkTranscriptAvailability resolves.
  // Allow up to 12 s for the service worker to start and complete the health + ingest calls.
  const toggle = page.locator('[data-testid="sidebar-toggle"]')
  await expect(toggle).toBeVisible({ timeout: 12_000 })
  await toggle.click()
  // Confirm the panel is visible
  const panel = page.locator('[data-testid="sidebar-panel"]')
  await expect(panel).toBeVisible()
}

/**
 * Fill the question input, click Send, and — unless skipWait — wait for an
 * assistant reply to appear in the message list.
 */
async function sendQuestion(page, question, { skipWait = false } = {}) {
  const input = page.locator('[data-testid="question-input"]')
  const sendBtn = page.locator('[data-testid="send-btn"]')
  await input.fill(question)
  await sendBtn.click()
  if (!skipWait) {
    const messageList = page.locator('[data-testid="message-list"]')
    await expect(messageList.locator('.message--assistant').last())
      .toBeVisible({ timeout: 15_000 })
  }
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test.describe('Happy path', () => {
  let backend

  test.beforeEach(async () => {
    backend = await startMockBackend()
  })

  test.afterEach(async () => {
    await backend.close()
  })

  test('asks a question and renders the assistant answer', async ({ page }) => {
    await page.goto(WATCH_URL)
    await openSidebar(page)
    await sendQuestion(page, 'What is this video about?')

    const messageList = page.locator('[data-testid="message-list"]')
    const lastBubble = messageList.locator('.message--assistant .message-bubble').last()
    await expect(lastBubble).toContainText('test video')
  })

  test('renders a timestamp citation link in the assistant response', async ({ page }) => {
    await page.goto(WATCH_URL)
    await openSidebar(page)
    await sendQuestion(page, 'What happens at 30 seconds?')

    const messageList = page.locator('[data-testid="message-list"]')
    const tsLink = messageList.locator('.ts-link').first()
    await expect(tsLink).toBeVisible()
    await expect(tsLink).toContainText('0:30')
  })

  test('clicking a timestamp link fires a seek postMessage', async ({ page }) => {
    await page.goto(WATCH_URL)
    await openSidebar(page)

    // Capture the YT_QA_SEEK postMessage before the timestamp link exists
    await page.evaluate(() => {
      window.__ytqaSeekSec = null
      window.addEventListener('message', (e) => {
        if (e.data?.type === 'YT_QA_SEEK') window.__ytqaSeekSec = e.data.sec
      })
    })

    await sendQuestion(page, 'Explain the key concept at 0:30.')

    const tsLink = page.locator('.ts-link').first()
    await expect(tsLink).toBeVisible()
    await tsLink.click()

    // The seek_bridge_injected.js receives the message and sets video.currentTime.
    // We assert the message was dispatched with the correct second value.
    await expect
      .poll(() => page.evaluate(() => window.__ytqaSeekSec), { timeout: 3_000 })
      .not.toBeNull()

    const seekSec = await page.evaluate(() => window.__ytqaSeekSec)
    expect(seekSec).toBe(30)
  })

  test('send button is disabled while request is in flight then re-enables', async ({ page }) => {
    await page.goto(WATCH_URL)
    await openSidebar(page)

    const input = page.locator('[data-testid="question-input"]')
    const sendBtn = page.locator('[data-testid="send-btn"]')
    const messageList = page.locator('[data-testid="message-list"]')

    // Fill input — button should be enabled
    await input.fill('Test question')
    await expect(sendBtn).toBeEnabled()

    // Click send — button becomes disabled immediately (request in flight)
    await sendBtn.click()
    await expect(sendBtn).toBeDisabled()

    // Wait for the assistant response (loading clears)
    await expect(messageList.locator('.message--assistant')).toBeVisible({ timeout: 15_000 })

    // After response, re-fill so the button can re-enable
    await input.fill('Follow-up question')
    await expect(sendBtn).toBeEnabled({ timeout: 5_000 })
  })

  test('user message appears immediately in the message list', async ({ page }) => {
    await page.goto(WATCH_URL)
    await openSidebar(page)

    const input = page.locator('[data-testid="question-input"]')
    const sendBtn = page.locator('[data-testid="send-btn"]')
    const messageList = page.locator('[data-testid="message-list"]')

    await input.fill('My question here')
    await sendBtn.click()

    // User message should appear synchronously (before any network round-trip)
    const userMsg = messageList.locator('.message--user .message-bubble')
    await expect(userMsg).toBeVisible({ timeout: 2_000 })
    await expect(userMsg).toContainText('My question here')
  })
})

// ---------------------------------------------------------------------------
// Refusal
// ---------------------------------------------------------------------------

test.describe('Refusal', () => {
  let backend

  test.beforeEach(async () => {
    backend = await startMockBackend({ chat: { answer: REFUSAL_ANSWER, sources: [] } })
  })

  test.afterEach(async () => {
    await backend.close()
  })

  test('renders refusal style when model declines an off-topic question', async ({ page }) => {
    await page.goto(WATCH_URL)
    await openSidebar(page)

    const input = page.locator('[data-testid="question-input"]')
    const sendBtn = page.locator('[data-testid="send-btn"]')
    await input.fill("What is the capital of France? (off-topic)")
    await sendBtn.click()

    const messageList = page.locator('[data-testid="message-list"]')
    // Refusal messages are rendered with .message--refusal class
    await expect(messageList.locator('.message--refusal')).toBeVisible({ timeout: 15_000 })
  })

  test('refusal message contains the model response text', async ({ page }) => {
    await page.goto(WATCH_URL)
    await openSidebar(page)

    const input = page.locator('[data-testid="question-input"]')
    const sendBtn = page.locator('[data-testid="send-btn"]')
    await input.fill('Off-topic question')
    await sendBtn.click()

    const messageList = page.locator('[data-testid="message-list"]')
    const refusalBubble = messageList.locator('.message--refusal .message-bubble')
    await expect(refusalBubble).toContainText("isn't available in the video transcript")
  })
})

// ---------------------------------------------------------------------------
// Backend down
// ---------------------------------------------------------------------------

test.describe('Backend down', () => {
  test('shows error toast with retry button when backend becomes unreachable mid-conversation', async ({ page }) => {
    // Phase 1: backend up — navigate, open sidebar, ask first question to
    // prime the session (caches the ingest so the second question skips ingest).
    const backend = await startMockBackend()

    await page.goto(WATCH_URL)
    await openSidebar(page)
    await sendQuestion(page, 'First question to prime the session')

    // Phase 2: kill the backend
    await backend.close()

    // Phase 3: ask another question.  Ingest is cached, so wiring goes
    // straight to ASK_QUESTION → background calls POST /chat → ECONNREFUSED
    // → BACKEND_UNREACHABLE → toast shown.
    const input = page.locator('[data-testid="question-input"]')
    const sendBtn = page.locator('[data-testid="send-btn"]')
    await input.fill('What happens when backend goes down?')
    await sendBtn.click()

    const toast = page.locator('[data-testid="toast"]')
    await expect(toast).toBeVisible({ timeout: 10_000 })
    await expect(toast).toContainText('backend')

    const retryBtn = page.locator('[data-testid="toast-action"]')
    await expect(retryBtn).toBeVisible()
    await expect(retryBtn).toContainText('Retry')
  })

  test('shows backend-down empty state on initial page load when backend is unreachable', async ({ page }) => {
    // No backend started — VIDEO_CHANGED → pingHealth → ECONNREFUSED
    // content_script .catch() calls sidebar.showEmptyState('backend-down')
    // But the toggle is hidden (transcript check also fails), so we verify
    // the empty state is in the DOM even if the sidebar is not yet opened.

    await page.goto(WATCH_URL)

    // Give the content script time to run and handle the failed health check
    // The sidebar host is always injected into the page even when toggle is hidden
    await page.waitForTimeout(3_000)

    const emptyState = page.locator('.empty-state--backend-down')
    await expect(emptyState).toBeAttached({ timeout: 5_000 })
  })
})
