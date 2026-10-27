'use client'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-11 cursor-pointer rounded-12 border-[1.5px] border-ink bg-card px-4 text-[15px] font-semibold text-ink"
    >
      Print
    </button>
  )
}
