import { generateText, type LanguageModel } from 'ai'
import { z } from 'zod'

/** Pulls the first complete JSON object out of a reply that may be wrapped in a markdown fence or have text around it. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1] ?? text
  const start = fenced.indexOf('{')
  if (start < 0) throw new Error('No object generated: the reply has no JSON object')
  let depth = 0
  let inString = false
  for (let i = start; i < fenced.length; i++) {
    const c = fenced[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return JSON.parse(fenced.slice(start, i + 1))
  }
  throw new Error('No object generated: the JSON object in the reply is cut off')
}

/**
 * Structured output through the prompt: the schema goes in the system text and the reply is parsed and checked with zod.
 * Free models often fail provider-side structured output on big schemas (a whole lesson) but follow this fine.
 *
 * The reply is checked with `schema` unless `parse` is given: then `parse` is the check (a looser or wider schema than the one the model is shown), and
 * the result has its type. P127 uses it so that a senior lesson is asked to have `steps` on every question, and is still read when one is missing.
 */
export async function generateJson<S extends z.ZodType, P extends z.ZodType = S>(opts: {
  model: LanguageModel
  schema: S
  parse?: P
  system: string
  prompt: string
}): Promise<z.infer<P>> {
  const { text } = await generateText({
    model: opts.model,
    system: `${opts.system}\n\nReply with one JSON object only, no markdown fences and no other text. It must match this JSON schema:\n${JSON.stringify(z.toJSONSchema(opts.schema))}`,
    prompt: opts.prompt,
  })
  return (opts.parse ?? opts.schema).parse(extractJson(text)) as z.infer<P>
}
