import type { JobName, ToolContext } from '@jemma/profiling/tools'
import { registerSpeech, runJobGuidance, runJobLongView, runJobMapRecords, runJobReadMarkedTest, runJobReadPaper, runJobWriteLesson } from '@jemma/profiling/tools'
import { runJobDraftMap, runJobReadKey } from '@jemma/profiling/jobs'
import classReportPrompt from '../../../packages/profiling/src/jobs/class_report.md'
import diagnosePrompt from '../../../packages/profiling/src/jobs/diagnose.md'
import writeLessonPrompt from '../../../packages/profiling/src/jobs/write_lesson.md'
import writeLevelCheckPrompt from '../../../packages/profiling/src/jobs/write_level_check.md'
import { makeClassReportJob } from '../../../packages/profiling/src/jobs/cloud/class-report'
import { makeDiagnoseJob } from '../../../packages/profiling/src/jobs/cloud/diagnose'
import { runJobWriteLevelCheck } from '../../../packages/profiling/src/jobs/cloud/write-level-check'
import { defaultSpeech } from './speech'
import { withUsage } from './usage'

/** A cloud job: calls the read tools, asks the model, saves through the save tool. */
export type CloudJob = (ctx: ToolContext, eventId: string, ids: Record<string, string>) => Promise<void>
export type CloudJobs = Partial<Record<JobName, CloudJob>>

registerSpeech(defaultSpeech)

/**
 * Cloud job functions by job name. Each is wrapped by `withUsage`, which saves the real tokens of the step's model calls to `ai_usage` after the step
 * (a best effort that never changes the job: see usage.ts).
 */
export const cloudJobs: CloudJobs = {
  draft_map: withUsage('draft_map', runJobDraftMap),
  read_key: withUsage('read_key', runJobReadKey),
  read_paper: withUsage('read_paper', runJobReadPaper),
  diagnose: withUsage('diagnose', makeDiagnoseJob(diagnosePrompt)),
  class_report: withUsage('class_report', makeClassReportJob(classReportPrompt)),
  write_lesson: withUsage('write_lesson', (ctx, eventId, ids) => runJobWriteLesson(ctx, eventId, ids, { prompt: writeLessonPrompt })),
  write_level_check: withUsage('write_level_check', (ctx, eventId, ids) => runJobWriteLevelCheck(ctx, eventId, ids, { prompt: writeLevelCheckPrompt })),
  guidance: withUsage('guidance', runJobGuidance),
  long_view: withUsage('long_view', runJobLongView),
  map_records: withUsage('map_records', runJobMapRecords),
  read_marked_test: withUsage('read_marked_test', runJobReadMarkedTest),
}
