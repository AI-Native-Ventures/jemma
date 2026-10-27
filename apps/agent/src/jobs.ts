import type { JobName } from '@jemma/profiling/tools'
import type { ToolContext } from '@jemma/profiling/tools'
import { runJobReadPaper } from '@jemma/profiling/tools'

/** A cloud job: calls the read tools, asks the model, saves through the save tool. */
export type CloudJob = (ctx: ToolContext, eventId: string, ids: Record<string, string>) => Promise<void>
export type CloudJobs = Partial<Record<JobName, CloudJob>>

/** Empty until the job tasks (8 to 12) register `runJob<Name>` functions here. */
export const cloudJobs: CloudJobs = {
  read_paper: runJobReadPaper,
}
