import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

const isWatch = process.argv.includes('--watch')

const entryPoints = [
  'src/background.js',
  'src/content_script.js',
  'src/popup.js',
  'src/options.js',
]

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
}

const buildOptions = {
  entryPoints,
  outdir: 'dist',
  platform: 'browser',
  target: 'chrome120',
  format: 'esm',
  bundle: true,
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
