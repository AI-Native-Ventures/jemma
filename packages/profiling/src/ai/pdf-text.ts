import { extractText, getDocumentProxy } from 'unpdf'

/**
 * The text of a PDF, read from its text layer (not by looking at the page images). `unpdf` carries a build of PDF.js made
 * for servers and Workers, so it runs in the agent Worker as well as in Node.
 */

export type PdfText = { pages: number; text: string }

/** A page of a typed document has hundreds of letters. A scan has none: its pictures are not text. */
const MIN_LETTERS = 200

export async function readPdfText(bytes: Uint8Array): Promise<PdfText> {
  const pdf = await getDocumentProxy(bytes)
  const { totalPages, text } = await extractText(pdf, { mergePages: true })
  return { pages: totalPages, text }
}

/** True when the extracted text is enough to read the document from: a document with only page images gives almost nothing. */
export const hasTextLayer = (text: string): boolean => text.replace(/\s/g, '').length >= MIN_LETTERS

export function bytesFromBase64(data: string): Uint8Array {
  const raw = atob(data)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** The most text sent to the text model for one class: far more than 40 pages of a plan, and a bound on the request. */
export const MAX_DOCUMENT_CHARS = 120_000

/**
 * The text of every document, one after the other, or null when the documents cannot be read as text: one of them is a
 * picture, or has no text layer, or cannot be opened. Then the text model is not asked and the error of the first try stays.
 */
export async function documentsText(files: { data: string; mimeType: string }[]): Promise<string | null> {
  if (files.length === 0 || files.some((f) => f.mimeType !== 'application/pdf')) return null
  const parts: string[] = []
  for (const f of files) {
    const read = await readPdfText(bytesFromBase64(f.data)).catch(() => null)
    if (!read || !hasTextLayer(read.text)) return null
    parts.push(read.text.trim())
  }
  const all = parts.length === 1 ? parts[0]! : parts.map((t, i) => `Document ${i + 1}\n${t}`).join('\n\n')
  return all.length > MAX_DOCUMENT_CHARS ? all.slice(0, MAX_DOCUMENT_CHARS) : all
}
