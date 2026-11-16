import { MathText } from './Frac'

// P125b: the "It reads:" line under the answer box. What was typed is typeset by KaTeX (the same maths text as the question, the results and the worked
// steps): fractions stacked, a root with its radical, powers raised, sin cos tan upright, pi as the pi sign, a degree sign. Text that does not read yet
// (the child is still typing "2x^") is drawn as it was typed. The plain words go to a screen reader and the drawing is hidden from it.

export function MathPreview({ text, size, rule, gap, side, className }: { text: string; size: number; rule: number; gap: number; side: number; className?: string }) {
  return <MathText text={text} size={size} rule={rule} gap={gap} side={side} className={className} mode="force" />
}
