'use client'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-12 cursor-pointer rounded-14 border-[1.5px] border-ink bg-card px-4 text-[16px] font-semibold text-ink"
    >
      Print
    </button>
  )
}
