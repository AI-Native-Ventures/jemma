import { afterEach, describe, expect, test, vi } from 'vitest'
import { fitWithin, needsShrink, shrinkPhoto } from '../lib/shrink-photo'

// A teacher's photo is made smaller in the browser before it is sent: a phone photo is 3 to 8 MB, and the recorded answers of the
// model hold what is sent. The two decisions are pure and tested here; the canvas is a stand-in (a real one is in the browser spec).

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const file = (name: string, type: string, size: number) => new File([new Uint8Array(size)], name, { type })

describe('needsShrink', () => {
  test('a PDF never, whatever its size', () => {
    expect(needsShrink('application/pdf', 5_000_000)).toBe(false)
    expect(needsShrink('application/pdf', 1)).toBe(false)
  })

  test('an image of 1,000,000 bytes or less no, one byte more yes', () => {
    expect(needsShrink('image/jpeg', 120_000)).toBe(false)
    expect(needsShrink('image/png', 1_000_000)).toBe(false)
    expect(needsShrink('image/png', 1_000_001)).toBe(true)
    expect(needsShrink('image/heic', 6_000_000)).toBe(true)
  })

  test('a file with no type is left alone', () => {
    expect(needsShrink('', 9_000_000)).toBe(false)
  })
})

describe('fitWithin', () => {
  test('the longest side is at most the limit and the shape is kept', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 })
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 })
    expect(fitWithin(8000, 8000, 2000)).toEqual({ width: 2000, height: 2000 })
  })

  test('a picture that fits is never scaled up', () => {
    expect(fitWithin(1200, 900, 2000)).toEqual({ width: 1200, height: 900 })
    expect(fitWithin(2000, 1000, 2000)).toEqual({ width: 2000, height: 1000 })
  })

  test('a very thin picture keeps at least one pixel on its short side', () => {
    expect(fitWithin(20000, 3, 2000)).toEqual({ width: 2000, height: 1 })
  })
})

describe('shrinkPhoto', () => {
  /** A canvas that records what was asked of it, and a bitmap of the size a phone gives. */
  function stubBrowser(opts: { width?: number; height?: number; blobSize?: number | null; decode?: 'ok' | 'throws' } = {}) {
    const { width = 4000, height = 3000, blobSize = 500_000, decode = 'ok' } = opts
    const canvas = {
      width: 0,
      height: 0,
      drawn: [] as number[][],
      quality: undefined as number | undefined,
      mime: undefined as string | undefined,
      getContext: () => ({ drawImage: (_b: unknown, ...a: number[]) => void canvas.drawn.push(a) }),
      toBlob: (done: (b: Blob | null) => void, mime?: string, quality?: number) => {
        canvas.mime = mime
        canvas.quality = quality
        done(blobSize === null ? null : new Blob([new Uint8Array(blobSize)], { type: mime }))
      },
    }
    const bitmap = { width, height, close: vi.fn() }
    const decoder = vi.fn(async () => {
      if (decode === 'throws') throw new Error('cannot decode')
      return bitmap
    })
    vi.stubGlobal('createImageBitmap', decoder)
    const real = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => (tag === 'canvas' ? canvas : real(tag))) as never)
    return { canvas, decoder, bitmap }
  }

  test('a PDF comes back as the same file, untouched', async () => {
    const { decoder } = stubBrowser()
    const pdf = file('plan.pdf', 'application/pdf', 5_000_000)
    expect(await shrinkPhoto(pdf)).toBe(pdf)
    expect(decoder).not.toHaveBeenCalled()
  })

  test('an image of 1,000,000 bytes or less comes back as the same file: the same bytes, the recorded answers are found by them', async () => {
    const { decoder } = stubBrowser()
    for (const small of [file('amina.png', 'image/png', 120_000), file('edge.jpg', 'image/jpeg', 1_000_000)]) {
      expect(await shrinkPhoto(small)).toBe(small)
    }
    expect(decoder).not.toHaveBeenCalled()
  })

  test('a bigger image is drawn with its longest side at 2000, written as JPEG at 0.8 and named with .jpg', async () => {
    const { canvas, decoder, bitmap } = stubBrowser({ width: 4000, height: 3000, blobSize: 400_000 })
    const photo = file('IMG_2041.HEIC.png', 'image/png', 6_000_000)
    const out = await shrinkPhoto(photo)
    expect(out).not.toBe(photo)
    expect(out.name).toBe('IMG_2041.HEIC.jpg')
    expect(out.type).toBe('image/jpeg')
    expect(out.size).toBe(400_000)
    expect(decoder).toHaveBeenCalledWith(photo, { imageOrientation: 'from-image' })
    expect([canvas.width, canvas.height]).toEqual([2000, 1500])
    expect(canvas.drawn).toEqual([[0, 0, 2000, 1500]])
    expect([canvas.mime, canvas.quality]).toEqual(['image/jpeg', 0.8])
    expect(bitmap.close).toHaveBeenCalled()
  })

  test('a name with no ending gets .jpg, and an empty name a plain one', async () => {
    stubBrowser()
    expect((await shrinkPhoto(file('photo', 'image/jpeg', 3_000_000))).name).toBe('photo.jpg')
    expect((await shrinkPhoto(file('', 'image/jpeg', 3_000_000))).name).toBe('photo.jpg')
  })

  test('an image that does not decode comes back as it was', async () => {
    stubBrowser({ decode: 'throws' })
    const photo = file('a.jpg', 'image/jpeg', 3_000_000)
    expect(await shrinkPhoto(photo)).toBe(photo)
  })

  test('a browser with no createImageBitmap at all returns the original', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    const photo = file('a.jpg', 'image/jpeg', 3_000_000)
    expect(await shrinkPhoto(photo)).toBe(photo)
  })

  test('a canvas that gives no blob, or a blob that is not smaller, returns the original', async () => {
    const photo = file('a.jpg', 'image/jpeg', 1_200_000)
    stubBrowser({ blobSize: null })
    expect(await shrinkPhoto(photo)).toBe(photo)
    vi.restoreAllMocks()
    stubBrowser({ blobSize: 1_200_000 })
    expect(await shrinkPhoto(photo)).toBe(photo)
    vi.restoreAllMocks()
    stubBrowser({ blobSize: 1_300_000 })
    expect(await shrinkPhoto(photo)).toBe(photo)
  })

  test('anything that throws while drawing returns the original', async () => {
    const { canvas } = stubBrowser()
    canvas.getContext = () => {
      throw new Error('no 2d context')
    }
    const photo = file('a.jpg', 'image/jpeg', 3_000_000)
    expect(await shrinkPhoto(photo)).toBe(photo)
  })
})
