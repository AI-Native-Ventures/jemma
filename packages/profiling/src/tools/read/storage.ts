import type { JemmaDb } from '../../db'
import type { ToolImage } from '../context'

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
}

const BUCKETS = ['papers', 'curriculum', 'sample-papers', 'lesson-audio']

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(out)
}

export type StoredFile = ToolImage & { path: string }

/** Downloads private storage files (service role). Tries the preferred bucket first, then the others. */
export async function readStored(db: JemmaDb, preferred: string, paths: string[]): Promise<StoredFile[]> {
  const buckets = [preferred, ...BUCKETS.filter((b) => b !== preferred)]
  const out: StoredFile[] = []
  for (const path of paths) {
    let found: StoredFile | null = null
    for (const bucket of buckets) {
      const { data, error } = await db.storage.from(bucket).download(path)
      if (error || !data) continue
      const ext = path.split('.').pop()?.toLowerCase() ?? ''
      const mimeType = MIME[ext] ?? (data.type && data.type !== 'application/octet-stream' ? data.type : 'application/octet-stream')
      found = { path, mimeType, data: base64(new Uint8Array(await data.arrayBuffer())) }
      break
    }
    if (!found) throw new Error(`file not found in storage: ${path}`)
    out.push(found)
  }
  return out
}
