// Renders the three unseen curriculum documents from their HTML sources, headless. No network, no fonts from outside.
//
//   pnpm --filter web exec node ../../fixtures/curriculum/unseen/render.mjs [--keep <folder>]
//
// `--keep <folder>` also writes the four scanned pictures (JPEG) there, to look at them.
//
// (a) and (b): the HTML is printed to PDF, so the PDF has a text layer.
// (c): each sheet is photographed with a small skew, grey paper and noise, and the pictures are put into a PDF. That PDF has
//      no text layer at all, like a scan.
import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(new URL('../../../apps/web/package.json', import.meta.url))
const { chromium } = require('@playwright/test')

const PRINT = [
  ['grade9-natural-sciences-za.html', 'grade9-natural-sciences-za.pdf'],
  ['grade5-english-za.html', 'grade5-english-za.pdf'],
]
const SCAN = { html: 'grade4-science-technology-ke.html', pdf: 'grade4-science-technology-ke.pdf', sheets: ['p1', 'p2', 'p3', 'p4'], angles: [0.9, -0.7, 1.1, -0.5] }

const browser = await chromium.launch({ headless: true })
const tmp = mkdtempSync(join(tmpdir(), 'jemma-unseen-'))
try {
  for (const [html, pdf] of PRINT) {
    const page = await browser.newPage()
    await page.goto(pathToFileURL(join(here, html)).href)
    writeFileSync(join(here, pdf), await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }))
    await page.close()
    console.log(`wrote ${pdf}`)
  }

  const source = readFileSync(join(here, SCAN.html), 'utf8')
  const pictures = []
  for (const [i, id] of SCAN.sheets.entries()) {
    const page = await browser.newPage({ viewport: { width: 880, height: 1200 }, deviceScaleFactor: 1.4 })
    await page.setContent(source)
    await page.evaluate(
      ({ id, angle }) => {
        for (const sheet of document.querySelectorAll('.sheet')) if (sheet.id !== id) sheet.remove()
        const sheet = document.getElementById(id)
        const bed = document.createElement('div')
        bed.style.cssText = 'position:relative;width:880px;height:1200px;background:#b9b9b6;overflow:hidden;'
        sheet.style.cssText = `position:absolute;left:43px;top:38px;transform:rotate(${angle}deg);transform-origin:50% 50%;background:#f4f4f1;box-shadow:0 0 14px rgba(0,0,0,.45);filter:grayscale(1) contrast(.86) brightness(.94);`
        const noise = document.createElement('div')
        noise.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:.34;mix-blend-mode:multiply;'
        noise.innerHTML =
          '<svg width="880" height="1200" xmlns="http://www.w3.org/2000/svg"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>'
        document.body.style.margin = '0'
        document.body.replaceChildren(bed)
        bed.append(sheet, noise)
      },
      { id, angle: SCAN.angles[i] },
    )
    const file = join(tmp, `${id}.jpg`)
    writeFileSync(file, await page.screenshot({ type: 'jpeg', quality: 70 }))
    pictures.push(file)
    await page.close()
  }

  const keep = process.argv.includes('--keep') ? process.argv[process.argv.indexOf('--keep') + 1] : null
  if (keep) {
    mkdirSync(keep, { recursive: true })
    for (const f of pictures) copyFileSync(f, join(keep, f.split('/').pop()))
  }

  const wrap = await browser.newPage()
  const imgs = pictures.map((f) => `<img src="data:image/jpeg;base64,${readFileSync(f).toString('base64')}">`).join('')
  await wrap.setContent(
    `<style>@page{size:A4;margin:0}html,body{margin:0}img{display:block;width:210mm;height:297mm;object-fit:cover;page-break-after:always}</style>${imgs}`,
  )
  writeFileSync(join(here, SCAN.pdf), await wrap.pdf({ width: '210mm', height: '297mm', printBackground: true, preferCSSPageSize: true }))
  console.log(`wrote ${SCAN.pdf}`)
} finally {
  await browser.close()
  rmSync(tmp, { recursive: true, force: true })
}
