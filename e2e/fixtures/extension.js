/**
 * Playwright test fixture that launches Chromium with the extension loaded.
 *
 * Each test gets a fresh browser context (independent extension state).
 * YouTube watch page requests are intercepted and served from a local stub
 * so tests don't depend on network access to youtube.com.
 *
 * The context fixture initialises chrome.storage.sync with a non-existent
 * backend URL so tests that do NOT start a mock backend naturally see a
 * "backend down" state.  Tests that need a working backend should call
 * setExtensionBackendUrl(page.context(), `http://localhost:${backend.port}`)
 * after starting their mock.
 */

import { test as base, chromium } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXTENSION_PATH = path.resolve(__dirname, '../../dist')

// Port that is never bound by any service — used as the default backend URL so
// every health-check fails unless a test explicitly configures a mock backend.
const NO_BACKEND_URL = 'http://localhost:59876'

// Minimal HTML page that mimics a YouTube watch page.
// Provides a <video> element (for seek tests), #secondary anchor (for sidebar
// mount point), and a helper to fire the yt-navigate-finish SPA event.
const YOUTUBE_STUB_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Test Video - YouTube</title>
</head>
<body>
  <div id="secondary" style="position:fixed;right:400px;top:100px;width:1px;height:1px;"></div>
  <video id="yt-player" muted playsinline style="width:1px;height:1px;position:fixed;bottom:0;right:0;"></video>
</body>
</html>`

/**
 * Point the extension's API client at the given URL by writing to
 * chrome.storage.sync from the extension's service worker context.
 * The extension's onChanged listener picks up the update immediately.
 */
export async function setExtensionBackendUrl(context, url) {
  let [sw] = context.serviceWorkers()
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10_000 })
  await sw.evaluate((u) => chrome.storage.sync.set({ backendUrl: u }), url)
}

export const test = base.extend({
  context: async ({}, use) => {
    // Each test gets its own user-data dir so extension state is fully isolated.
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'))
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // Suppress first-run prompts and crash restoring
        '--no-first-run',
        '--disable-default-apps',
        '--no-default-browser-check',
      ],
    })

    // Abort non-watch YouTube requests first (evaluated LAST due to LIFO).
    await context.route('https://*.youtube.com/**', (route) => route.abort())

    // Intercept YouTube watch navigations and serve the stub (evaluated FIRST
    // because it is registered last — Playwright uses LIFO route matching).
    await context.route('https://www.youtube.com/watch*', (route) =>
      route.fulfill({ contentType: 'text/html', body: YOUTUBE_STUB_HTML }),
    )

    // Default to a non-existent backend so tests with no mock naturally see
    // the "backend down" state without conflicting with any running server.
    await setExtensionBackendUrl(context, NO_BACKEND_URL)

    await use(context)
    await context.close()

    // Clean up temp user-data dir
    fs.rmSync(userDataDir, { recursive: true, force: true })
  },

  page: async ({ context }, use) => {
    const page = await context.newPage()
    await use(page)
    await page.close()
  },
})

export const { expect } = test
