import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const size = 256
const scale = 4
const rgba = Buffer.alloc(size * size * 4)
const insideRoundRect = (x, y, left, top, right, bottom, radius) => {
  const cx = Math.max(left + radius, Math.min(right - radius, x))
  const cy = Math.max(top + radius, Math.min(bottom - radius, y))
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
}
const segmentDistance = (x, y, x1, y1, x2, y2) => {
  const dx = x2 - x1
  const dy = y2 - y1
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

for (let py = 0; py < size; py += 1) {
  for (let px = 0; px < size; px += 1) {
    let bg = 0; let mint = 0; let center = 0; let opaque = 0
    for (let sy = 0; sy < scale; sy += 1) {
      for (let sx = 0; sx < scale; sx += 1) {
        const x = px + (sx + 0.5) / scale
        const y = py + (sy + 0.5) / scale
        if (!insideRoundRect(x, y, 8, 8, 248, 248, 52)) continue
        opaque += 1
        bg += 1
        const handle = [[67, 76], [67, 180]].some(([cx, cy]) => {
          const distance = Math.hypot(x - cx, y - cy)
          return distance >= 18.5 && distance <= 31.5
        })
        const blade = segmentDistance(x, y, 88, 89, 119, 121) <= 6.5
          || segmentDistance(x, y, 119, 121, 204, 58) <= 6.5
          || segmentDistance(x, y, 88, 167, 119, 135) <= 6.5
          || segmentDistance(x, y, 119, 135, 204, 198) <= 6.5
        if (handle || blade) mint += 1
        if (Math.hypot(x - 119, y - 128) <= 10) center += 1
      }
    }
    const i = (py * size + px) * 4
    const alpha = opaque / (scale * scale)
    const mark = mint / (scale * scale)
    const joint = center / (scale * scale)
    const color = joint > 0 ? [215, 245, 222] : mark > 0 ? [131, 214, 154] : [17, 18, 20]
    rgba[i] = color[2]
    rgba[i + 1] = color[1]
    rgba[i + 2] = color[0]
    rgba[i + 3] = Math.round(Math.max(alpha, mark, joint) * 255)
  }
}

const xor = Buffer.alloc(size * size * 4)
for (let y = 0; y < size; y += 1) {
  rgba.copy(xor, (size - y - 1) * size * 4, y * size * 4, (y + 1) * size * 4)
}
const maskStride = Math.ceil(size / 32) * 4
const mask = Buffer.alloc(maskStride * size)
for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    if (rgba[(y * size + x) * 4 + 3] === 0) {
      const offset = (size - y - 1) * maskStride + Math.floor(x / 8)
      mask[offset] |= 0x80 >> (x % 8)
    }
  }
}
const dib = Buffer.alloc(40)
dib.writeUInt32LE(40, 0)
dib.writeInt32LE(size, 4)
dib.writeInt32LE(size * 2, 8)
dib.writeUInt16LE(1, 12)
dib.writeUInt16LE(32, 14)
dib.writeUInt32LE(0, 16)
dib.writeUInt32LE(xor.length + mask.length, 20)
const image = Buffer.concat([dib, xor, mask])
const header = Buffer.alloc(22)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
header.writeUInt8(0, 6)
header.writeUInt8(0, 7)
header.writeUInt8(0, 8)
header.writeUInt8(0, 9)
header.writeUInt16LE(1, 10)
header.writeUInt16LE(32, 12)
header.writeUInt32LE(image.length, 14)
header.writeUInt32LE(header.length, 18)

const output = path.join(root, 'build', 'live-cutter.ico')
await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, Buffer.concat([header, image]))
console.log(`Wrote ${output} (${size}x${size}, 32-bit RGBA)`)
