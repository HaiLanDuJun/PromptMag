/**
 * 生成 build/icon.ico —— 256x256 PNG 内嵌 ICO（Vista+ 通用格式）
 * 设计与托盘图标一致：暗底圆角方块 + 霓虹绿/青高光 + 像素风字母 P
 * 用法: node scripts/make-icon.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const S = 256
const SCALE = 8 // 32px 设计稿 x8

/* ---------- PNG 编码（RGBA 无压缩辅助函数，与 main.cjs 同源） ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)) >>> 0
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function buildPng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------- 绘制 ---------- */
const buf = Buffer.alloc(S * S * 4)
const px = (x, y, r, g, b, a) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return
  const o = (y * S + x) * 4
  buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = a
}

const roundRect = (x0, y0, x1, y1, r, col) => {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cx = Math.min(Math.max(x, x0 + r, x1 - r), Math.max(x, x0 + r))
      const cy = Math.min(Math.max(y, y0 + r, y1 - r), Math.max(y, y0 + r))
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) px(x, y, col[0], col[1], col[2], col[3])
    }
  }
}

// 底：暗色圆角方块
roundRect(0, 0, S - 1, S - 1, 7 * SCALE, [11, 13, 19, 255])
// 顶部霓虹绿高光条
roundRect(0, 0, S - 1, 1 * SCALE, 4, [61, 220, 151, 255])
// 底部青色高光条
roundRect(0, S - 1 - SCALE, S - 1, S - 1, 4, [34, 211, 238, 255])
// 字母 P（5x7 像素字模）
const FONT = [
  '11110',
  '10001',
  '10001',
  '11110',
  '10000',
  '10000',
  '10000'
]
FONT.forEach((row, ry) => {
  row.split('').forEach((c, rx) => {
    if (c !== '1') return
    for (let dy = 0; dy < 3 * SCALE; dy++) {
      for (let dx = 0; dx < 3 * SCALE; dx++) {
        px(9 * SCALE + rx * 3 * SCALE + dx, 6 * SCALE + ry * 3 * SCALE + dy, 61, 220, 151, 255)
      }
    }
  })
})

const png = buildPng(S, S, buf)

/* ---------- 组装 ICO（PNG 内嵌格式） ---------- */
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)     // reserved
header.writeUInt16LE(1, 2)     // type: icon
header.writeUInt16LE(1, 4)     // count

const entry = Buffer.alloc(16)
entry[0] = 0                   // width 256
entry[1] = 0                   // height 256
entry[2] = 0                   // palette
entry[3] = 0
entry.writeUInt16LE(1, 4)      // planes
entry.writeUInt16LE(32, 6)     // bpp
entry.writeUInt32LE(png.length, 8)
entry.writeUInt32LE(22, 12)    // data offset = 6 + 16

const out = path.join(__dirname, '..', 'build')
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([header, entry, png]))
console.log('OK ->', path.join(out, 'icon.ico'), `(${png.length + 22} bytes)`)
