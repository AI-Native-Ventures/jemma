// P164: the words a family in the US reads. The app is written in South African English ("maths", "practise", "colour"); for a family whose country
// is the US the screens show the US words ("math", "practice", "color"). One pure function, used on the screens by `UsWords` and in tests.

/** South African word (lower case) and its US word. Only whole words change: "colourful" has its own pair, "Mathematics" never changes. */
const PAIRS: [string, string][] = [
  ['maths', 'math'],
  ['practise', 'practice'],
  ['practised', 'practiced'],
  ['practises', 'practices'],
  ['practising', 'practicing'],
  ['colour', 'color'],
  ['colours', 'colors'],
  ['coloured', 'colored'],
  ['colourful', 'colorful'],
  ['centre', 'center'],
  ['centres', 'centers'],
  ['centred', 'centered'],
  ['grey', 'gray'],
  ['metre', 'meter'],
  ['metres', 'meters'],
  ['centimetre', 'centimeter'],
  ['centimetres', 'centimeters'],
  ['millimetre', 'millimeter'],
  ['millimetres', 'millimeters'],
  ['kilometre', 'kilometer'],
  ['kilometres', 'kilometers'],
  ['litre', 'liter'],
  ['litres', 'liters'],
  ['millilitre', 'milliliter'],
  ['millilitres', 'milliliters'],
  ['enrol', 'enroll'],
  ['enrols', 'enrolls'],
  ['enrolment', 'enrollment'],
  ['enrolments', 'enrollments'],
]

const US = new Map(PAIRS)
// Longest first, so "practised" is found before "practise".
const WORD = new RegExp(`\\b(${[...US.keys()].sort((a, b) => b.length - a.length).join('|')})\\b`, 'gi')

/** A few phrases about marks that read wrong in the US (the landing page changes the same ones). Checked before the single words. */
const PHRASES: [RegExp, string][] = [
  [/\bmarks your answers\b/gi, 'checks your answers'],
  [/\bJemma marks it\b/gi, 'Jemma checks it'],
  [/\bno marks\b/gi, 'no grades'],
]

/** The US word for a word as it was written: all capitals stay capitals, a capital first letter stays capital. */
function inCase(found: string, us: string): string {
  if (found.length > 1 && found === found.toUpperCase()) return us.toUpperCase()
  if (found[0] === found[0]!.toUpperCase()) return us[0]!.toUpperCase() + us.slice(1)
  return us
}

/** A text with the US words in it. Text with nothing to change comes back as the very same string. */
export function usWords(text: string): string {
  if (!text) return text
  let out = text
  for (const [phrase, us] of PHRASES) out = out.replace(phrase, (found) => inCase(found, us))
  return out.replace(WORD, (found) => inCase(found, US.get(found.toLowerCase()) ?? found))
}
