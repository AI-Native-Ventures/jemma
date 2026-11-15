import { z } from 'zod'

/**
 * A sentence (or an item) a save tool left out because it carried a label, a ranking or career talk (`logic/no-labels.ts`).
 * It is part of the tool's output, so it is on the tool log with the call.
 */
export const LabelDropSchema = z.object({
  /** Where it was, in plain words: `headline`, `focus item 2 why`, `spoken script`, `question 3 right way`. */
  field: z.string(),
  /** The sentence that was left out. Empty text is never written here: a sentence is always a few words. */
  text: z.string(),
  /** Why, for example `uses the word "gifted"`. */
  reason: z.string(),
})
export type LabelDrop = z.infer<typeof LabelDropSchema>
