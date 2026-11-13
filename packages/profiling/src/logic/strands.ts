// The strands of a subject: the plain names the Long view shows for a `family`, and the order they come in.
// Pure functions. A subject or a family that is not listed here is tidied into plain words, never dropped.

/** What a record with a family but no subject counts as. (Rows an older seed wrote have no subject.) */
export const DEFAULT_SUBJECT = 'Mathematics'

/** Each subject's strands in the order they are shown, with their labels. */
const STRANDS: Record<string, [family: string, label: string][]> = {
  mathematics: [
    ['whole_numbers', 'Whole numbers'],
    ['fractions', 'Fractions'],
    ['decimals', 'Decimals'],
    ['shapes', 'Shapes and space'],
    ['measurement', 'Measurement'],
    ['data', 'Data handling'],
  ],
  english: [
    ['reading', 'Reading'],
    ['writing', 'Writing'],
    ['language', 'Language'],
    ['speaking_listening', 'Speaking and listening'],
  ],
  'natural sciences': [
    ['life_living', 'Life and living'],
    ['matter_materials', 'Matter and materials'],
    ['energy_change', 'Energy and change'],
    ['earth_beyond', 'Planet Earth and beyond'],
  ],
  'social sciences': [
    ['history', 'History'],
    ['geography', 'Geography'],
  ],
}

/** The order subjects are listed in. A subject that is not here comes after these, in alphabetical order. */
const SUBJECT_ORDER = ['mathematics', 'english', 'natural sciences', 'social sciences']

/** `Maths` and `mathematics ` both find Mathematics. Any other name is found by its lower case. */
function subjectKey(subject: string): string {
  const key = subject.trim().toLowerCase()
  return key === 'maths' || key === 'math' ? 'mathematics' : key
}

/** The way a subject's name is written on the screen. */
const SUBJECT_NAMES: Record<string, string> = {
  mathematics: 'Mathematics',
  english: 'English',
  'natural sciences': 'Natural Sciences',
  'social sciences': 'Social Sciences',
}

/**
 * One name for one subject: `Maths`, `maths` and ` mathematics ` are all `Mathematics`, so a class that says Maths and records that say
 * Mathematics are one subject. A subject that is not one of the usual four keeps its name, trimmed.
 */
export function canonicalSubject(subject: string): string {
  return SUBJECT_NAMES[subjectKey(subject)] ?? subject.trim()
}

/** True when two names are the same subject: `Maths` and `mathematics ` are. */
export const sameSubject = (a: string, b: string): boolean => subjectKey(a) === subjectKey(b)

/** `patterns_and_algebra` becomes `Patterns and algebra`. An empty name is `Other`. */
function humanise(family: string): string {
  const words = family.replace(/[_-]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Other'
}

/** The plain form of a word: lower case, trimmed, `_` and `-` read as spaces, a run of spaces as one. */
const plainWords = (word: string): string => word.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * The words a model or a file may use for a Mathematics strand (in their plain form), and the family each one is. A map the model
 * drafted says `numbers` and `shape`; the demo seed and the records a teacher brings in say `whole_numbers` and `shapes`.
 */
const MATHS_WORDS: Record<string, string[]> = {
  whole_numbers: [
    'whole numbers',
    'whole number',
    'numbers',
    'number',
    'number operations',
    'numbers and operations',
    'numbers operations and relationships',
    'operations',
    'number sense',
    'place value',
    'counting',
  ],
  fractions: ['fractions', 'fraction', 'common fractions'],
  decimals: ['decimals', 'decimal', 'decimal fractions'],
  shapes: ['shapes', 'shape', 'shapes and space', 'shape and space', 'space and shape', 'geometry', 'space'],
  measurement: ['measurement', 'measurements', 'measuring', 'measure'],
  data: ['data', 'data handling', 'statistics', 'graphs'],
}

const MATHS_FAMILY_OF = new Map(Object.entries(MATHS_WORDS).flatMap(([family, words]) => words.map((w) => [w, family] as const)))

/**
 * One name for one strand, for READING only (nothing stored is changed): the family a word stands for in a subject. For Mathematics the
 * words of `MATHS_WORDS` give their family. For every subject a word whose plain form equals that of one of the subject's strand keys or
 * labels gives that key (`Speaking and listening` is `speaking_listening`). Any other word gives its plain form with `_` for spaces
 * (`Patterns and Algebra` is `patterns_and_algebra`). An empty word stays empty.
 */
export function canonicalFamily(subject: string, family: string): string {
  const plain = plainWords(family)
  if (!plain) return ''
  const key = subjectKey(subject)
  if (key === 'mathematics') {
    const known = MATHS_FAMILY_OF.get(plain)
    if (known) return known
  }
  const own = STRANDS[key]?.find(([f, label]) => plainWords(f) === plain || plainWords(label) === plain)
  return own ? own[0] : plain.replace(/ /g, '_')
}

/** The plain name of a strand in a subject. */
export function strandLabel(subject: string, family: string): string {
  return STRANDS[subjectKey(subject)]?.find(([f]) => f === family)?.[1] ?? humanise(family)
}

/** The strands of a subject, in the order they are shown. An unknown subject has none: its strands come after, tidied and alphabetical. */
export function strandOrder(subject: string): string[] {
  return (STRANDS[subjectKey(subject)] ?? []).map(([family]) => family)
}

/** For sorting subjects: Mathematics, English, Natural Sciences, Social Sciences, then any other by name. */
export function compareSubjects(a: string, b: string): number {
  const ia = SUBJECT_ORDER.indexOf(subjectKey(a))
  const ib = SUBJECT_ORDER.indexOf(subjectKey(b))
  return (ia < 0 ? SUBJECT_ORDER.length : ia) - (ib < 0 ? SUBJECT_ORDER.length : ib) || a.localeCompare(b)
}
