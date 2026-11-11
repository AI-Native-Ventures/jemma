import { generateText, Output } from 'ai'
import { z } from 'zod'
import { getModel } from '../../ai'
import { renderPrompt } from '../../ai/prompt-variants'
import { classContext } from '../../ai/subject-profile'
import { ReteachSchema } from '../../schemas/diagnosis'
import { contextFor, type ToolContext } from '../../tools/context'
import { classGapReport, computeClassGaps } from '../../tools/save/class-gap-report'
import type { JobDeps } from './diagnose'

const OutputSchema = z.object({ why: z.string(), missingBasic: z.string(), explanation: z.string(), reteach: ReteachSchema })

/**
 * Cloud job `class_report`: gaps are computed in code; the model writes the why sentence and the
 * reteach for gap 1 only, and `class_gap_report` saves them.
 */
export function makeClassReportJob(prompt: string, deps: JobDeps = {}) {
  return async (ctx: ToolContext, _eventId: string, ids: Record<string, string>): Promise<void> => {
    const { classId, testId } = ids
    if (!classId || !testId) throw new Error('class_report needs classId and testId')
    const here = await contextFor(ctx, 'classes', classId)
    const { gaps, names } = await computeClassGaps(here, classId, testId)
    const top = gaps[0]
    if (!top) {
      await classGapReport.run(here, { classId, testId, why: '', reteach: { title: '', minutes: 0, audience: '', youNeed: '', steps: [], exitQuestion: '' } })
      return
    }
    const klass = await classContext(here.db, { classId })
    const { output: object } = await generateText({
      model: deps.model ?? getModel('text', ctx.env),
      output: Output.object({ schema: OutputSchema }),
      system: renderPrompt('class_report', prompt, klass),
      prompt: [
        `Gap 1 of ${gaps.length}: ${top.topicName}`,
        `Most common mistake: ${top.mistake.label} (${top.mistake.count} answers), for example ${top.mistake.example}`,
        '<untrusted>',
        JSON.stringify(top.learners.map((l) => ({ name: names.get(l.childId) ?? '', wrote: l.wrote }))),
        '</untrusted>',
      ].join('\n'),
    })
    await classGapReport.run(here, { classId, testId, ...object })
  }
}
