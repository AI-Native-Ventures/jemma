import type { ReactNode } from 'react'

export type PaperCropProps = {
  children: ReactNode
  caption?: ReactNode
}

/**
 * Shell for a photographed paper: lavender mat, cream sheet, printed Arial text.
 * Handwriting inside it uses `Handwriting`.
 */
export function PaperCrop({ children, caption }: PaperCropProps) {
  return (
    <figure className="m-0 flex flex-col gap-2.5 leading-[normal]">
      <div className="rounded-20 bg-soft-3 p-3">
        <div className="rounded-md bg-[#FBFAF5] px-3.5 pt-4 pb-2.5 font-[Arial,Helvetica,sans-serif] text-[#2A2A2A] shadow-[0_4px_14px_rgba(31,29,54,0.12)]">
          {children}
        </div>
      </div>
      {caption ? <figcaption className="text-[14px] text-body">{caption}</figcaption> : null}
    </figure>
  )
}

/** A learner's pen on the paper (Kalam, navy). The only place Kalam is used. */
export function Handwriting({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <span className="font-hand leading-none text-navy" style={{ fontSize: size }}>
      {children}
    </span>
  )
}
