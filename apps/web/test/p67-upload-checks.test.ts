// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { describe, expect, test } from 'vitest'
import {
  checkDocument,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_PAGES,
  MAX_UPLOAD_BYTES,
  pdfPageCount,
  sizeProblem,
  sniffKind,
} from '../app/t/[classId]/curriculum/upload-checks'

const root = resolve(import.meta.dirname, '../../..')
const fixture = (rel: string) => new Uint8Array(readFileSync(join(root, rel)))
const UNSEEN = 'fixtures/curriculum/unseen'
const bytesOf = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0))

/** A PDF-looking file whose page tree sits in a compressed object stream, the way most office programs write it. */
function withObjectStream(pages: number): Uint8Array {
  const inner = `1 0 << /Type /Catalog /Pages 2 0 R >> 2 0 << /Type /Pages /Count ${pages} /Kids [] >>`
  const packed = deflateSync(Buffer.from(inner, 'latin1'))
  const head = '%PDF-1.7\n9 0 obj\n<< /Type /ObjStm /N 2 /First 12 /Length ' + packed.length + ' /Filter /FlateDecode >>\nstream\n'
  return Uint8Array.from([...bytesOf(head), ...packed, ...bytesOf('\nendstream\nendobj\n%%EOF')])
}

describe('what kind of file it is comes from its first bytes', () => {
  test('a PDF, a JPG and a PNG are known', () => {
    expect(sniffKind(bytesOf('%PDF-1.4\n...'))).toBe('pdf')
    expect(sniffKind(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe('jpg')
    expect(sniffKind(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png')
  })

  test('the name does not matter: an executable called plan.pdf is refused, and a PDF called plan.txt is read', async () => {
    expect(sniffKind(bytesOf('MZ\u0090\u0000 this is not a pdf'))).toBeNull()
    expect(await checkDocument('plan.pdf', bytesOf('MZ\u0090\u0000 not a pdf'))).toEqual({
      ok: false,
      message: '"plan.pdf" is not a PDF, JPG or PNG file. Jemma can only read those three kinds.',
    })
    expect(await checkDocument('plan.txt', fixture(`${UNSEEN}/grade5-english-za.pdf`))).toMatchObject({ ok: true, kind: 'pdf', mimeType: 'application/pdf' })
  })

  test('text, a GIF, a Word file and an empty file are refused', async () => {
    for (const bad of [bytesOf('hello'), bytesOf('GIF89a....'), bytesOf('PK\u0003\u0004 docx'), new Uint8Array(0)]) {
      expect((await checkDocument('x', bad)).ok).toBe(false)
    }
  })
})

describe('the limits: 10 MB and 40 pages for a document', () => {
  test('the limits are the ones the messages say', () => {
    expect(MAX_DOCUMENT_BYTES).toBe(10 * 1024 * 1024)
    expect(MAX_DOCUMENT_PAGES).toBe(40)
    expect(MAX_UPLOAD_BYTES).toBe(30 * 1024 * 1024)
  })

  test('a file over 10 MB is turned away with the limit in plain words', async () => {
    const big = new Uint8Array(MAX_DOCUMENT_BYTES + 1)
    big.set(bytesOf('%PDF-1.4\n'))
    expect(await checkDocument('plan.pdf', big)).toEqual({
      ok: false,
      message: '"plan.pdf" is 10.0 MB. The limit is 10 MB for one document. Make it smaller, or send only the pages for your grade.',
    })
    expect(sizeProblem([{ name: 'plan.pdf', size: 12 * 1024 * 1024 }])).toBe(
      '"plan.pdf" is 12.0 MB. The limit is 10 MB for one document. Make it smaller, or send only the pages for your grade.',
    )
  })

  test('a file of exactly 10 MB and a 9 MB one are accepted', async () => {
    for (const size of [MAX_DOCUMENT_BYTES, 9 * 1024 * 1024]) {
      const file = new Uint8Array(size)
      file.set(bytesOf('%PDF-1.4\n'))
      expect(await checkDocument('plan.pdf', file)).toMatchObject({ ok: true, kind: 'pdf', pages: 1 })
    }
  })

  test('the sizes can be judged in the browser before anything is sent', () => {
    expect(sizeProblem([{ name: 'a.pdf', size: 1000 }])).toBeNull()
    expect(sizeProblem([{ name: 'a.pdf', size: 0 }])).toBe('"a.pdf" is empty.')
    expect(sizeProblem([{ name: 'a.jpg', size: 9 * 1024 * 1024 }, { name: 'b.jpg', size: 9 * 1024 * 1024 }, { name: 'c.jpg', size: 9 * 1024 * 1024 }, { name: 'd.jpg', size: 9 * 1024 * 1024 }])).toBe(
      'These files are 36.0 MB together. The limit is 30 MB for one upload. Add them a few at a time.',
    )
  })

  test('a PDF of more than 40 pages is turned away with its page count', async () => {
    const pages = Array.from({ length: 41 }, (_, i) => `${i + 3} 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj`).join('\n')
    const pdf = bytesOf(`%PDF-1.4\n2 0 obj\n<< /Type /Pages /Count 41 /Kids [] >>\nendobj\n${pages}\n%%EOF`)
    expect(await pdfPageCount(pdf)).toBe(41)
    expect(await checkDocument('big plan.pdf', pdf)).toEqual({ ok: false, message: '"big plan.pdf" has 41 pages. The limit is 40 pages for one document. Send only the pages for your grade.' })
  })

  test('exactly 40 pages is accepted', async () => {
    const pages = Array.from({ length: 40 }, (_, i) => `${i + 3} 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj`).join('\n')
    expect(await checkDocument('plan.pdf', bytesOf(`%PDF-1.4\n${pages}`))).toMatchObject({ ok: true, pages: 40 })
  })
})

describe('counting the pages of real PDFs', () => {
  test('the three unseen documents have 6, 5 and 4 pages', async () => {
    expect(await pdfPageCount(fixture(`${UNSEEN}/grade9-natural-sciences-za.pdf`))).toBe(6)
    expect(await pdfPageCount(fixture(`${UNSEEN}/grade5-english-za.pdf`))).toBe(5)
    expect(await pdfPageCount(fixture(`${UNSEEN}/grade4-science-technology-ke.pdf`))).toBe(4)
  })

  test('the sample Grade 6 plan has 4 pages', async () => {
    expect(await pdfPageCount(fixture('fixtures/curriculum/grade6-maths-teaching-plan.pdf'))).toBe(4)
  })

  test('a page tree inside a compressed object stream is counted too', async () => {
    expect(await pdfPageCount(withObjectStream(3))).toBe(3)
    expect(await pdfPageCount(withObjectStream(120))).toBe(120)
    expect(await checkDocument('office.pdf', withObjectStream(120))).toMatchObject({ ok: false })
  })

  test('a broken object stream adds nothing, and a PDF with nothing readable counts as one page', async () => {
    const broken = bytesOf('%PDF-1.7\n9 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Length 5 /Filter /FlateDecode >>\nstream\nnot deflate\nendstream\n')
    expect(await pdfPageCount(broken)).toBe(1)
    expect(await pdfPageCount(bytesOf('%PDF-1.4\n'))).toBe(1)
  })

  test('photos count as one page each, and a photo is never turned away for pages', async () => {
    const jpg = new Uint8Array(1000)
    jpg.set([0xff, 0xd8, 0xff])
    expect(await checkDocument('photo.jpg', jpg)).toMatchObject({ ok: true, kind: 'jpg', pages: 1, mimeType: 'image/jpeg' })
  })
})
