export type FractionProps = {
  /** `"3/4"` (stacked) or `"3 3/4"` (whole number, then stacked). Anything else renders as text. */
  value: string
  className?: string
}

const PATTERN = /^\s*(?:(\d+)\s+)?(\d+)\/(\d+)\s*$/

export function Fraction({ value, className = '' }: FractionProps) {
  const m = PATTERN.exec(value)
  if (!m) return <span className={className}>{value}</span>
  const [, whole, num, den] = m
  return (
    <span role="img" aria-label={value.trim()} className={`inline-flex items-center gap-1 font-bold ${className}`}>
      {whole ? <span data-part="whole">{whole}</span> : null}
      <span aria-hidden="true" className="inline-flex flex-col items-center leading-none">
        <span data-part="numerator" className="px-[3px] pb-0.5">
          {num}
        </span>
        <span data-part="denominator" className="border-t-[2.5px] border-ink px-[3px] pt-0.5">
          {den}
        </span>
      </span>
    </span>
  )
}
