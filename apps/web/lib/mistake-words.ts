// The words of a class gap, "3 of 5 learners ... when adding fractions.", built from the mistake label the model wrote. The label comes in two forms:
// a verb phrase ("Adds the tops") or a full sentence with a subject ("Learner may add or subtract the top and bottom numbers separately, ...").
// One helper turns either into what the learners do, with no subject and no full stop, so every sentence that joins a label reads right.
// Pure functions: no database, no browser.

const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s)
const stripDots = (s: string) => s.replace(/[.\s]+$/, '').trim()
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The label as a title: as stored, with no full stop at its end (a colon or a comma follows it). */
export function mistakeTitle(label: string): string {
  return stripDots(squash(label))
}

// "Learner", "The learner", "Learners", "Many learners", "A pupil": the subject of a label that is a sentence.
const SUBJECT = /^(?:(the|a|an|some|many|most|these|those|all|other|few)\s+)?(learners?|pupils?|students?|children|child|kids?)(?![\w'’])[\s,]*/i
const PLURAL_NOUN = /^(learners|pupils|students|children|kids)$/i
const PLURAL_WORD = /^(some|many|most|these|those|all|other|few)$/i
const RELATIVE = /^(?:who|that)\s+/i

const MODALS = new Set(['may', 'might', 'can', 'could', 'will', 'would', 'should', 'must', 'shall', 'cannot'])
const ADVERBS = new Set([
  'always', 'often', 'usually', 'sometimes', 'never', 'also', 'still', 'typically', 'frequently', 'commonly', 'simply', 'just', 'really', 'easily',
  'only', 'then', 'first', 'quickly', 'mostly', 'generally', 'regularly', 'again',
])
const IRREGULAR: Record<string, string> = { has: 'have', does: 'do', goes: 'go', is: 'are' }

/** `Adds the tops` becomes `add the tops`: the verb as it is said for many learners. A word that is not a verb with an `s` is left as it is. */
function baseVerb(word: string): string {
  const w = word.toLowerCase()
  if (IRREGULAR[w]) return IRREGULAR[w]
  if (MODALS.has(w) || ADVERBS.has(w)) return w
  if (/(ch|sh|x|ss|zz)es$/.test(w)) return w.slice(0, -2)
  if (/[^aeiou]ies$/.test(w)) return `${w.slice(0, -3)}y`
  if (w.endsWith('ss') || w.endsWith('us') || !w.endsWith('s')) return w
  return w.slice(0, -1)
}

/** The first word that is not an adverb, and the words before it: `often has trouble` is `often` and `has`. */
function inflect(words: string[], fromThirdPerson: boolean): string {
  const at = words.findIndex((w) => !ADVERBS.has(w.toLowerCase()))
  if (at < 0) return words.join(' ')
  const out = [...words]
  out[at] = fromThirdPerson ? baseVerb(words[at]!) : words[at]!
  return out.join(' ')
}

/**
 * What the learners do, from a mistake label, with no subject and no full stop:
 * `Adds the tops` gives `add the tops`; `Learner may add or subtract the top and bottom numbers separately, ...` gives `may add or subtract ...`;
 * `Learners often add the tops.` gives `often add the tops`. An empty label, or one that is only a subject, gives an empty string.
 */
export function mistakePhrase(label: string): string {
  let text = stripDots(squash(label))
  const subject = SUBJECT.exec(text)
  let singular = true
  if (subject) {
    singular = !(PLURAL_NOUN.test(subject[2]!) || (subject[1] !== undefined && PLURAL_WORD.test(subject[1])))
    text = text.slice(subject[0].length).replace(RELATIVE, '')
  }
  if (!text) return ''
  const words = lowerFirst(text).split(' ')
  // With a plural subject the verb is already the one for many learners. With a singular subject, or with none (`Adds the tops`), it ends in s.
  return inflect(words, singular)
}

export type GapWords = { count: number; total: number; shortName: string; mistake: { label: string } | null }

/** The class heading and the line under the gap: "3 of 5 learners add the tops and the bottoms when adding fractions." */
export function gapSentence(g: GapWords): string {
  const topic = lowerFirst(stripDots(g.shortName))
  const phrase = g.mistake ? mistakePhrase(g.mistake.label) : ''
  // A phrase that already has a comma in it (a long sentence) takes a comma before "when" too, so the two parts do not run into each other.
  return phrase
    ? `${g.count} of ${g.total} learners ${phrase}${phrase.includes(',') ? ',' : ''} when ${topic}.`
    : `${g.count} of ${g.total} learners are stuck on ${topic}.`
}

/** The short line of the gap page when no reteach plan says why: "4 of 5 add the tops and the bottoms." */
export function whyLine(count: number, total: number, mistake: { label: string } | null): string {
  const phrase = mistake ? mistakePhrase(mistake.label) : ''
  return phrase ? `${count} of ${total} ${phrase}.` : `${count} of ${total} are stuck on this.`
}
