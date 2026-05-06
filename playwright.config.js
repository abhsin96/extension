import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  // Serial execution: all tests share port 8000 for the mock backend
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
