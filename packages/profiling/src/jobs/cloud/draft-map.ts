import { generateText, Output } from 'ai'
import { z } from 'zod'
import { getModel } from '../../ai'
import { contextFor, isWithImages, type ToolContext } from '../../tools/context'
import { getCurriculumDoc } from '../../tools/read/get-curriculum-doc'
import { saveTopicMapDraft } from '../../tools/save/save-topic-map-draft'
import prompt from '../draft_map.md'

export type DraftMapDeps = {
  getModel: typeof getModel
  readDoc: (ctx: ToolContext, input: { mapId: string }) => ReturnType<typeof getCurriculumDoc.run>
}

const defaults: DraftMapDeps = { getModel, readDoc: (ctx, input) => getCurriculumDoc.run(ctx, input) }
const OutputSchema = z.object({ draft: saveTopicMapDraft.input.shape.draft })

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

  const header = `Class grade: ${o.classGrade}. Draft the topic map for this grade only.`
  const files = images.map((f) => ({ type: 'file' as const, data: f.data, mediaType: f.mimeType }))
  const result = await generateText({
    model: model(o.text ? 'text' : 'vision', ctx.env),
    system: prompt,
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
  await saveTopicMapDraft.run(ctx, { mapId, draft: result.output.draft })
}

export const runJobDraftMap = (ctx: ToolContext, eventId: string, ids: Record<string, string>) => runDraftMap(ctx, eventId, ids)
