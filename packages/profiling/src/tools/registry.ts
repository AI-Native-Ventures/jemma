import { completeJob } from './complete-job'
import { type ToolDef } from './context'
import { getChildContext } from './read/get-child-context'
import { getClassResults } from './read/get-class-results'
import { getCurriculumDoc } from './read/get-curriculum-doc'
import { getJob } from './read/get-job'
import { getLearnerProfile } from './read/get-learner-profile'
import { getMemo } from './read/get-memo'
import { getPaper } from './read/get-paper'
import { planNextSession } from './save/plan-next-session'
import { saveLesson } from './save/save-lesson'

export { defineTool } from './context'
export type { ToolDef } from './context'

/** Every MCP tool the Jemma server exposes. Save tools from later tasks are added here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const registry: ToolDef<any, any>[] = [
  getLearnerProfile,
  getJob,
  getCurriculumDoc,
  getMemo,
  getPaper,
  getClassResults,
  getChildContext,
  completeJob,
  planNextSession,
  saveLesson,
]

export { registerSpeech } from '../speech'
export type { SpeechSynth } from '../speech'
export { runJobWriteLesson } from '../jobs/cloud/write-lesson'
