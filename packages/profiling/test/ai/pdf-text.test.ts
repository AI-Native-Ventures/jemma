import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { documentsText, hasTextLayer, readPdfText } from '../../src/ai/pdf-text'

const root = resolve(import.meta.dirname, '../../../..')
const file = (rel: string) => readFileSync(join(root, rel))
const base64 = (rel: string) => file(rel).toString('base64')
const SAMPLE = 'fixtures/curriculum/grade6-maths-teaching-plan.pdf'
const UNSEEN = 'fixtures/curriculum/unseen'
/** Lines of a table cell or a paragraph wrap where the page wraps them: compare words, not line breaks, and not capitals. */
const flat = (text: string) => text.replace(/\s+/g, ' ').toLowerCase()

describe('reading the text layer of a PDF', () => {
  test('a typed plan gives its pages and its words', async () => {
    const read = await readPdfText(new Uint8Array(file(`${UNSEEN}/grade9-mathematics-za.pdf`)))
    expect(read.pages).toBe(6)
    expect(flat(read.text)).toContain('linear equations and inequalities')
    expect(hasTextLayer(read.text)).toBe(true)
  })

  test('a plan written as paragraphs gives them in order', async () => {
    const read = await readPdfText(new Uint8Array(file(`${UNSEEN}/grade5-mathematics-za.pdf`)))
    expect(read.pages).toBe(5)
    expect(read.text.indexOf('Term 1')).toBeLessThan(read.text.indexOf('Term 4'))
    expect(hasTextLayer(read.text)).toBe(true)
  })

  test('the three earlier documents outside Mathematics read the same way: two typed, one scan', async () => {
    const OTHER = `${UNSEEN}/other-subjects`
    expect(hasTextLayer((await readPdfText(new Uint8Array(file(`${OTHER}/grade9-natural-sciences-za.pdf`)))).text)).toBe(true)
    expect(hasTextLayer((await readPdfText(new Uint8Array(file(`${OTHER}/grade5-english-za.pdf`)))).text)).toBe(true)
    expect(hasTextLayer((await readPdfText(new Uint8Array(file(`${OTHER}/grade4-science-technology-ke.pdf`)))).text)).toBe(false)
  })

  test('a scan made of page pictures has pages and no text layer', async () => {
    const read = await readPdfText(new Uint8Array(file(`${UNSEEN}/grade4-mathematics-ke.pdf`)))
    expect(read.pages).toBe(4)
    expect(hasTextLayer(read.text)).toBe(false)
  })

  test('a few stray letters are not a text layer', () => {
    expect(hasTextLayer('')).toBe(false)
    expect(hasTextLayer('  \n Page 1 \n ')).toBe(false)
    expect(hasTextLayer('word '.repeat(60))).toBe(true)
  })
})

describe('the text of the documents of a class', () => {
  test('one typed PDF gives its text', async () => {
    const text = await documentsText([{ data: base64(`${UNSEEN}/grade9-mathematics-za.pdf`), mimeType: 'application/pdf' }])
    expect(flat(text!)).toContain('integers and exponents')
  })

  test('several documents are put one after the other and told apart', async () => {
    const text = await documentsText([
      { data: base64(`${UNSEEN}/grade9-mathematics-za.pdf`), mimeType: 'application/pdf' },
      { data: base64(`${UNSEEN}/grade5-mathematics-za.pdf`), mimeType: 'application/pdf' },
    ])
    expect(text).toMatch(/^Document 1\n/)
    expect(text).toContain('Document 2\n')
    expect(flat(text!)).toContain('multiples and factors')
  })

  test('a scan, a picture, no document or a broken file gives null, so the text model is not asked', async () => {
    expect(await documentsText([{ data: base64(`${UNSEEN}/grade4-mathematics-ke.pdf`), mimeType: 'application/pdf' }])).toBeNull()
    expect(await documentsText([{ data: Buffer.from('not a pdf at all').toString('base64'), mimeType: 'application/pdf' }])).toBeNull()
    expect(await documentsText([{ data: 'AAAA', mimeType: 'image/png' }])).toBeNull()
    expect(await documentsText([])).toBeNull()
  })

  test('one document without a text layer among typed ones also gives null', async () => {
    const text = await documentsText([
      { data: base64(`${UNSEEN}/grade9-mathematics-za.pdf`), mimeType: 'application/pdf' },
      { data: base64(`${UNSEEN}/grade4-mathematics-ke.pdf`), mimeType: 'application/pdf' },
    ])
    expect(text).toBeNull()
  })

  test('the sample Grade 6 plan has a text layer too, so it could be read this way', async () => {
    const read = await readPdfText(new Uint8Array(file(SAMPLE)))
    expect(read.pages).toBe(4)
  })
})
