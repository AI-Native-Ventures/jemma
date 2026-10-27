/** The jemma wordmark from docs/brand, inline so Outfit applies to the letters. */
export function Wordmark({ width, height, style }: { width: number; height: number; style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="4 12 236 92" width={width} height={height} role="img" aria-label="jemma" style={{ display: 'block', ...style }}>
      <path d="M32 46 V80 C32 91 24 95 13 93" fill="none" stroke="#1F1D36" strokeWidth="9.5" strokeLinecap="round" />
      <polygon points="32,19 40,27 32,35 24,27" fill="#FF6A4D" />
      <text x="43" y="80" fill="#1F1D36" fontFamily="var(--font-outfit), Outfit, system-ui, sans-serif" fontSize="66" fontWeight="700">
        emma
      </text>
    </svg>
  )
}
