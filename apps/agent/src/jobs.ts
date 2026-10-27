import { runJobGuidance, type JobName } from '@jemma/profiling/tools'
import diagnosePrompt from '../../../packages/profiling/src/jobs/diagnose.md'
import classReportPrompt from '../../../packages/profiling/src/jobs/class_report.md'
import { makeClassReportJob } from '../../../packages/profiling/src/jobs/cloud/class-report'
import { makeDiagnoseJob } from '../../../packages/profiling/src/jobs/cloud/diagnose'
import type { JobName } from '@jemma/profiling/tools'
import type { ToolContext } from '@jemma/profiling/tools'
import { runJobDraftMap, runJobReadKey } from '@jemma/profiling/jobs'
import { runJobReadPaper } from '@jemma/profiling/tools'
import { registerSpeech, runJobWriteLesson } from '@jemma/profiling/tools'
import writeLessonPrompt from '../../../packages/profiling/src/jobs/write_lesson.md'
import { defaultSpeech } from './speech'

/** A cloud job: calls the read tools, asks the model, saves through the save tool. */
export type CloudJob = (ctx: ToolContext, eventId: string, ids: Record<string, string>) => Promise<void>
export type CloudJobs = Partial<Record<JobName, CloudJob>>

/** Empty until the job tasks (8 to 12) register `runJob<Name>` functions here. */
export const cloudJobs: CloudJobs = {
  draft_map: runJobDraftMap,
  read_key: runJobReadKey,
  guidance: runJobGuidance,
  read_paper: runJobReadPaper,
  diagnose: makeDiagnoseJob(diagnosePrompt),
  class_report: makeClassReportJob(classReportPrompt),
}
export const cloudJobs: CloudJobs = {}

registerSpeech(defaultSpeech)
cloudJobs.write_lesson = (ctx, eventId, ids) => runJobWriteLesson(ctx, eventId, ids, { prompt: writeLessonPrompt })
