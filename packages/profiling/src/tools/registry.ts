import { completeJob } from './complete-job'
import { type ToolDef } from './context'
import { getChildContext } from './read/get-child-context'
import { getClassResults } from './read/get-class-results'
import { getCurriculumDoc } from './read/get-curriculum-doc'
import { getJob } from './read/get-job'
import { getLearnerHistory } from './read/get-learner-history'
import { getLearnerProfile } from './read/get-learner-profile'
import { getMemo } from './read/get-memo'
import { getPaper } from './read/get-paper'
import { getPracticePaper } from './read/get-practice-paper'
import { saveAnswerKey } from './save/save-answer-key'
import { saveTopicMapDraft } from './save/save-topic-map-draft'
import { addActivity, addObservation, logExternalCalls, recordAttendance, subjectGuidance } from './save'
import { markPaper } from './save/mark-paper'
import { savePracticeAnswers } from './save/save-practice-answers'
import { classGapReport } from './save/class-gap-report'
import { updateLearnerProfile } from './save/update-learner-profile'
import { planNextSession } from './save/plan-next-session'
import { saveLesson } from './save/save-lesson'
import { saveLongView } from './save/save-long-view'
import { getRecordImport } from './read/get-record-import'
import { saveRecordMapping } from './save/save-record-mapping'
import { importLearnerRecords } from './save/import-learner-records'

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
  saveTopicMapDraft,
  saveAnswerKey,
  subjectGuidance,
  addObservation,
  recordAttendance,
  addActivity,
  markPaper,
  updateLearnerProfile,
  classGapReport,
  planNextSession,
  saveLesson,
  logExternalCalls,
  getLearnerHistory,
  saveLongView,
  getRecordImport,
  saveRecordMapping,
  importLearnerRecords,
  getPracticePaper,
  savePracticeAnswers,
]

export { registerSpeech } from '../speech'
export type { SpeechSynth } from '../speech'
export { runJobWriteLesson } from '../jobs/cloud/write-lesson'
