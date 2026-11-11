import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// The sample files of the demo: the 5 test papers and the memo (real renderings in fixtures/papers) and a made-up
// teaching plan. They live in the `sample-papers` bucket and every sandbox copies them. The sheets are never replaced
// by a stand-in: a runtime that cannot read them stops with a clear message instead.
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

/** The 5 papers and the memo, by the name of their file in fixtures/papers and in the bucket (`<name>.png`). */
export type SheetName = keyof typeof SAMPLE_FILES.papers | 'memo'
export const SHEET_NAMES: readonly SheetName[] = [...(Object.keys(SAMPLE_FILES.papers) as (keyof typeof SAMPLE_FILES.papers)[]), 'memo']

/** Gives the bytes of a sheet, or null when this runtime has none. A Worker has no files on disk, so the web app passes one that reads its static assets. */
export type LoadSheet = (who: SheetName) => Promise<Uint8Array | null>

export type EnsureSampleFilesOptions = {
  /** Asked first for each sheet. When it gives no bytes (or throws), the disk file is used. */
  loadSheet?: LoadSheet
  /** Reads fixtures/papers/<who>.png from disk, or null when the file is not there. Tests replace it. */
  readDisk?: (who: SheetName) => Uint8Array | null
}

const W = 600
const H = 800
const ROW_TOP = 100
const ROW_STEP = 66
const BOX_X = 300
const BOX_W = 270
const BOX_H = 52

/** Where question `n`'s answer sits on a sample sheet, as fractions of the page (0 to 1). */
export function answerCrop(n: number): { x: number; y: number; w: number; h: number } {
  return { x: BOX_X / W, y: (ROW_TOP + (n - 1) * ROW_STEP) / H, w: BOX_W / W, h: BOX_H / H }
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

const sheetPath = (who: SheetName): string => (who === 'memo' ? SAMPLE_FILES.memo : SAMPLE_FILES.papers[who])
const SHEET_FOLDER = 'class-test-1'

/**
 * Synthetic Class Test 1 sheets rendered from fixtures/papers/*.html (printed questions, answers in a handwriting
 * font, mistakes as in class-test-1.ts; Sipho's Q7 is drawn ambiguous on purpose). Null when the file is not on disk,
 * as in a Worker.
 */
function readSheetFromDisk(who: SheetName): Uint8Array | null {
  try {
    const file = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/papers', `${who}.png`)
    return existsSync(file) ? new Uint8Array(readFileSync(file)) : null
  } catch {
    return null
  }
}

/** The real bytes of a sheet: from the loader if there is one and it has them, else from disk, else null. */
async function sheetBytes(who: SheetName, opts: EnsureSampleFilesOptions): Promise<Uint8Array | null> {
  let bytes: Uint8Array | null = null
  if (opts.loadSheet) {
    try {
      bytes = await opts.loadSheet(who)
    } catch {
      bytes = null
    }
  }
  if (!bytes?.length) bytes = (opts.readDisk ?? readSheetFromDisk)(who)
  return bytes?.length ? bytes : null
}

/**
 * Makes sure the sample files are in the bucket, and are the right ones. Safe to call on every sandbox: runs once per process.
 * First every sheet is found (loader, then disk). If one cannot be found it throws and uploads nothing at all: a stand-in
 * sheet would be read by a model as a blank paper. Then the sheet folder is listed once. A sheet that is missing is uploaded.
 * A sheet that is there with another size than the real file (a stand-in from an earlier version) is replaced. A sheet of
 * the right size is left alone.
 */
export function ensureSampleFiles(admin: JemmaDb, opts: EnsureSampleFilesOptions = {}): Promise<void> {
  ensured ??= (async () => {
    const found = await Promise.all(SHEET_NAMES.map(async (who) => [who, await sheetBytes(who, opts)] as const))
    const sheets: (readonly [SheetName, Uint8Array])[] = []
    for (const [who, bytes] of found) {
      if (!bytes) throw new Error(`sample sheet ${who}.png is not available in this runtime`)
      sheets.push([who, bytes])
    }

    const bucket = admin.storage.from(SAMPLE_FILES.bucket)
    const listed = await bucket.list(SHEET_FOLDER, { limit: 100 })
    if (listed.error) throw new Error(`sample sheets: could not list ${SHEET_FOLDER}: ${listed.error.message}`)
    // A listing without a size counts as the wrong size: uploading again is safe and happens once per process.
    const sizes = new Map((listed.data ?? []).map((o) => [o.name, (o.metadata as { size?: number } | null)?.size]))

    const put = async (path: string, bytes: Uint8Array, contentType: string, upsert: boolean) => {
      const { error } = await bucket.upload(path, bytes, { contentType, upsert })
      if (error && !(upsert === false && /already exists|Duplicate/i.test(error.message))) {
        throw new Error(`sample file ${path}: ${error.message}`)
      }
    }

    await Promise.all([
      ...sheets.map(async ([who, bytes]) => {
        const name = `${who}.png`
        if (!sizes.has(name)) return put(sheetPath(who), bytes, 'image/png', false)
        if (sizes.get(name) !== bytes.length) return put(sheetPath(who), bytes, 'image/png', true)
      }),
      put(SAMPLE_FILES.curriculum, renderTeachingPlanPdf(), 'application/pdf', false),
    ])
  })().catch((e) => {
    ensured = null
    throw e
  })
  return ensured
}
