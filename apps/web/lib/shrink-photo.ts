/** A photo of this many bytes or fewer is sent as it is: the sample photos are about 120 KB, and a recorded answer is found by the bytes of the file. */
export const SHRINK_OVER_BYTES = 1_000_000

/** The longest side of a photo that was made smaller, in pixels. */
export const MAX_SIDE = 2000

/** The quality of the JPEG that is written. */
const QUALITY = 0.8

/** Only an image over 1,000,000 bytes is made smaller. A PDF, and anything that is not an image, never is. */
export const needsShrink = (type: string, size: number): boolean => type.startsWith('image/') && size > SHRINK_OVER_BYTES

/** The size a picture is drawn at so its longest side is at most `maxSide`. The shape is kept and a picture is never scaled up. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** The name without its ending, with `.jpg`. */
const jpgName = (name: string) => `${name.replace(/\.[^./]*$/, '') || 'photo'}.jpg`

/**
 * Makes a big photo smaller in the browser before it is sent, so a phone photo of 3 to 8 MB is a few hundred KB. A file that is
 * not an image, or is 1,000,000 bytes or less, comes back as the same file (same bytes). A bigger image is drawn on a canvas, its
 * longest side at most 2000 px, and written as a JPEG. When the browser cannot decode it, when anything throws, or when the result
 * is not smaller than the original, the original comes back: a photo is never lost to this.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (!needsShrink(file.type, file.size)) return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_SIDE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', QUALITY))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], jpgName(file.name), { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}
