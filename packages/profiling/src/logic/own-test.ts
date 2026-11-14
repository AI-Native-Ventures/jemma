import { sameTopicName } from './topic-questions'

// A learner's own marked test names each question's topic in the model's own words. Code looks for the topic of the learner's approved map that
// the words mean, so the result counts under that topic. Pure functions.

/** Words that only join other words: they are never a word "in common". */
const JOINING = new Set(['of', 'and', 'the', 'a', 'an', 'to', 'in', 'on', 'for', 'with', 'by', 'or', 'from', 'at', 'is'])

/** The words of a topic name: lower case, letters and digits, without accents and without the words that only join. Each word once. */
function wordsOf(name: string): string[] {
  const words = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '' && !JOINING.has(w))
  return [...new Set(words)]
}

/**
 * The topic of the map that `name` means, or null.
 * 1. The same name by the rule of the planner (`sameTopicName`: case and extra spaces do not matter).
 * 2. Else the topic that shares the most words with `name`: at least two words, or one word of 6 letters or more. When two share the same number
 *    of words the earlier one in `topics` wins, so pass them in term order.
 * 3. Else null: the result keeps the model's words as its topic name and has no topic id.
 */
export function matchMapTopic<T extends { name: string }>(name: string, topics: readonly T[]): T | null {
  if (name.trim() === '') return null
  const exact = topics.find((t) => sameTopicName(t.name, name))
  if (exact) return exact
  const mine = new Set(wordsOf(name))
  let best: T | null = null
  let bestShared = 0
  for (const topic of topics) {
    const shared = wordsOf(topic.name).filter((w) => mine.has(w))
    const enough = shared.length >= 2 || shared.some((w) => w.length >= 6)
    if (enough && shared.length > bestShared) {
      best = topic
      bestShared = shared.length
    }
  }
  return best
}
