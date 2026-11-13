import type { TopicMapDraft } from '../schemas'

// A teaching plan that lists one topic in two terms (taught, then practised) is a question for the teacher: which term is it? A
// model often keeps the topic in both terms and asks nothing. Code does not leave that to the model: after the model's answer
// and before the draft is saved, every entry of such a topic that has no question gets one. Pure functions.

type Draft = TopicMapDraft
type Entry = Draft['terms'][number]['topics'][number]

/** The name of a topic compared without case and without extra spaces. */
const sameName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * The one rule for "the same topic": two names are the same when they differ only by case or extra spaces. The question about a topic listed in
 * two terms uses it, and so does the screen that answers the question ("Keep in Term 2" removes every other entry of the same topic).
 */
export const sameTopicName = (a: string, b: string): boolean => sameName(a) === sameName(b)

/** A question counts only when it has words in it. */
const asked = (x: Entry): boolean => !!x.check && x.check.reason.trim().length > 0

const joinTerms = (terms: number[]): string => {
  const words = terms.map((t) => `Term ${t}`)
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** "Listed in Term 2 and Term 3. Which term is it taught in?" */
export function repeatedTopicQuestion(terms: number[]): string {
  return `Listed in ${joinTerms([...terms].sort((a, b) => a - b))}. Which term is it taught in?`
}

/**
 * The draft with a question on every entry of a topic that sits in two or more terms when none of its entries carries a
 * question, and how many questions were added. A topic the model already asked about is left exactly as the model made it, and
 * a draft with nothing to ask comes back as the very same object. The draft that comes in is never changed.
 */
export function askAboutRepeatedTopics(draft: Draft): { draft: Draft; added: number } {
  const termsOf = new Map<string, Set<number>>()
  const hasQuestion = new Set<string>()
  for (const t of draft.terms)
    for (const x of t.topics) {
      const key = sameName(x.name)
      termsOf.set(key, (termsOf.get(key) ?? new Set()).add(t.term))
      if (asked(x)) hasQuestion.add(key)
    }
  const toAsk = new Set([...termsOf].filter(([key, terms]) => terms.size >= 2 && !hasQuestion.has(key)).map(([key]) => key))
  if (toAsk.size === 0) return { draft, added: 0 }

  let added = 0
  const terms = draft.terms.map((t) => ({
    ...t,
    topics: t.topics.map((x) => {
      const key = sameName(x.name)
      if (!toAsk.has(key)) return x
      const all = [...termsOf.get(key)!].sort((a, b) => a - b)
      added++
      return { ...x, check: { reason: repeatedTopicQuestion(all), options: [`Keep in Term ${t.term}`, ...all.filter((n) => n !== t.term).map((n) => `Move to Term ${n}`)] } }
    }),
  }))
  return { draft: { ...draft, terms }, added }
}
