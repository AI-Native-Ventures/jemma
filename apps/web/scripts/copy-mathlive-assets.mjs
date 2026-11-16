// Copies the fonts of the maths editor (MathLive) from its package to apps/web/public/mathlive/fonts, so the editor draws its maths with fonts served by this app
// (the editor is told to look for them there; no request to a CDN or any other site, and no sound files: the editor's sounds are off).
// This runs before `next dev` and before `next build`, as the sample sheets do. The folder is not committed.
//
//   node scripts/copy-mathlive-assets.mjs [to-folder]
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const from = resolve(join(here, '../node_modules/mathlive/fonts'))
const to = resolve(process.argv[2] ?? join(here, '../public/mathlive/fonts'))

if (!existsSync(from)) {
  console.error(`copy-mathlive-assets: ${from} not found: run pnpm install`)
  process.exit(1)
}
const fonts = readdirSync(from).filter((f) => f.endsWith('.woff2'))
mkdirSync(to, { recursive: true })
for (const old of readdirSync(to)) if (old.endsWith('.woff2') && !fonts.includes(old)) rmSync(join(to, old), { force: true })
for (const f of fonts) copyFileSync(join(from, f), join(to, f))
console.log(`copy-mathlive-assets: ${fonts.length} fonts copied to ${to}`)
