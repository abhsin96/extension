import { defineConfig } from 'vitest/config'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'

/**
 * Vite resolver that mirrors esbuild's TypeScript extension substitution:
 * when a .js import path has no matching .js file, try .ts instead.
 * Needed during the incremental JS→TS migration so that .js source files
 * can keep their existing `import './api/client.js'` spellings.
 */
function resolveJsToTs() {
  return {
    name: 'resolve-js-to-ts',
    resolveId(id, importer) {
      if (!importer || !id.startsWith('.') || !id.endsWith('.js')) return
      const dir = dirname(importer.split('?')[0])
      const candidate = resolve(dir, id.replace(/\.js$/, '.ts'))
      if (existsSync(candidate)) return candidate
    },
  }
}

export default defineConfig({
  plugins: [resolveJsToTs()],
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
    environment: 'jsdom',
    setupFiles: ['./vitest-setup.ts'],
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
