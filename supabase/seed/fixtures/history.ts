// Amina's Term 3 history: one marked paper (no test), format trials and fixed gaps.
// Percentages by topic: Adding fractions with different denominators 50, Adding decimals 50,
// Comparing fractions 60, Fractions and decimals 75, Fraction of a quantity 100.

export type HistoryRow = { topic: string; prompt: string; wrote: string; correct: boolean; misconception?: string }

const TOPS = 'Adds the tops and the bottoms'

export const TERM3_ROWS: HistoryRow[] = [
  { topic: 'Adding fractions with different denominators', prompt: '1/4 + 1/2', wrote: '3/4', correct: true },
  { topic: 'Adding fractions with different denominators', prompt: '1/2 + 1/3', wrote: '2/5', correct: false, misconception: TOPS },
  { topic: 'Adding decimals', prompt: '0,3 + 0,4', wrote: '0,7', correct: true },
  { topic: 'Adding decimals', prompt: '0,25 + 0,5', wrote: '0,30', correct: false, misconception: 'Lines up the last digits' },
  { topic: 'Comparing fractions', prompt: 'Bigger: 3/4 or 2/3', wrote: '3/4', correct: true },
  { topic: 'Comparing fractions', prompt: 'Bigger: 1/2 or 3/8', wrote: '1/2', correct: true },
  { topic: 'Comparing fractions', prompt: 'Bigger: 2/5 or 1/3', wrote: '2/5', correct: true },
  { topic: 'Comparing fractions', prompt: 'Bigger: 3/4 or 5/6', wrote: '3/4', correct: false, misconception: 'Thinks bigger numbers make a bigger fraction' },
  { topic: 'Comparing fractions', prompt: 'Bigger: 4/7 or 3/5', wrote: '4/7', correct: false, misconception: 'Thinks bigger numbers make a bigger fraction' },
  { topic: 'Fractions and decimals', prompt: '1/2 as a decimal', wrote: '0,5', correct: true },
  { topic: 'Fractions and decimals', prompt: '1/4 as a decimal', wrote: '0,25', correct: true },
  { topic: 'Fractions and decimals', prompt: '3/4 as a decimal', wrote: '0,75', correct: true },
  { topic: 'Fractions and decimals', prompt: '1/5 as a decimal', wrote: '0,5', correct: false },
  { topic: 'Fraction of a quantity', prompt: '1/2 of 18', wrote: '9', correct: true },
  { topic: 'Fraction of a quantity', prompt: '1/4 of 20', wrote: '5', correct: true },
]

/** Format trials for Amina, topic family `fractions`: diagram 4,4,5,4,4; reading 3,3,3; audio 3. */
export const FORMAT_TRIALS: { format: 'diagram' | 'reading' | 'audio'; score: number }[] = [
  { format: 'diagram', score: 4 },
  { format: 'reading', score: 3 },
  { format: 'diagram', score: 4 },
  { format: 'audio', score: 3 },
  { format: 'diagram', score: 5 },
  { format: 'reading', score: 3 },
  { format: 'diagram', score: 4 },
  { format: 'reading', score: 3 },
  { format: 'diagram', score: 4 },
]
export const FORMAT_FAMILY = 'fractions'

export const FIXED_GAPS = ['Equivalent fractions', 'Ordering whole numbers', 'Rounding off']
