/** The small diamond of the brand, used as a bullet and as a mark. Gold unless told otherwise. Only a picture: it has no words. */
export function Gem({ size = 12, fill = '#FFB81C', className = '' }: { size?: number; fill?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className={`flex-none ${className}`}>
      <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill={fill} />
    </svg>
  )
}

export type ShotProps = {
  /** An address under /landing: a real screenshot of the running app, never redrawn. */
  src: string
  /** What is on the screen, in plain words. */
  alt: string
  /**
   * The size the picture is shown at, so the page does not jump while it loads. It is the real size of the file, or half of it for a phone
   * capture saved at twice the size.
   */
  width: number
  height: number
  /** The hero loads at once. Every other picture waits until it is near the screen. */
  priority?: boolean
  className?: string
}

/** A real screenshot of the app. It is as wide as its box, never wider. */
export function Shot({ src, alt, width, height, priority = false, className = '' }: ShotProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- plain files in /public, no image service on the Workers build
    <img src={src} alt={alt} width={width} height={height} loading={priority ? 'eager' : 'lazy'} decoding="async" className={`block w-full ${className}`} />
  )
}

/**
 * A screenshot in a dark phone frame. The frame is as wide as `--phone` (set it on the box round it, for example `[--phone:210px]`) and its
 * corners follow that width. In a tray with a fixed height and `overflow-hidden` only the top of the phone shows.
 */
export function Phone({ className = '', ...shot }: ShotProps) {
  return (
    <div
      className={`w-[var(--phone)] flex-none rounded-[calc(var(--phone)*0.16)] bg-ink p-[calc(var(--phone)*0.03)] shadow-[0_44px_64px_-34px_rgba(22,22,22,0.5),0_16px_28px_-18px_rgba(22,22,22,0.35)] ${className}`}
    >
      <div className="aspect-[390/844] overflow-hidden rounded-[calc(var(--phone)*0.13)] bg-ground">
        <Shot {...shot} className="h-full object-cover object-top" />
      </div>
    </div>
  )
}
