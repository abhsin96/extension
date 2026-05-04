# YouTube Q&A — Chrome Extension

Ask questions about any YouTube video using AI. Requires the companion FastAPI backend running on `localhost:8000`.

## Development setup

```bash
npm install
npm test          # unit tests
npm run build     # bundle → dist/
npm run lint:ext  # validate manifest against Chrome MV3 requirements
```

### Watch mode (rebuilds on save)

```bash
npm run build:watch
```

---

## Manual verification in Chrome

### 1. Build the extension

```bash
npm run build
```

Confirm `dist/` contains:

```
dist/
  manifest.json
  background.js
  content_script.js
  popup.js
  popup.html
  options.js
  options.html
  icons/
    icon16.png
    icon32.png
    icon48.png
    icon128.png
```

### 2. Load unpacked in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked**
4. Select the `dist/` directory

**Expected result:**
- Extension appears in the list with name **"YouTube Q&A"** and version **0.1.0**
- The red icon appears in the Chrome toolbar (pin it if needed)
- No errors shown in the extension card (the "Errors" button should be absent or show 0)

### 3. Verify the icon

- The toolbar icon should be a red square with a white play triangle
- 16 × 16 px in toolbar; 128 × 128 in `chrome://extensions` detail

### 4. Verify content script injection

1. Navigate to any YouTube **watch** page (e.g. `youtube.com/watch?v=…`)
2. Open **DevTools → Console** (F12)
3. Confirm the sentinel log appears:
   ```
   [YouTube Q&A] content script active {videoId: "…"}
   ```
4. Navigate to the YouTube **home page** (`youtube.com`)
5. Confirm the log does **not** appear (content script is watch-only)

### 5. Verify the popup

1. Click the extension icon in the toolbar
2. The popup should open and show:
   - **Backend** status (red dot = unreachable if server isn't running)
   - **API key** status
   - **Current video** (the video ID if on a watch page, otherwise "Not a YouTube video page")
3. The **Options** link at the bottom should open the options page

### 6. Verify the options page

1. Click **Options** from the popup, or right-click the toolbar icon → **Options**
2. The page should show an API key input field with Save and Remove buttons
3. The About section explains the local-only data flow

### 7. Verify background service worker

1. On `chrome://extensions`, click **Service Worker** (or **background page**) next to the extension
2. DevTools opens for the background context
3. In the Console, send a test message:
   ```js
   chrome.runtime.sendMessage({ type: 'GET_STATUS' }, console.log)
   ```
4. If the backend is running: `{ ok: true, data: { has_api_key: … } }`
5. If the backend is down: `{ ok: false, error: { code: 'BACKEND_UNREACHABLE', … } }`

---

## Regenerate icons

```bash
npm run generate-icons
```

This rewrites `public/icons/icon{16,32,48,128}.png` using only Node built-ins.

## Scripts reference

| Script | Description |
|---|---|
| `npm test` | Run unit tests (Vitest) |
| `npm run build` | Bundle source → `dist/` |
| `npm run build:watch` | Rebuild on file change |
| `npm run lint` | ESLint source files |
| `npm run lint:ext` | Validate `dist/manifest.json` against Chrome MV3 schema |
| `npm run format` | Prettier format |
| `npm run coverage` | Test coverage report |
| `npm run generate-icons` | Regenerate placeholder PNG icons |
