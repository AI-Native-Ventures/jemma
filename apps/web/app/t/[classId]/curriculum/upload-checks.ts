/**
 * What an uploaded curriculum document must be: a PDF, a JPG or a PNG (read from its first bytes, never from its name),
 * at most 10 MB and 40 pages. The same limits are shown in the messages, so a teacher who is turned away can see why.
 * Server and browser both use this file; the browser only has the size and the first bytes to look at.
 */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
export const MAX_DOCUMENT_PAGES = 40
/** All the documents of one upload together: three of the largest allowed. The server action body limit in next.config.ts is a little above this. */
export const MAX_UPLOAD_BYTES = 3 * MAX_DOCUMENT_BYTES

export type DocKind = 'pdf' | 'jpg' | 'png'
export const MIME: Record<DocKind, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' }

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b)

/** The kind of file from its first bytes: `%PDF-`, the JPEG marker `FF D8 FF`, or the PNG signature. Null for anything else. */
export function sniffKind(bytes: Uint8Array): DocKind | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  return null
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

export const notAllowedMessage = (name: string) => `"${name}" is not a PDF, JPG or PNG file. Jemma can only read those three kinds.`
export const tooBigMessage = (name: string, size: number) =>
  `"${name}" is ${mb(size)}. The limit is 10 MB for one document. Make it smaller, or send only the pages for your grade.`
export const tooManyPagesMessage = (name: string, pages: number) =>
  `"${name}" has ${pages} pages. The limit is 40 pages for one document. Send only the pages for your grade.`
export const tooMuchMessage = (size: number) => `These files are ${mb(size)} together. The limit is 30 MB for one upload. Add them a few at a time.`
export const emptyMessage = (name: string) => `"${name}" is empty.`

/** The size rules, for the browser (before anything is sent) and for the server. Null when the sizes are fine. */
export function sizeProblem(files: { name: string; size: number }[]): string | null {
  for (const f of files) {
    if (f.size === 0) return emptyMessage(f.name)
    if (f.size > MAX_DOCUMENT_BYTES) return tooBigMessage(f.name, f.size)
  }
  const total = files.reduce((n, f) => n + f.size, 0)
  return total > MAX_UPLOAD_BYTES ? tooMuchMessage(total) : null
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const body = new Response(bytes as BodyInit).body!.pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(body).arrayBuffer())
}

/** One character for each byte. (`TextDecoder('latin1')` is windows-1252 in browsers and Node, which changes the bytes 0x80 to 0x9F.) */
function latin1(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return out
}

/** Page objects (`/Type /Page`) and the biggest `/Count` of a page tree node (`/Type /Pages`) in some PDF text. */
function pageHints(text: string): { leaves: number; count: number } {
  const leaves = (text.match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length
  let count = 0
  for (const m of text.matchAll(/<<[^<>]*\/Type\s*\/Pages(?![A-Za-z])[^<>]*>>/g)) {
    const c = /\/Count\s+(\d+)/.exec(m[0])
    if (c) count = Math.max(count, Number(c[1]))
  }
  return { leaves, count }
}

/**
 * The number of pages of a PDF, read from its page objects and the count of its page tree, also inside compressed object
 * streams (most office programs and scanners write the page tree there). At least 1: when nothing can be read the file is
 * counted as one page, and the agent's own reader still has the last word.
 */
export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const raw = latin1(bytes)
  let { leaves, count } = pageHints(raw)
  const objectStreams = /<<[^<>]*\/Type\s*\/ObjStm[^<>]*>>\s*stream\r?\n/g
  for (const m of raw.matchAll(objectStreams)) {
    const start = m.index! + m[0].length
    const end = raw.indexOf('endstream', start)
    if (end < 0) continue
    // The stream is `Length` bytes when the dictionary says so (a plain number), else up to the end marker without its line break.
    const declared = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(m[0])
    const stop = declared && start + Number(declared[1]) <= end ? start + Number(declared[1]) : end - (raw[end - 1] === '\n' ? (raw[end - 2] === '\r' ? 2 : 1) : raw[end - 1] === '\r' ? 1 : 0)
    const data = Uint8Array.from(raw.slice(start, stop), (ch) => ch.charCodeAt(0))
    try {
      const hints = pageHints(latin1(await inflate(data)))
      leaves += hints.leaves
      count = Math.max(count, hints.count)
    } catch {
      // a stream that cannot be opened adds nothing
    }
  }
  return Math.max(1, leaves, count)
}

export type DocumentCheck = { ok: true; kind: DocKind; mimeType: string; pages: number } | { ok: false; message: string }

/** One document, with its bytes: type from the first bytes, then size, then (for a PDF) pages. Photos count as one page. */
export async function checkDocument(name: string, bytes: Uint8Array): Promise<DocumentCheck> {
  const kind = sniffKind(bytes)
  if (!kind) return { ok: false, message: notAllowedMessage(name) }
  if (bytes.length > MAX_DOCUMENT_BYTES) return { ok: false, message: tooBigMessage(name, bytes.length) }
  const pages = kind === 'pdf' ? await pdfPageCount(bytes) : 1
  if (pages > MAX_DOCUMENT_PAGES) return { ok: false, message: tooManyPagesMessage(name, pages) }
  return { ok: true, kind, mimeType: MIME[kind], pages }
}
