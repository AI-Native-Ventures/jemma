// Placeholder sample files. The real photos of the 5 papers and the memo arrive later: upload them to
// the same paths in the `sample-papers` bucket (or change the paths here). Placeholders are only
// written when the path is empty, so real files are never overwritten.
import type { JemmaDb } from '../../../packages/profiling/src/db'

export const SAMPLE_FILES = {
  bucket: 'sample-papers',
  papers: {
    amina: 'class-test-1/amina.png',
    thabo: 'class-test-1/thabo.png',
    lerato: 'class-test-1/lerato.png',
    sipho: 'class-test-1/sipho.png',
    naledi: 'class-test-1/naledi.png',
  },
  memo: 'class-test-1/memo.png',
  curriculum: 'curriculum/grade-6-teaching-plan.pdf',
} as const

const W = 600
const H = 800
const ROW_TOP = 100
const ROW_STEP = 66
const BOX_X = 300
const BOX_W = 270
const BOX_H = 52

/** Where question `n`'s answer sits on a placeholder sheet, as fractions of the page (0 to 1). */
export function answerCrop(n: number): { x: number; y: number; w: number; h: number } {
  return { x: BOX_X / W, y: (ROW_TOP + (n - 1) * ROW_STEP) / H, w: BOX_W / W, h: BOX_H / H }
}

const GLYPHS: Record<string, string> = {
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '111001111100111',
  '3': '111001111001111',
  '4': '101101111001001',
  '5': '111100111001111',
  '6': '111100111101111',
  '7': '111001001001001',
  '8': '111101111101111',
  '9': '111101111001111',
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class Sheet {
  px = new Uint8Array(W * H) // 1 = ink
  set(x: number, y: number) {
    if (x >= 0 && y >= 0 && x < W && y < H) this.px[y * W + x] = 1
  }
  rect(x: number, y: number, w: number, h: number, fill = false, t = 2) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) if (fill || i < t || j < t || i >= w - t || j >= h - t) this.set(x + i, y + j)
  }
  digits(text: string, x: number, y: number, scale: number) {
    let cx = x
    for (const ch of text) {
      const g = GLYPHS[ch]
      if (g)
        for (let r = 0; r < 5; r++)
          for (let c = 0; c < 3; c++) if (g[r * 3 + c] === '1') this.rect(cx + c * scale, y + r * scale, scale, scale, true)
      cx += 4 * scale
    }
  }
  scribble(x: number, y: number, w: number, h: number, rand: () => number) {
    let px = x
    let py = y + h / 2
    while (px < x + w) {
      const nx = Math.min(x + w, px + 6 + rand() * 10)
      const ny = y + 6 + rand() * (h - 12)
      const steps = Math.ceil(nx - px)
      for (let s = 0; s <= steps; s++) {
        const px2 = Math.round(px + ((nx - px) * s) / steps)
        const py2 = Math.round(py + ((ny - py) * s) / steps)
        this.set(px2, py2)
        this.set(px2 + 1, py2)
        this.set(px2, py2 + 1)
      }
      px = nx
      py = ny
    }
  }
}

function crc32(bytes: Uint8Array): number {
  let c = ~0
  for (const b of bytes) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** zlib stream made of stored (uncompressed) blocks: no dependency, works on Node and Workers. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / 65535))
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4)
  out[0] = 0x78
  out[1] = 0x01
  let o = 2
  for (let b = 0; b < blocks; b++) {
    const part = raw.subarray(b * 65535, (b + 1) * 65535)
    out[o++] = b === blocks - 1 ? 1 : 0
    out[o++] = part.length & 255
    out[o++] = part.length >> 8
    out[o++] = ~part.length & 255
    out[o++] = (~part.length >> 8) & 255
    out.set(part, o)
    o += part.length
  }
  let a = 1
  let s2 = 0
  for (const v of raw) {
    a = (a + v) % 65521
    s2 = (s2 + a) % 65521
  }
  new DataView(out.buffer).setUint32(o, ((s2 << 16) | a) >>> 0)
  return out
}

function encodePng1Bit(px: Uint8Array): Uint8Array {
  const stride = Math.ceil(W / 8)
  const raw = new Uint8Array((stride + 1) * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // 1-bit grayscale: 1 = white, so ink is 0.
      if (!px[y * W + x]) raw[y * (stride + 1) + 1 + (x >> 3)]! |= 0x80 >> (x & 7)
    }
  }
  const head = new Uint8Array(13)
  const hv = new DataView(head.buffer)
  hv.setUint32(0, W)
  hv.setUint32(4, H)
  head[8] = 1 // bit depth
  head[9] = 0 // grayscale
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** A synthetic test sheet: header bar, name box, 10 numbered rows with scribbled answers. No real data. */
export function renderTestSheet(seed: number): Uint8Array {
  const sheet = new Sheet()
  const rand = rng(seed)
  sheet.rect(0, 0, W, H, false, 4)
  sheet.rect(30, 24, W - 60, 14, true)
  sheet.rect(30, 52, 300, 34)
  sheet.scribble(38, 56, 280, 26, rand)
  for (let n = 1; n <= 10; n++) {
    const top = ROW_TOP + (n - 1) * ROW_STEP
    sheet.digits(String(n), 30, top + 14, 5)
    sheet.scribble(100, top + 6, 170, 40, rand)
    sheet.rect(BOX_X, top, BOX_W, BOX_H)
    sheet.scribble(BOX_X + 10, top + 6, 90 + rand() * 120, BOX_H - 12, rand)
  }
  return encodePng1Bit(sheet.px)
}

/** One page PDF of plain text, hand assembled. */
export function renderTeachingPlanPdf(): Uint8Array {
  const lines = [
    'Grade 6 Mathematics teaching plan (made up for the Jemma demo)',
    'Term 1: whole numbers, equivalent fractions, multiplying whole numbers',
    'Term 2: adding fractions with the same denominator, decimal fractions, 2D shapes, length',
    'Term 3: adding and subtracting fractions with different denominators, mixed numbers, percentages',
    'Term 4: comparing fractions, fractions and decimals, adding decimals, fraction of a quantity',
  ]
  const text = lines.map((l, i) => `BT /F1 11 Tf 40 ${780 - i * 22} Td (${l.replace(/[()\\]/g, '')}) Tj ET`).join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(body)
}

let ensured: Promise<void> | null = null

/** Writes the placeholder files that are missing. Safe to call on every sandbox: runs once per process. */
export function ensureSampleFiles(admin: JemmaDb): Promise<void> {
  ensured ??= (async () => {
    const files: [string, Uint8Array, string][] = [
      ...Object.values(SAMPLE_FILES.papers).map((p, i): [string, Uint8Array, string] => [p, renderTestSheet(11 + i), 'image/png']),
      [SAMPLE_FILES.memo, renderTestSheet(99), 'image/png'],
      [SAMPLE_FILES.curriculum, renderTeachingPlanPdf(), 'application/pdf'],
    ]
    await Promise.all(
      files.map(async ([path, bytes, contentType]) => {
        const { error } = await admin.storage.from(SAMPLE_FILES.bucket).upload(path, bytes, { contentType, upsert: false })
        if (error && !/already exists|Duplicate/i.test(error.message)) {
          throw new Error(`sample file ${path}: ${error.message}`)
        }
      }),
    )
  })().catch((e) => {
    ensured = null
    throw e
  })
  return ensured
}
