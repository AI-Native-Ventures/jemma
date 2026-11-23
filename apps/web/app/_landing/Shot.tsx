/** The small gold diamond of the brand, used as a bullet. Only a picture: it has no words. */
export function Gem({ size = 12, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className={`flex-none ${className}`}>
      <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FFB81C" />
    </svg>
  )
}

export type ShotProps = {
  /** An address under /landing: a real screenshot of the running app, cropped, never redrawn. */
  src: string
  /** What is on the screen, in plain words. */
  alt: string
  /** The real size of the file in pixels, so the page does not jump while it loads. */
  width: number
  height: number
  /** The hero loads at once. Every other picture waits until it is near the screen. */
  priority?: boolean
  className?: string
}

/** A phone screenshot in a soft frame. It is as wide as its box, never wider, and keeps its shape. */
export function Shot({ src, alt, width, height, priority = false, className = '' }: ShotProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- plain files in /public, no image service on the Workers build
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={`block h-auto w-full rounded-[18px] border border-line bg-ground shadow-[0_8px_24px_rgba(22,22,22,0.08)] ${className}`}
    />
  )
}
