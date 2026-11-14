// The plain words that stand in a box that has nothing in it yet, so no screen shows a heading over an empty white box.
// No imports: a screen and its test read the same lines.

export type EmptyLogVariant = 'teacher' | 'parent'

/** "What Jemma did" with nothing in the log: the teacher's card is about the class, the parent's about the child. */
export function emptyLogLine(variant: EmptyLogVariant = 'teacher'): string {
  return `Nothing yet. Jemma writes here each time it does something for ${variant === 'parent' ? 'your child' : 'this class'}.`
}

/** Under "What the class doesn't get yet" when the class has no gaps: the headline already says "No class gaps yet." */
export const EMPTY_GAPS_LINE = 'Gaps show here after you mark a class test.'

/** The line to show under the gaps heading, or null when there are gaps to show instead. */
export function emptyGapsLine(gapCount: number): string | null {
  return gapCount === 0 ? EMPTY_GAPS_LINE : null
}
