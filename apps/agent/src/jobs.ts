import type { JobName, ToolContext } from '@jemma/profiling/tools'
import { registerSpeech, runJobGuidance, runJobLongView, runJobReadPaper, runJobWriteLesson } from '@jemma/profiling/tools'
import { runJobDraftMap, runJobReadKey } from '@jemma/profiling/jobs'
import classReportPrompt from '../../../packages/profiling/src/jobs/class_report.md'
import diagnosePrompt from '../../../packages/profiling/src/jobs/diagnose.md'
import writeLessonPrompt from '../../../packages/profiling/src/jobs/write_lesson.md'
import { makeClassReportJob } from '../../../packages/profiling/src/jobs/cloud/class-report'
import { makeDiagnoseJob } from '../../../packages/profiling/src/jobs/cloud/diagnose'
import { defaultSpeech } from './speech'

/** A cloud job: calls the read tools, asks the model, saves through the save tool. */
export type CloudJob = (ctx: ToolContext, eventId: string, ids: Record<string, string>) => Promise<void>
export type CloudJobs = Partial<Record<JobName, CloudJob>>

registerSpeech(defaultSpeech)

/** Cloud job functions by job name. */
export const cloudJobs: CloudJobs = {
  draft_map: runJobDraftMap,
  read_key: runJobReadKey,
  read_paper: runJobReadPaper,
  diagnose: makeDiagnoseJob(diagnosePrompt),
  class_report: makeClassReportJob(classReportPrompt),
  write_lesson: (ctx, eventId, ids) => runJobWriteLesson(ctx, eventId, ids, { prompt: writeLessonPrompt }),
  guidance: runJobGuidance,
  long_view: runJobLongView,
}
