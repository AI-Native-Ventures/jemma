import type { LabelDrop } from '../schemas/no-labels'

// "A profile, never a label." One list of words and one matcher, shared by every save tool that stores a text the AI wrote about a learner:
// `save_long_view` (a pattern's title and statement), `subject_guidance` (the guidance card), `class_gap_report` (the lines about learners)
// and `save_lesson` (the lines that speak to or about the learner). Pure functions, no database.

/** Words and phrases a text about a learner never uses: labels, rankings, comparisons and career talk. Matched as whole words. */
export const BANNED_WORDS = [
  'gifted',
  'genius',
  'clever',
  'bright',
  'smart',
  'slow',
  'lazy',
  'weak learner',
  'stupid',
  'dull',
  'average learner',
  'top of',
  'best in',
  'bottom of',
  'ranked',
  'rank',
  'than the class',
  'than other learners',
  'than her classmates',
  'than his classmates',
  'career',
  'job one day',
  'engineer',
  'doctor',
  'scientist',
  'should study',
  'should take',
  'should choose',
  'stream',
  'track',
] as const

const BANNED_PATTERNS = BANNED_WORDS.map((w) => ({ word: w, re: new RegExp(`\\b${w.split(' ').join('\\s+')}\\b`, 'i') }))

/**
 * Phrases that carry a banned word and mean something harmless in a maths hint: "Learners may lose track of the minus signs" says nothing about a
 * career or a ranking, and `track` alone is banned (a "track" is a school stream, "on track" is a verdict). Each phrase is taken out of the text,
 * whole and in any case, before the check, the same way an `exempt` name is. Nothing else is on this list: "on track", "fast track" and "stream"
 * stay banned. (A practice was thrown away on 16 Nov 2026 over one such hint.)
 */
export const HARMLESS_PHRASES = [
  'keep track of',
  'keeps track of',
  'kept track of',
  'keeping track of',
  'lose track of',
  'loses track of',
  'lost track of',
  'losing track of',
] as const

const HARMLESS_PATTERN = new RegExp(`\\b(?:${HARMLESS_PHRASES.map((p) => p.split(' ').join('\\s+')).join('|')})\\b`, 'gi')

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const nameRe = (name: string, flags: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, flags)

/**
 * The banned words found in `text`, each once, in the order they first appear. Case-insensitive.
 * `exempt` are names that come from the data (the subject, a strand, a topic, the title of a piece of work). Each is taken out of the
 * text, whole and in any case, before the check, so a topic called "Rank and file" or a quiz called "Track and field" never drops a pattern.
 * A name that is itself a banned word is not exempt: "Track" as a topic would otherwise hide "on track".
 * `people` are the first names of the learners the text is about. Clever, Bright, Smart and Genius are real first names, and "Clever is doing
 * well" is not a label. A first name is taken out too, even when it is a banned word, but only as it is written (capital letter and all), so
 * that "Clever is a clever learner" still has its one banned word.
 * The phrases of `HARMLESS_PHRASES` ("lose track of", "keep track of") are taken out last, so "Keep track of the signs, you are on track" still has "track".
 */
