#!/usr/bin/env node
/**
 * Generates placeholder PNG icons (16, 32, 48, 128 px) for the extension.
 * Uses only Node built-ins — no extra dependencies.
 *
 * Design: red (#CC0000) background with a centred white play triangle.
 * Run once; commit the outputs under public/icons/.
 */

import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'icons')
mkdirSync(OUT_DIR, { recursive: true })

// ---------------------------------------------------------------------------
// PNG helpers
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (const byte of buf) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crcInput = Buffer.concat([typeBytes, data])
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(crcInput))
  return Buffer.concat([len, typeBytes, data, crcBuf])
}

function makePng(size, pixelFn) {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)   // width
  ihdr.writeUInt32BE(size, 4)   // height
  ihdr[8] = 8                   // bit depth
  ihdr[9] = 2                   // color type: RGB
  // bytes 10-12 are compression/filter/interlace = 0

  // Raw scanlines: filter byte (0) + RGB per pixel
  const raw = Buffer.alloc(size * (1 + size * 3))
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0 // filter: None
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelFn(x, y, size)
      const off = y * (1 + size * 3) + 1 + x * 3
      raw[off] = r
      raw[off + 1] = g
      raw[off + 2] = b
    }
  }

  const idat = deflateSync(raw)

  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------
// Icon design: red background + white play triangle
// ---------------------------------------------------------------------------

function iconPixel(x, y, size) {
  const cx = size / 2
  const cy = size / 2
  const pad = Math.max(1, Math.round(size * 0.15))

  // Play triangle vertices (pointing right, vertically centred)
  const tx1 = pad                          // left edge of triangle
  const tx2 = size - pad                   // right tip
  const ty1 = pad                          // top
  const ty2 = size - pad                   // bottom

  // Point-in-triangle test (barycentric)
  const px = x + 0.5
  const py = y + 0.5
  // Triangle: (tx1, ty1), (tx1, ty2), (tx2, cy)
  const d1 = (px - tx1) * (cy - ty1) - (tx2 - tx1) * (py - ty1)
  const d2 = (px - tx2) * (ty2 - cy) - (tx1 - tx2) * (py - cy)
  const d3 = (px - tx1) * (ty2 - ty2) - (tx1 - tx1) * (py - ty2)  // always 0
  const hasNeg = d1 < 0 || d2 < 0
  const hasPos = d1 > 0 || d2 > 0
  const inTriangle = !(hasNeg && hasPos) && d3 === 0 ? true :
    (() => {
      // Simpler: x >= tx1 && x <= tx2 && py between the two slanted edges
      if (px < tx1 || px > tx2) return false
      const progress = (px - tx1) / (tx2 - tx1)
      const halfH = (cy - ty1) * (1 - progress)
      return py >= cy - halfH && py <= cy + halfH
    })()

  return inTriangle ? [255, 255, 255] : [204, 0, 0]
}

// ---------------------------------------------------------------------------
// Generate and write
// ---------------------------------------------------------------------------

for (const size of [16, 32, 48, 128]) {
  const buf = makePng(size, iconPixel)
  const outPath = join(OUT_DIR, `icon${size}.png`)
  writeFileSync(outPath, buf)
  console.log(`wrote ${outPath} (${buf.length} bytes)`)
}
