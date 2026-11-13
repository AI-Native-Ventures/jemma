import { generateText, Output } from 'ai'
import { z } from 'zod'
import { getModel } from '../../ai'
import { documentsText } from '../../ai/pdf-text'
import { renderPrompt } from '../../ai/prompt-variants'
import { classContext, isBaselineClass } from '../../ai/subject-profile'
import type { TopicMapDraft } from '../../schemas'
import { contextFor, defineTool, isWithImages, type ToolContext } from '../../tools/context'
import { getCurriculumDoc } from '../../tools/read/get-curriculum-doc'
import { saveTopicMapDraft } from '../../tools/save/save-topic-map-draft'
import prompt from '../draft_map.md'

export type DraftMapDeps = {
  getModel: typeof getModel
  readDoc: (ctx: ToolContext, input: { mapId: string }) => ReturnType<typeof getCurriculumDoc.run>
}

const defaults: DraftMapDeps = { getModel, readDoc: (ctx, input) => getCurriculumDoc.run(ctx, input) }
const OutputSchema = z.object({ draft: saveTopicMapDraft.input.shape.draft })

/** How the documents were read: the vision model looked at the pages, or the text model read the text of a typed PDF. */
export type ReadWay = 'vision' | 'text'
export type DraftResult = { draft: TopicMapDraft; modelId: string | null }

export const topicsIn = (d: TopicMapDraft): number => d.terms.reduce((n, t) => n + t.topics.length, 0)

/**
 * The draft with only the terms that have topics, in order. A document with three terms gives a map with three terms: the
 * model is told terms run "1 to 4", and an empty fourth one is not a term of this school year. No topic changes term.
 */
export function withoutEmptyTerms(draft: TopicMapDraft): TopicMapDraft {
  return { ...draft, terms: draft.terms.filter((t) => t.topics.length > 0).sort((a, b) => a.term - b.term) }
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * Vision first, exactly as it always was. Only when that fails (after the retries and fallbacks inside the model) or gives no
 * topic, `text` is asked: it returns null when the documents have no text layer (then the first error stays and the teacher gets
 * the retry card as before), or the draft of the text model.
 */
export async function readWithFallback(ways: {
  vision: () => Promise<DraftResult>
  text: () => Promise<DraftResult | null>
}): Promise<DraftResult & { way: ReadWay; visionProblem: string | null }> {
  let firstError: unknown = null
  let visionProblem: string
  try {
    const seen = await ways.vision()
    if (topicsIn(seen.draft) > 0) return { ...seen, way: 'vision', visionProblem: null }
    visionProblem = 'the vision model returned no topic'
  } catch (err) {
    firstError = err
    visionProblem = messageOf(err)
  }
  const second = await ways.text()
  if (second === null) throw firstError ?? new Error('draft has no topics')
  if (topicsIn(second.draft) === 0) throw new Error('draft has no topics')
  return { ...second, way: 'text', visionProblem }
}

/**
 * The tool log row that says which way read the documents. It is not a tool offered to agents: it only writes the same kind
 * of row as every tool call, with the model that answered.
 */
const readDocuments = defineTool({
  name: 'read_documents',
  description: 'Not offered to agents. Written by the draft_map job: which way the curriculum documents were read, and why.',
  input: z.object({
    mapId: z.string(),
    way: z.enum(['vision', 'text']),
    /** Why the first way was not enough, or null when it was. */
    visionProblem: z.string().nullable(),
    documents: z.number(),
    topics: z.number(),
    terms: z.number(),
  }),
  output: z.object({ way: z.enum(['vision', 'text']), topics: z.number(), terms: z.number() }),
  async run(_ctx, input) {
    return { way: input.way, topics: input.topics, terms: input.terms }
  },
})

/** draft_map: read the curriculum documents, ask the model for the map, save it through the save tool. */
export async function runDraftMap(
  base: ToolContext,
  _eventId: string | null,
  ids: Record<string, string>,
  deps: Partial<DraftMapDeps> = {},
): Promise<void> {
  const { getModel: model, readDoc } = { ...defaults, ...deps }
  const mapId = ids.mapId
  if (!mapId) throw new Error('draft_map needs a mapId')
  const ctx = await contextFor(base, 'curriculum_maps', mapId)

  const read = await readDoc(ctx, { mapId })
  const o = isWithImages(read) ? read.output : read
  const images = isWithImages(read) ? read.images : []

  // The class is loaded here, not through a model tool. For Mathematics, Grade 6, South Africa nothing below changes: the system
  // text is the file and the header is the one a recorded answer was made with.
  const klass = await classContext(ctx.db, { mapId })
  const header = isBaselineClass(klass)
    ? `Class grade: ${o.classGrade}. Draft the topic map for this grade only.`
    : `Class grade: ${o.classGrade}. Subject: ${o.classSubject ?? klass!.subject}. Draft the topic map for this grade and subject only.`
  const files = images.map((f) => ({ type: 'file' as const, data: f.data, mediaType: f.mimeType }))
  const system = renderPrompt('draft_map', prompt, klass)

  const found = await readWithFallback({
    // The first call, as it has always been made: the recorded answer for the sample plan is found by this call.
    vision: async () => {
      const result = await generateText({
        model: model(o.text ? 'text' : 'vision', ctx.env),
        system,
        output: Output.object({ schema: OutputSchema }),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `${header}\n\n<untrusted>\n${o.text ?? 'The documents follow as files.'}` },
              ...files,
              { type: 'text', text: '</untrusted>' },
            ],
          },
        ],
      })
      return { draft: result.output.draft, modelId: result.response?.modelId ?? null }
    },
    // The second way: the same prompt and header, the text of the documents instead of their pictures.
    text: async () => {
      const text = await documentsText(images)
      if (text === null) return null
      const result = await generateText({
        model: model('text', ctx.env),
        system,
        output: Output.object({ schema: OutputSchema }),
        messages: [{ role: 'user', content: [{ type: 'text', text: `${header}\n\n<untrusted>\n${text}\n</untrusted>` }] }],
      })
      return { draft: result.output.draft, modelId: result.response?.modelId ?? null }
    },
  })

  const draft = withoutEmptyTerms(found.draft)
  await saveTopicMapDraft.run(ctx, { mapId, draft })
  await readDocuments.run(
    { ...ctx, model: found.modelId },
    { mapId, way: found.way, visionProblem: found.visionProblem, documents: o.docs.length, topics: topicsIn(draft), terms: draft.terms.length },
  )
}

export const runJobDraftMap = (ctx: ToolContext, eventId: string, ids: Record<string, string>) => runDraftMap(ctx, eventId, ids)