export function bannedWords(text: string, exempt: readonly string[] = [], people: readonly string[] = []): string[] {
  const names = [...new Set(exempt.map((n) => n.trim()).filter((n) => n && !BANNED_WORDS.some((w) => w === n.toLowerCase())))].sort((a, b) => b.length - a.length)
  const firstNames = [...new Set(people.map((n) => n.trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
  const named = names.reduce((out, name) => out.replace(nameRe(name, 'giu'), ' '), text)
  const clean = firstNames.reduce((out, name) => out.replace(nameRe(name, 'gu'), ' '), named).replace(HARMLESS_PATTERN, ' ')
  return BANNED_PATTERNS.flatMap(({ word, re }) => {
    const hit = re.exec(clean)
    return hit ? [{ word, at: hit.index }] : []
  })
    .sort((a, b) => a.at - b.at)
    .map((h) => h.word)
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** `uses the word "gifted"`, `uses the words "slow", "engineer"`: the reason a sentence was left out, as `save_long_view` words it. */
export const labelReason = (words: readonly string[]): string => `uses the ${plural(words.length, 'word', 'words')} ${words.map((w) => `"${w}"`).join(', ')}`

/**
 * The text in its sentences. A sentence ends at `.`, `!` or `?` (and any closing quote) that is followed by a space or the end, so a decimal
 * like 0.75 stays whole. The spaces after a sentence stay with it, and a line break does not end one (a phrase may run over a line break).
 * The pieces always join back to the text.
 */
export function sentencesOf(text: string): string[] {
  const out: string[] = []
  let start = 0
  let i = 0
  while (i < text.length) {
    if (!'.!?'.includes(text[i]!)) {
      i++
      continue
    }
    let end = i + 1
    while (end < text.length && '.!?'.includes(text[end]!)) end++
    while (end < text.length && '"\'”’)]'.includes(text[end]!)) end++
    if (end < text.length && !/\s/.test(text[end]!)) {
      i = end
      continue
    }
    while (end < text.length && /\s/.test(text[end]!)) end++
    out.push(text.slice(start, end))
    start = end
    i = end
  }
  if (start < text.length) out.push(text.slice(start))
  return out
}

const word = (list: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${list})(?![\\p{L}\\p{N}])`, 'iu')
const SAYS_YOU = word('you|your|yours|yourself|yourselves')
const NAMES_LEARNERS = word('learners?|child|children|kids?|students?|pupils?|classmates?')

/**
 * True when a sentence speaks to or about the learner: it names the learner, says you or your, or names learners in general. A lesson is full of
 * maths ("the top and bottom of one half", "a clever trick", "the track is 3/4 km"), and only a sentence like this one can put a label on a child.
 */
export function speaksAboutLearner(sentence: string, people: readonly string[] = []): boolean {
  if (SAYS_YOU.test(sentence) || NAMES_LEARNERS.test(sentence)) return true
  return people.map((n) => n.trim()).filter(Boolean).some((n) => nameRe(n, 'iu').test(sentence))
}

export type LabelCheck = {
  /** Names from the data that are left out of the word check (see `bannedWords`). */
  exempt?: readonly string[]
  /** First names of the learners the text is about. */
  people?: readonly string[]
  /** Read only the sentences that speak to or about the learner (see `speaksAboutLearner`). Default: every sentence. */
  aboutLearnerOnly?: boolean
}

/**
 * The text without its sentences that carry a banned word, and what was left out (`field` says where it was). The rest of the text is kept as it is.
 * A text with nothing to leave out comes back unchanged, spaces and all.
 */
export function leaveOutLabels(text: string, field: string, check: LabelCheck = {}): { text: string; dropped: LabelDrop[] } {
  const kept: string[] = []
  const dropped: LabelDrop[] = []
  for (const sentence of sentencesOf(text)) {
    const read = !check.aboutLearnerOnly || speaksAboutLearner(sentence, check.people)
    const found = read ? bannedWords(sentence, check.exempt, check.people) : []
    if (found.length) dropped.push({ field, text: sentence.trim(), reason: labelReason(found) })
    else kept.push(sentence)
  }
  return dropped.length ? { text: kept.join('').trim(), dropped } : { text, dropped }
}

/**
 * The plain error of a save that cannot go on because a required text had nothing left after its sentences with labels were left out.
 * The tool log keeps it with the call.
 */
export function labelsRefused(what: string, dropped: readonly LabelDrop[]): Error {
  const why = [...new Set(dropped.map((d) => d.reason))].join(' and ')
  return new Error(`Not saved: ${what} had nothing left after leaving out ${dropped.length === 1 ? 'a sentence that' : 'sentences that'} ${why}. Write it again about what was seen, with no labels, rankings or careers.`)
}
