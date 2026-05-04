import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    __OPENAI_API_KEY__: JSON.stringify(''),
  },
  test: {
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
