import type { Task } from '../lib/types'
import { classReport } from './class-report'
import { diagnose } from './diagnose'
import { fileServerConfined } from './file-server-confined'
import { guidanceSourced } from './guidance-sourced'
import { injectionInANote } from './injection-in-a-note'
import { longViewNothingToSay } from './long-view-nothing-to-say'
import { longViewPattern } from './long-view-pattern'
import { messyRecords } from './messy-records'
import { modelDownRecovery } from './model-down-recovery'
import { otherSchoolId } from './other-school-id'
import { photoThroughGoose } from './photo-through-goose'

/** The eleven tasks, in the order they run and appear in EVALS.md. Ids are fixed. */
export const TASKS: Task[] = [
  classReport,
  guidanceSourced,
  diagnose,
  longViewPattern,
  longViewNothingToSay,
  messyRecords,
  injectionInANote,
  otherSchoolId,
  modelDownRecovery,
  fileServerConfined,
  photoThroughGoose,
]

export const TASK_IDS = TASKS.map((t) => t.id)

/** Each task runs this many times, in fresh sandboxes, so run-to-run variation shows. */
export const RUNS_PER_TASK = 3

export const taskById = (id: string): Task | undefined => TASKS.find((t) => t.id === id)
