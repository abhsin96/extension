import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    environment: 'jsdom',
    testEnvironmentOptions: {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    },
    environmentOptions: {
      jsdom: {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**'],
    },
  },
})
