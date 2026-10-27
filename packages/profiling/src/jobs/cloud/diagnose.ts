import { generateText, Output, type LanguageModel } from 'ai'
import { z } from 'zod'
import { getModel } from '../../ai'
import { DiagnosisSchema } from '../../schemas/diagnosis'
import { contextFor, type ToolContext } from '../../tools/context'
import { loadDiagnoseInputs, updateLearnerProfile } from '../../tools/save/update-learner-profile'

export type JobDeps = { model?: LanguageModel }

const OutputSchema = z.object({ diagnoses: DiagnosisSchema })

/**
 * Cloud job `diagnose`: reads one learner's wrong answers, asks the model for the diagnosis
 * (the save tool's object) and saves it through `update_learner_profile`.
 */
export function makeDiagnoseJob(prompt: string, deps: JobDeps = {}) {
  return async (ctx: ToolContext, _eventId: string, ids: Record<string, string>): Promise<void> => {
    const childId = ids.childId
    if (!childId || (!ids.testId && !ids.paperId)) throw new Error('diagnose needs childId and testId or paperId')
    const here = await contextFor(ctx, 'children', childId)
    const scope = ids.testId ? { testId: ids.testId } : { paperId: ids.paperId }
    const inputs = await loadDiagnoseInputs(here, { childId, ...scope })
    if (inputs.wrong.length === 0) return
    const { output: object } = await generateText({
      model: deps.model ?? getModel('text', ctx.env),
      output: Output.object({ schema: OutputSchema }),
      system: prompt,
      prompt: [
        `Topics you may name as the gap topic: ${JSON.stringify(inputs.topicNames)}`,
        '<untrusted>',
        JSON.stringify(inputs.wrong.map((w) => ({ resultId: w.resultId, question: w.n, prompt: w.prompt, answerRead: w.answerRead, topic: w.topicName, knownMistakes: w.labels }))),
        '</untrusted>',
      ].join('\n'),
    })
    await updateLearnerProfile.run(here, { childId, ...scope, diagnoses: object.diagnoses })
  }
}
