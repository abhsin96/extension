import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    // mirrors the esbuild define in build.js — empty string in tests
    __OPENAI_API_KEY__: JSON.stringify(''),
  },
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**'],
    },
  },
})
