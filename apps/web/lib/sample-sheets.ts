import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { SheetName } from '../../../supabase/seed/fixtures/sample-papers'

/** The first bytes of every PNG file. A 200 that does not start with them is not a sheet (a page, an error). */
const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10]
/** A Worker has no files on disk and `next dev` may have no assets: give up rather than hold up a sandbox. */
const GIVE_UP_MS = 10_000

type Assets = { fetch(request: Request): Promise<Response> }

/**
 * Reads a sample test sheet from the Worker's static assets (`/sample-papers/<name>.png`, put in `public` by
 * scripts/copy-sample-sheets.mjs before the build). The bytes are not in the script bundle. Returns null when there is no
 * Cloudflare context (for example under `next dev`), no asset, or anything else goes wrong, so the caller falls back to the file on disk.
 */
export async function loadSheet(who: SheetName): Promise<Uint8Array | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const assets = (getCloudflareContext().env as { ASSETS?: Assets }).ASSETS
    if (!assets) return null
    const answer = await Promise.race([
      assets.fetch(new Request(`https://assets.local/sample-papers/${who}.png`)),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), GIVE_UP_MS)
      }),
    ])
    if (!answer || answer.status !== 200) return null
    const bytes = new Uint8Array(await answer.arrayBuffer())
    return PNG_MAGIC.every((b, i) => bytes[i] === b) ? bytes : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
