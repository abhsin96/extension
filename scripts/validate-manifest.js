#!/usr/bin/env node
/**
 * Validates dist/manifest.json against Chrome MV3 requirements.
 * Exits non-zero if any required field is missing or has a wrong value.
 * Intended to run in CI after `npm run build`.
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'dist')
const MANIFEST_PATH = join(DIST, 'manifest.json')

let errors = 0

function fail(msg) {
  console.error(`  ✗ ${msg}`)
  errors++
}

function ok(msg) {
  console.log(`  ✓ ${msg}`)
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

if (!existsSync(MANIFEST_PATH)) {
  console.error(`ERROR: ${MANIFEST_PATH} not found — run 'npm run build' first`)
  process.exit(1)
}

let manifest
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
} catch (e) {
  console.error(`ERROR: manifest.json is not valid JSON — ${e.message}`)
  process.exit(1)
}

console.log('Validating dist/manifest.json (Chrome MV3)...\n')

// ---------------------------------------------------------------------------
// Required top-level fields
// ---------------------------------------------------------------------------

if (manifest.manifest_version === 3) {
  ok('manifest_version is 3')
} else {
  fail(`manifest_version must be 3, got ${manifest.manifest_version}`)
}

for (const field of ['name', 'version', 'description']) {
  if (typeof manifest[field] === 'string' && manifest[field].length > 0) {
    ok(`"${field}" present`)
  } else {
    fail(`"${field}" must be a non-empty string`)
  }
}

// ---------------------------------------------------------------------------
// Background service worker
// ---------------------------------------------------------------------------

if (manifest.background?.service_worker) {
  const swPath = join(DIST, manifest.background.service_worker)
  if (existsSync(swPath)) {
    ok(`background.service_worker "${manifest.background.service_worker}" exists in dist`)
  } else {
    fail(`background.service_worker "${manifest.background.service_worker}" not found in dist`)
  }
} else {
  fail('background.service_worker is required for MV3')
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const requiredSizes = ['16', '48', '128']
for (const size of requiredSizes) {
  const iconPath = manifest.icons?.[size]
  if (!iconPath) {
    fail(`icons["${size}"] is missing`)
  } else if (existsSync(join(DIST, iconPath))) {
    ok(`icons["${size}"] → ${iconPath} exists`)
  } else {
    fail(`icons["${size}"] → ${iconPath} not found in dist`)
  }
}

// ---------------------------------------------------------------------------
// Permissions (warn on broad host_permissions)
// ---------------------------------------------------------------------------

const hostPerms = manifest.host_permissions ?? []
const broadPatterns = hostPerms.filter((p) => p === '<all_urls>' || p === '*://*/*')
if (broadPatterns.length > 0) {
  console.warn(`  ⚠ Broad host_permissions detected: ${broadPatterns.join(', ')}`)
} else {
  ok(`host_permissions are scoped (${hostPerms.length} pattern(s))`)
}

// ---------------------------------------------------------------------------
// Content scripts
// ---------------------------------------------------------------------------

const cs = manifest.content_scripts ?? []
for (const [i, script] of cs.entries()) {
  for (const jsFile of script.js ?? []) {
    if (existsSync(join(DIST, jsFile))) {
      ok(`content_scripts[${i}] "${jsFile}" exists`)
    } else {
      fail(`content_scripts[${i}] "${jsFile}" not found in dist`)
    }
  }
}

// ---------------------------------------------------------------------------
// Action popup
// ---------------------------------------------------------------------------

const popupPath = manifest.action?.default_popup
if (popupPath) {
  if (existsSync(join(DIST, popupPath))) {
    ok(`action.default_popup "${popupPath}" exists`)
  } else {
    fail(`action.default_popup "${popupPath}" not found in dist`)
  }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

console.log('')
if (errors > 0) {
  console.error(`Manifest validation FAILED — ${errors} error(s)`)
  process.exit(1)
} else {
  console.log('Manifest validation passed.')
}
