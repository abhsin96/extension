import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

const isWatch = process.argv.includes('--watch')

// ---------------------------------------------------------------------------
// Clean dist folder before build
// ---------------------------------------------------------------------------

function cleanDist() {
  if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true, force: true })
    console.log('Cleaned dist folder ✓')
  }
}

// ---------------------------------------------------------------------------
// Load .env (if present) — no extra dependencies needed
// ---------------------------------------------------------------------------

function loadEnv(filePath = '.env') {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'))
      .map((line) => {
        const eq = line.indexOf('=')
        return [line.slice(0, eq).trim(), line.slice(eq + 1).trim()]
      }),
  )
}

const env = loadEnv()
const OPENAI_API_KEY = env.OPENAI_API_KEY ?? ''

// Expose as a compile-time constant so the bundle never imports Node APIs.
const define = {
  __OPENAI_API_KEY__: JSON.stringify(OPENAI_API_KEY),
}

if (OPENAI_API_KEY) {
  console.log('Injecting OPENAI_API_KEY from .env ✓')
} else {
  console.warn('Warning: OPENAI_API_KEY not found in .env — key will be empty')
}

const entryPoints = ['src/background.js', 'src/content_script.js', 'src/popup.js', 'src/options.js']

const publicFiles = ['public/manifest.json', 'public/popup.html', 'public/options.html']

function copyPublicFiles() {
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true })
  }
  for (const file of publicFiles) {
    const dest = path.join('dist', path.basename(file))
    fs.copyFileSync(file, dest)
    console.log(`Copied ${file} → ${dest}`)
  }
  // Copy icons directory
  const iconsDir = path.join('public', 'icons')
  if (fs.existsSync(iconsDir)) {
    const destDir = path.join('dist', 'icons')
    fs.mkdirSync(destDir, { recursive: true })
    for (const file of fs.readdirSync(iconsDir)) {
      const src = path.join(iconsDir, file)
      const dest = path.join(destDir, file)
      fs.copyFileSync(src, dest)
    }
    console.log(`Copied public/icons/ → dist/icons/`)
  }
  // Copy seek_bridge_injected.js to dist/src/utils/
  const seekBridgeFile = path.join('src', 'utils', 'seek_bridge_injected.js')
  if (fs.existsSync(seekBridgeFile)) {
    const destDir = path.join('dist', 'src', 'utils')
    fs.mkdirSync(destDir, { recursive: true })
    const dest = path.join(destDir, 'seek_bridge_injected.js')
    fs.copyFileSync(seekBridgeFile, dest)
    console.log(`Copied ${seekBridgeFile} → ${dest}`)
  }
}

const buildOptions = {
  entryPoints,
  outdir: 'dist',
  platform: 'browser',
  target: 'chrome120',
  format: 'esm',
  bundle: true,
  define,
}

// Clean dist folder before building (except in watch mode)
if (!isWatch) {
  cleanDist()
}

if (isWatch) {
  const ctx = await esbuild.context({
    ...buildOptions,
    plugins: [
      {
        name: 'copy-public',
        setup(build) {
          build.onEnd(() => {
            copyPublicFiles()
          })
        },
      },
    ],
  })
  await ctx.watch()
  console.log('Watching for changes...')
} else {
  await esbuild.build(buildOptions)
  copyPublicFiles()
  console.log('Build complete.')
}
