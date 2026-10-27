import { generateText, Output } from 'ai'
import { z } from 'zod'
import { getModel } from '../../ai'
import { contextFor, isWithImages, type ToolContext } from '../../tools/context'
import { getMemo } from '../../tools/read/get-memo'
import { saveAnswerKey } from '../../tools/save/save-answer-key'
import prompt from '../read_key.md'

export type ReadKeyDeps = {
  getModel: typeof getModel
  readMemo: (ctx: ToolContext, input: { testId: string }) => ReturnType<typeof getMemo.run>
}

const defaults: ReadKeyDeps = { getModel, readMemo: (ctx, input) => getMemo.run(ctx, input) }
const OutputSchema = z.object({ items: saveAnswerKey.input.shape.items })

/** read_key: read the memo photo, ask the vision model for the key, save it through the save tool. */
export async function runReadKey(
  base: ToolContext,
  _eventId: string | null,
  ids: Record<string, string>,
  deps: Partial<ReadKeyDeps> = {},
): Promise<void> {
  const { getModel: model, readMemo } = { ...defaults, ...deps }
  const testId = ids.testId
  if (!testId) throw new Error('read_key needs a testId')
  const ctx = await contextFor(base, 'tests', testId)

  const read = await readMemo(ctx, { testId })
  const memo = isWithImages(read) ? read.output : read
  const images = isWithImages(read) ? read.images : []
  if (images.length === 0) throw new Error('no memo photo to read for this test')

  const result = await generateText({
    model: model('vision', ctx.env),
    system: prompt,
    output: Output.object({ schema: OutputSchema }),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Test: ${memo.title}, out of ${memo.outOf}.\nApproved topic names:\n- ${memo.topicNames.join('\n- ')}\n\n<untrusted>\nThe memo photos follow as files.`,
          },
          ...images.map((f) => ({ type: 'file' as const, data: f.data, mediaType: f.mimeType })),
          { type: 'text', text: '</untrusted>' },
        ],
      },
    ],
  })
  await saveAnswerKey.run(ctx, { testId, items: result.output.items })
}

export const runJobReadKey = (ctx: ToolContext, eventId: string, ids: Record<string, string>) => runReadKey(ctx, eventId, ids)
