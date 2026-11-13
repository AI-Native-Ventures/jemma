// A real headless Chromium runs the real lib/shrink-photo.ts (transpiled, not rewritten) on a 4000 x 3000 photo and prints what came
// out. No database, no server, no model, nothing leaves this machine. Run it from apps/web:
//
//   node scripts/check-shrink-photo.mjs
//
// Exit code 1 when a check below fails.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const web = resolve(import.meta.dirname, '..')
const require = createRequire(resolve(web, 'package.json'))
const ts = require('typescript')
const { chromium } = require('@playwright/test')

const source = readFileSync(resolve(web, 'lib/shrink-photo.ts'), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.setContent('<!doctype html><html><body></body></html>')
  await page.addScriptTag({ type: 'module', content: `${js}\nwindow.shrinkPhoto = shrinkPhoto; window.ready = true` })
  await page.waitForFunction(() => window.ready === true)

  const report = await page.evaluate(async () => {
    /** A photo as a camera gives it: a paper-coloured gradient, some written text and a little sensor noise, as a JPEG. */
    async function makeJpeg(width, height, quality, noise) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      const paper = ctx.createLinearGradient(0, 0, width, height)
      paper.addColorStop(0, '#f6f1e6')
      paper.addColorStop(1, '#cdc3b0')
      ctx.fillStyle = paper
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#23283a'
      ctx.font = `${Math.round(height / 20)}px sans-serif`
      for (let n = 1; n <= 8; n++) ctx.fillText(`${n}.  ${n * 3} + 0,${n} = ${n * 3},${n}   Amina 23/10`, width / 15, height / 9 + (n - 1) * (height / 9))
      const image = ctx.getImageData(0, 0, width, height)
      const px = image.data
      for (let i = 0; i < px.length; i += 4) {
        const d = (Math.random() - 0.5) * noise
        px[i] += d
        px[i + 1] += d
        px[i + 2] += d
      }
      ctx.putImageData(image, 0, 0)
      const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', quality))
      return new File([blob], 'IMG_4021.jpg', { type: 'image/jpeg' })
    }
    const sizeOf = async (file) => {
      const bitmap = await createImageBitmap(file)
      return { width: bitmap.width, height: bitmap.height }
    }
    const out = {}
    const landscape = await makeJpeg(4000, 3000, 0.95, 18)
    const landscapeOut = await window.shrinkPhoto(landscape)
    out.landscape = { before: landscape.size, after: landscapeOut.size, name: landscapeOut.name, type: landscapeOut.type, ...(await sizeOf(landscapeOut)), same: landscapeOut === landscape }
    const portrait = await makeJpeg(3000, 4000, 0.95, 18)
    const portraitOut = await window.shrinkPhoto(portrait)
    out.portrait = { before: portrait.size, after: portraitOut.size, ...(await sizeOf(portraitOut)), same: portraitOut === portrait }
    // over 1 MB but already within 2000 px: never scaled up
    const mid = await makeJpeg(1800, 1200, 1, 30)
    const midOut = await window.shrinkPhoto(mid)
    out.within = { before: mid.size, after: midOut.size, ...(await sizeOf(midOut)), same: midOut === mid }
    // 1,000,000 bytes or less, a PDF, and a file that does not decode: the same file comes back
    const small = await makeJpeg(1200, 900, 0.8, 4)
    out.small = { size: small.size, same: (await window.shrinkPhoto(small)) === small }
    const pdf = new File([new Uint8Array(5_000_000)], 'plan.pdf', { type: 'application/pdf' })
    out.pdf = { same: (await window.shrinkPhoto(pdf)) === pdf }
    const bad = new File([new Uint8Array(3_000_000)], 'not-a-photo.jpg', { type: 'image/jpeg' })
    out.undecodable = { same: (await window.shrinkPhoto(bad)) === bad }
    return out
  })
  console.log(JSON.stringify(report, null, 1))

  const failures = []
  const must = (ok, what) => ok || failures.push(what)
  must(report.landscape.before > 2_000_000, 'the test photo is over 2 MB')
  must(!report.landscape.same && report.landscape.type === 'image/jpeg', 'the big photo was rewritten as a JPEG')
  must(report.landscape.width === 2000 && report.landscape.height === 1500, 'the longest side is 2000 (landscape)')
  must(report.landscape.after < 1_000_000, 'the big photo is under 1 MB')
  must(report.portrait.width === 1500 && report.portrait.height === 2000, 'the longest side is 2000 (portrait)')
  must(report.within.width === 1800 && report.within.height === 1200, 'a photo within 2000 px is not scaled up')
  must(report.small.same && report.pdf.same && report.undecodable.same, 'a small photo, a PDF and an undecodable file come back as the same file')
  if (failures.length > 0) {
    console.error(`FAILED: ${failures.join('; ')}`)
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
