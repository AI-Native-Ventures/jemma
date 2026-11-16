// P125: what a senior question is about, from the name of its topic and the words of the question. P132: the maths editor's keyboard (math-keyboard.ts)
// chooses the tab it opens on from it: calculus for a derivative, functions and constants for trigonometry, geometry for angles and shapes. Pure function: no screen.

export type Strand = 'algebra' | 'trigonometry' | 'geometry' | 'functions' | 'calculus' | 'finance' | 'data'
export type TypedKind = 'number' | 'expression' | 'equation'

const wordsOf = (s: string | undefined) => (s ?? '').toLowerCase()

/** True when the question asks for a derivative. A calculus topic alone does not: only a question that asks for one gets the derivative keys. */
const asksDerivative = (text: string) => /\b(derivative|differentiate|differentiating|differentiation)\b|d\/dx|dy\/dx|f\s*['′’]\s*\(|rate of change|gradient function/.test(text)
const isTrigonometry = (text: string) => /\b(sin|cos|tan|sine|cosine|tangent|trigonometry|trigonometric|trig|radians?|degrees?)\b|°|θ|\b(sin|cos|tan)\s*[\d(²^]/.test(text)
/** Angles and shapes: the keyboard opens on the tab of the signs of geometry. */
const isGeometry = (text: string) =>
  /\b(triangles?|angles?|parallel|perpendicular|congruent|similar|quadrilaterals?|parallelograms?|polygons?|circles?|chords?|geometry|theorems?)\b|∠|△/.test(text)
const isFunctions = (text: string) =>
  /\b(function|functions|graph|graphs|gradient|intercepts?|parabola|hyperbola|asymptote|turning point|analytical|coordinates?|axis|axes|slope|midpoint|f\(x\)|straight line)\b|f\(x\)/.test(text)
const isFinance = (text: string) =>
  /\b(interest|rands?|profit|loss|discount|vat|tax|budget|salary|wages?|invest\w*|loans?|deposit|inflation|exchange rate|commission|price|cost|percent|percentage|percentages)\b|%|\br\s?\d/.test(text)
const isData = (text: string) => /\b(mean|median|mode|probability|data|frequency|quartiles?|average|histogram|chance|standard deviation|statistics|statistical)\b/.test(text)

/**
 * What a question is about, from the name of its topic and the words of the question. The first that fits wins, in this order: a derivative,
 * trigonometry, angles and shapes, functions and graphs, finance, data. Anything else is algebra.
 */
export function strandOf(topic: string | undefined, prompt: string | undefined): Strand {
  const text = `${wordsOf(topic)} ${wordsOf(prompt)}`
  if (asksDerivative(text)) return 'calculus'
  if (isTrigonometry(text)) return 'trigonometry'
  if (isGeometry(text)) return 'geometry'
  if (isFunctions(text)) return 'functions'
  if (isFinance(text)) return 'finance'
  if (isData(text)) return 'data'
  return 'algebra'
}
