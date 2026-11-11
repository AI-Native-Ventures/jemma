// Copies the 6 sample test sheets (the 5 papers and the memo) from fixtures/papers to apps/web/public/sample-papers.
// The web app runs as a Worker with no files on disk, so it reads the sheets from its own static assets (see lib/sample-sheets.ts).
// This runs before `next dev` and before `next build` (the Cloudflare build calls the package's build script), so the folder
// is always there and always matches fixtures/papers. The folder is not committed.
//
//   node scripts/copy-sample-sheets.mjs [from-folder] [to-folder]
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SHEETS = ['amina', 'thabo', 'lerato', 'sipho', 'naledi', 'memo']

const from = resolve(process.argv[2] ?? join(here, '../../../fixtures/papers'))
const to = resolve(process.argv[3] ?? join(here, '../public/sample-papers'))

const missing = SHEETS.filter((who) => !existsSync(join(from, `${who}.png`)))
if (missing.length > 0) {
  console.error(`copy-sample-sheets: ${missing.map((who) => `${who}.png`).join(', ')} not found in ${from}`)
  process.exit(1)
}

mkdirSync(to, { recursive: true })
// Only the PNG files of an earlier copy go. Nothing else in the folder is touched.
for (const old of readdirSync(to)) if (old.endsWith('.png') && !SHEETS.includes(old.slice(0, -4))) rmSync(join(to, old), { force: true })
for (const who of SHEETS) copyFileSync(join(from, `${who}.png`), join(to, `${who}.png`))
console.log(`copy-sample-sheets: ${SHEETS.length} sheets copied to ${to}`)
