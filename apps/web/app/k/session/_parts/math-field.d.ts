import type { MathfieldElement, MathfieldElementAttributes } from 'mathlive'
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

// P132: <math-field>, the maths editor, as an element JSX knows. The editor itself is loaded in the browser only (see MathAnswerField).
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': DetailedHTMLProps<HTMLAttributes<MathfieldElement>, MathfieldElement> & Partial<MathfieldElementAttributes>
    }
  }
}
