import { existsSync, readFileSync } from 'node:fs'
import { ReteachSchema } from '../../packages/profiling/src/schemas/diagnosis'
import { computeClassGaps } from '../../packages/profiling/src/tools/save/class-gap-report'
import type { ToolContext } from '../../packages/profiling/src/tools/context'
import { reportFileFor } from '../../packages/runner/src/goose'
import { check, callsTo, list, textOf } from './checks'
import { reteachRow } from './find'
import type { Check, CollectContext, Outcome } from './types'

/** Shared by the class report tasks: the saved plan, the class gaps the code finds, and the report copy in the reports folder. */

export type ReteachFact = {
  topicName: string
  content: unknown
  why: string | null
  missingBasic: string | null
  explanation: string | null
}

export type ClassReportState = {
  classId: string
  testId: string
  paperId: string
  /** The reteach row the seed made, before the run. */
  before: ReteachFact | null
}

export type ClassReportFacts = {
  /** Reteach rows for the test (the seed makes one, so after a good run there is still exactly one). */
  reteachRows: number
  reteach: ReteachFact | null
  /** The class gaps the code finds in the seeded results, best first. */
  classGapTopics: string[]
  outOf: number
  reportName: string
  /** The report copy, cut to 4000 characters. Null when the file does not exist. */
  report: string | null
  reportChars: number
  classReportActivity: number
}

const toFact = (r: { topic_name: string; content: unknown; why: string | null; missing_basic: string | null; explanation: string | null }): ReteachFact => ({
  topicName: r.topic_name,
  content: r.content,
  why: r.why,
  missingBasic: r.missing_basic,
  explanation: r.explanation,
})

export async function snapshotReteach(ctx: { admin: CollectContext['admin'] }, testId: string): Promise<ReteachFact | null> {
  const rows = await reteachRow(ctx.admin, testId)
  return rows[0] ? toFact(rows[0]) : null
}

export async function collectClassReport(ctx: CollectContext, state: ClassReportState): Promise<ClassReportFacts> {
  const toolCtx = { db: ctx.admin, schoolId: ctx.sandbox.schoolId, eventId: null } as unknown as ToolContext
  const [rows, gaps, test, activity] = await Promise.all([
    reteachRow(ctx.admin, state.testId),
    computeClassGaps(toolCtx, state.classId, state.testId),
    ctx.admin.from('tests').select('out_of').eq('id', state.testId).single(),
    ctx.admin.from('activity_log').select('id').eq('class_id', state.classId).eq('tool', 'class_gap_report').gte('at', ctx.startedAt),
  ])
  if (test.error) throw new Error(`could not read the test: ${test.error.message}`)
  const reportName = reportFileFor(ctx.reportsDir, 'class_report', state.classId)
  const text = existsSync(reportName) ? readFileSync(reportName, 'utf8') : null
  return {
    reteachRows: rows.length,
    reteach: rows[0] ? toFact(rows[0]) : null,
    classGapTopics: gaps.gaps.map((g) => g.topicName),
    outOf: test.data.out_of,
    reportName: reportName.split('/').pop() ?? reportName,
    report: text === null ? null : text.slice(0, 4000),
    reportChars: text?.length ?? 0,
    classReportActivity: activity.data?.length ?? 0,
  }
}

const STOP = new Set(['with', 'from', 'that', 'this', 'into', 'over', 'and', 'the'])

/** True when the text names the topic: its full name, or at least two of its main words (one when the name has one). */
export function mentionsTopic(text: string, topic: string): boolean {
  const hay = text.toLowerCase()
  if (hay.includes(topic.toLowerCase())) return true
  const words = topic.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w))
  const hits = words.filter((w) => hay.includes(w)).length
  return words.length > 0 && hits >= Math.min(2, words.length)
}

/** The question numbers a report cites: "Q4", "questions 1, 2 and 4". */
export function citedQuestions(text: string): number[] {
  const found = new Set<number>()
  for (const m of text.matchAll(/\b(?:questions?|qs?)(?![a-z])\.?\s*#?\d+(?:\s*(?:,|and|&|to|-)\s*(?:q\s*)?#?\d+)*/gi)) {
    for (const n of m[0].matchAll(/\d+/g)) found.add(Number(n[0]))
  }
  return [...found].sort((a, b) => a - b)
}

/** The words the model wrote. The topic name is code's, so it is not part of the text that must be about the topic. */
const reteachText = (f: ReteachFact): string => textOf([f.content, f.why, f.missingBasic, f.explanation])

/** The checks the class report tasks share. `eventCheck` is the task's own event rule. */
export function reportChecks(facts: ClassReportFacts, state: ClassReportState, outcome: Outcome): Check[] {
  const out: Check[] = []
  const r = facts.reteach
  out.push(check('exactly one reteach plan exists for the test (no double write)', facts.reteachRows === 1, `rows=${facts.reteachRows}`))
  if (!r) {
    out.push(check("the reteach plan passes the app's own schema", false, 'no reteach plan row'))
    return out
  }
  const schema = ReteachSchema.safeParse(r.content)
  out.push(
    check(
      "the reteach plan passes the app's own schema and why, missing basic and explanation are set",
      schema.success && !!r.why && !!r.missingBasic && !!r.explanation,
      schema.success ? `schema valid; why=${r.why ? 'set' : 'empty'}; missing basic=${r.missingBasic ? 'set' : 'empty'}; explanation=${r.explanation ? 'set' : 'empty'}` : schema.error.issues.map((i) => i.message).join('; ').slice(0, 160),
    ),
  )
  const changed = !state.before || state.before.why !== r.why || state.before.explanation !== r.explanation || JSON.stringify(state.before.content) !== JSON.stringify(r.content)
  out.push(check('the plan was written by this run (it differs from the seeded one)', changed, changed ? 'differs from the seeded plan' : 'identical to the seeded plan'))
  const real = facts.classGapTopics.includes(r.topicName)
  const named = facts.classGapTopics.filter((t) => mentionsTopic(reteachText(r), t))
  out.push(
    check(
      'the plan is about a real class gap in the seeded results',
      real && named.length > 0,
      `plan topic "${r.topicName}" is ${real ? '' : 'not '}one of the code's gaps [${list(facts.classGapTopics)}]; its text names: ${list(named)}`,
    ),
  )
  out.push(check('the report copy exists in the reports folder', facts.report !== null && facts.reportChars > 0, facts.report === null ? `no file ${facts.reportName}` : `${facts.reportChars} characters`))
  const cited = citedQuestions(facts.report ?? '')
  const real10 = cited.filter((n) => n >= 1 && n <= facts.outOf)
  out.push(
    check(
      'the report copy cites question numbers, all of them real',
      cited.length > 0 && real10.length === cited.length,
      cited.length === 0 ? 'no question number found' : `cites ${list(cited.map(String))} (test has ${facts.outOf} questions)`,
    ),
  )
  out.push(check('class_gap_report answered ok', callsTo(outcome.calls, 'jemma', 'class_gap_report').some((c) => c.ok), `${callsTo(outcome.calls, 'jemma', 'class_gap_report').length} call(s)`))
  return out
}
