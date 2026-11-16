import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { TeachingLessonSchema, TopicLessonsSchema, type TeachingLesson, type TeachingSource, type TopicLessons } from '@jemma/profiling/schemas'
import { backendFromEnv, limitParkMsFor, modelsFor, runnerFor } from './backend'
import { Chain, FatalBackendError, callJson, type Attempt } from './chain'
import { checkLesson, tidyLesson } from './checks'
import { appendLedger, readLedger, summarize, summarizeByKind, sumCost, type LedgerRecord } from './ledger'
import { runOpencode, type Runner } from './opencode'
import { OutlineSchema, ReviewSchema, lessonRange, outlinePrompt, reviewPrompt, writePrompt, type Outline } from './build-prompts'
import { referenceFor, type Reference } from './sources'
import { PITCH_TOPICS, REPO_ROOT, SAMPLE_TOPICS, lessonPath, topicFileNames, topicGroups, type TopicGroup } from './topics'

/**
 * The generator. For each topic: the reference, an outline (1 to 8 lessons), then for each lesson a write call, the code checks, a review call by
 * a different model, and one rewrite with the problems listed when anything is wrong. Every call goes to the ledger. It can be stopped and started
 * again at any time: finished topics are skipped, a half done topic carries on from its saved lessons, and every file is written whole (temp file
 * and rename). Nothing here touches a database or a server.
 */

const MIN = 60_000
const CAP_ERROR = 'call cap reached'
const BUDGET_ERROR = 'budget reached'
const FAIL_TWICE = 2

export type GenOptions = {
  root?: string
  chain: Chain
  /** Replaces `runOpencode` (tests). */
  run?: Runner
  reference?: (group: TopicGroup) => Promise<Reference>
  sleep?: (ms: number) => Promise<void>
  log?: (line: string) => void
  now?: () => Date
  timeoutMs?: number
  /** The longest the whole run may wait for models that are out of free quota. 0 means never wait. */
  maxWaitMs?: number
  /** Stop after this many calls in the ledger (hand made ones included). */
  limitCalls?: number
  /** Stop when the dollars in the ledger (every run, every backend) reach this much. */
  maxUsd?: number
  /** Try again topics that failed twice, and rewrite topics that kept a failed lesson. */
  retryFailed?: boolean
  concurrency?: number
  /** At most this many lessons for a topic, whatever the outline says (keeps a trial run inside its call cap). */
  maxLessons?: number
  /** Every group of every grade, so that file names stay the same whichever groups are asked for. */
  allGroups?: TopicGroup[]
}

export type TopicResult = { status: 'skipped' | 'done' | 'partial' | 'failed' | 'stopped'; ready: number; failed: number; reason?: string }
export type RunSummary = { done: number; partial: number; failed: number; skipped: number; stopped: number; calls: number; usd: number; stopReason: string | null }

type LessonResult = { position: number; status: 'ready' | 'failed'; problems: string[]; writer: string; reviewer: string; lesson?: TeachingLesson }
type Progress = { outline: Outline; results: LessonResult[] }
type FailList = {
  updatedAt: string
  topics: { grade: number; baseName: string; reason: string; attempts: number; at: string }[]
  lessons: { grade: number; baseName: string; position: number; title: string; objectives?: string[]; sections?: string[]; problems: string[]; writer: string; reviewer: string; at: string }[]
}

class Stopped extends Error {}

const writeAtomic = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, file)
}

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** The long dashes of a model's text as plain ones, deep inside a value: no em dash may reach a lesson. */
export function scrubDashes<T>(value: T): T {
  const em = new RegExp(`\\s*${String.fromCharCode(0x2014)}\\s*`, 'g')
  const en = new RegExp(String.fromCharCode(0x2013), 'g')
  const walk = (v: unknown): unknown =>
    typeof v === 'string' ? v.replace(em, ' - ').replace(en, '-') : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v
  return walk(value) as T
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const goodObjectives = (o: unknown): o is string[] => Array.isArray(o) && o.length >= 2 && o.length <= 4 && o.every((x) => typeof x === 'string' && x.trim())

type OutlineItem = Outline['lessons'][number]

/** Reads a lesson reply leniently where the outline already decides: position, title, objectives and minutes are filled in from code. */
const lessonSchema = (position: number, item: OutlineItem): z.ZodType<TeachingLesson> =>
  z.preprocess((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
    const o = { ...(raw as Record<string, unknown>) }
    o.position = position
    o.title = item.title
    o.objectives = item.objectives
    o.minutes = typeof o.minutes === 'number' ? clamp(Math.round(o.minutes), 5, 30) : 15
    if (!Array.isArray(o.keyWords)) o.keyWords = []
    return o
  }, TeachingLessonSchema) as unknown as z.ZodType<TeachingLesson>

export class Generator {
  capReached = false
  budgetReached = false
  stopReason: string | null = null
  private stopRequested = false
  private used: number
  private readonly root: string
  private readonly o: GenOptions

  constructor(o: GenOptions) {
    this.o = o
    this.root = o.root ?? REPO_ROOT
    const records = readLedger(this.root)
    this.used = records.length
    this.restoreParks(records)
  }

  /** A model whose latest ledger line is "limit reached" within the last hour is still resting: a restarted run does not ask it again at once. */
  private restoreParks(records: LedgerRecord[]): void {
    const latest = new Map<string, LedgerRecord>()
    for (const r of records) latest.set(r.model, r)
    const now = this.now().getTime()
    for (const [model, r] of latest) {
      const age = now - Date.parse(r.time)
      if (r.limited && age >= 0 && age < this.o.chain.limitParkMs) this.o.chain.park(model, this.o.chain.limitParkMs - age)
    }
  }

  /** The models of the chain, best first (for the first line a run prints). */
  models(): string[] {
    return this.o.chain.models
  }

  /** Stop picking new topics; the topics in progress finish. */
  requestStop(): void {
    this.stopRequested = true
  }

  private log = (line: string) => (this.o.log ?? ((l: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${l}`)))(line)
  private now = () => (this.o.now ?? (() => new Date()))()
  private sleep = (ms: number) => (this.o.sleep ?? ((n: number) => new Promise<void>((r) => setTimeout(r, n))))(ms)

  /** Writes a ledger line for a call made by hand (before this script existed) so that the cap counts it. */
  addProbe(rec: { model: string; ok: boolean; limited: boolean; error?: string }): void {
    appendLedger(this.root, { time: this.now().toISOString(), kind: 'probe', seconds: 0, ...rec })
    this.used += 1
  }

  // ---- calling the models -----------------------------------------------------------------------------------------------------------

  /** Every model attempt passes here: the cap and the budget are checked before the call, so a call that hangs still counts. */
  private runner: Runner = async (model, prompt, opts) => {
    if (this.o.limitCalls !== undefined && this.used >= this.o.limitCalls) {
      this.capReached = true
      return { text: '', limited: false, error: CAP_ERROR }
    }
    if (this.o.maxUsd !== undefined && this.spent() >= this.o.maxUsd) {
      this.budgetReached = true
      return { text: '', limited: false, error: BUDGET_ERROR }
    }
    this.used += 1
    return (this.o.run ?? runOpencode)(model, prompt, opts)
  }

  /** The dollars in the ledger, read fresh: other processes may have added to it. */
  spent(): number {
    return sumCost(readLedger(this.root))
  }

  private record(kind: LedgerRecord['kind'], group: TopicGroup, position: number | undefined, a: Attempt): void {
    if (a.error === CAP_ERROR || a.error === BUDGET_ERROR) return
    appendLedger(this.root, {
      time: this.now().toISOString(),
      model: a.model,
      kind,
      seconds: Math.round(a.seconds * 10) / 10,
      tokensIn: a.tokensIn,
      tokensCached: a.tokensCached,
      tokensOut: a.tokensOut,
      costUsd: a.costUsd,
      costEstimated: a.costEstimated,
      ok: a.ok,
      limited: a.limited,
      error: a.error,
      grade: group.grade,
      topic: group.baseName,
      position,
    })
  }

  /**
   * One call with the ranked chain. When every model that was tried was out of free quota (or failed to run at all), it waits for the first one
   * to come back, in short sleeps, up to `maxWaitMs` in all, and tries again. Throws `Stopped` when the cap is reached or waiting is not allowed.
   * Returns null when the models answered but nothing usable came back.
   */
  private async call<T>(kind: LedgerRecord['kind'], group: TopicGroup, position: number | undefined, prompt: string, schema: z.ZodType<T>, opts: { exclude?: string[]; prefer?: string } = {}): Promise<{ value: T; model: string } | null> {
    const maxWait = this.o.maxWaitMs ?? 120 * MIN
    let waited = 0
    for (;;) {
      const attempts: Attempt[] = []
      let found: { value: T; model: string } | null
      try {
        found = await callJson(this.o.chain, prompt, schema, {
          timeoutMs: this.o.timeoutMs ?? 300_000,
          run: this.runner,
          exclude: opts.exclude,
          prefer: opts.prefer,
          onAttempt: (a) => {
            attempts.push(a)
            this.record(kind, group, position, a)
          },
        })
      } catch (e) {
        if (e instanceof FatalBackendError) throw this.stop(e.message)
        throw e
      }
      if (found) return found
      if (this.capReached) throw this.stop('the call cap was reached')
      if (this.budgetReached) throw this.stop(`the budget of $${this.o.maxUsd} was reached`)
      const resting = this.o.chain.msUntilAvailable(opts.exclude)
      // Waiting is only for the case where every model that was tried said "free usage limit reached", or none was free. A model that failed
      // for any other reason is not waited for: retrying it at once, in a loop, is what this must never do.
      const onlyLimited = attempts.every((a) => a.limited)
      if (resting === null || !onlyLimited) {
        const detail = attempts.map((a) => `${a.model}: ${a.error}`).join('; ')
        this.log(`  ${kind} call gave nothing usable (${detail || 'no model free'})`)
        return null
      }
      if (waited + resting > maxWait) throw this.stop('every model hit the free usage limit and waiting is not allowed or would be too long')
      this.log(`  every model is resting, waiting ${Math.ceil(resting / MIN)} min for the first one`)
      let left = resting
      while (left > 0 && this.o.chain.next(opts.exclude) === null) {
        const chunk = Math.min(5 * MIN, left)
        await this.sleep(chunk)
        waited += chunk
        left -= chunk
      }
    }
  }

  private stop(reason: string): Stopped {
    this.stopReason = reason
    return new Stopped(reason)
  }

  // ---- files ---------------------------------------------------------------------------------------------------------------------------

  private failPath = () => join(this.root, 'content/lessons/fail-list.json')
  private progressPath = (group: TopicGroup, fileName: string) => join(this.root, 'content/lessons/.progress', `g${group.grade}-${fileName}.json`)

  private loadFailList(): FailList {
    const raw = readJson(this.failPath()) as FailList | null
    return raw && Array.isArray(raw.topics) && Array.isArray(raw.lessons) ? raw : { updatedAt: '', topics: [], lessons: [] }
  }

  private saveFailList(list: FailList): void {
    writeAtomic(this.failPath(), `${JSON.stringify({ ...list, updatedAt: this.now().toISOString() }, null, 2)}\n`)
  }

  private readTopicFile(path: string): TopicLessons | null {
    const parsed = TopicLessonsSchema.safeParse(readJson(path))
    return parsed.success ? parsed.data : null
  }

  // ---- one lesson ----------------------------------------------------------------------------------------------------------------------

  private normalize(lesson: TeachingLesson, position: number, item: OutlineItem, grade: number): TeachingLesson {
    return tidyLesson(scrubDashes({ ...lesson, position, title: item.title, objectives: goodObjectives(item.objectives) ? item.objectives : lesson.objectives }), grade)
  }

  private async produceLesson(group: TopicGroup, ref: Reference, outline: Outline, index: number): Promise<LessonResult> {
    const position = index + 1
    const item = outline.lessons[index]!
    const titles = outline.lessons.map((l) => l.title)
    const ctx = { grade: group.grade, source: ref.source }
    const input = { group, ref, titles, position, title: item.title, objectives: item.objectives, sections: item.sections, hints: item.hints }
    const schema = lessonSchema(position, item)
    const failed = (problems: string[], writer: string, reviewer: string): LessonResult => ({ position, status: 'failed', problems, writer, reviewer })

    const first = await this.call('write', group, position, writePrompt(input), schema)
    if (!first) return failed(['no model produced a lesson that fits the lesson shape'], '', '')
    let lesson = this.normalize(first.value, position, item, group.grade)
    let writer = first.model

    let problems = checkLesson(lesson, ctx)
    let reviewer = ''
    const review = async (): Promise<string[]> => {
      const r = await this.call('review', group, position, reviewPrompt(group, ref, lesson, titles.length), ReviewSchema, { exclude: [writer] })
      if (!r) return ['no other model was free to check this lesson']
      reviewer = r.model
      return r.value.ok ? [] : r.value.problems.length ? r.value.problems : ['the reviewer did not accept the lesson and gave no reason']
    }
    if (problems.length === 0) problems = await review()
    if (problems.length === 0) return { position, status: 'ready', problems: [], writer, reviewer, lesson }

    this.log(`  lesson ${position}: ${problems.length} problem(s), one rewrite: ${problems[0]!.slice(0, 120)}`)
    const second = await this.call('rewrite', group, position, writePrompt({ ...input, rewrite: { problems, previous: lesson } }), schema, { prefer: writer })
    if (!second) return failed(problems, writer, reviewer)
    lesson = this.normalize(second.value, position, item, group.grade)
    writer = second.model
    reviewer = ''
    problems = checkLesson(lesson, ctx)
    if (problems.length === 0) problems = await review()
    if (problems.length === 0) return { position, status: 'ready', problems: [], writer, reviewer, lesson }
    return failed(problems, writer, reviewer)
  }

  // ---- one topic -----------------------------------------------------------------------------------------------------------------------

  async generateTopic(group: TopicGroup, fileName: string): Promise<TopicResult> {
    const label = `grade ${group.grade} ${group.baseName}`
    const path = join(this.root, lessonPath(group, fileName))
    const existing = this.readTopicFile(path)
    const failedInFile = existing?.status.filter((s) => s.status === 'failed').length ?? 0
    if (existing && (failedInFile === 0 || !this.o.retryFailed)) {
      this.log(`${label}: skipped (${failedInFile === 0 ? 'done already' : 'has a failed lesson, use --retry-failed'})`)
      return { status: 'skipped', ready: existing.lessons.length, failed: failedInFile }
    }
    const before = this.loadFailList().topics.find((t) => t.grade === group.grade && t.baseName === group.baseName)
    if (!existing && before && before.attempts >= FAIL_TWICE && !this.o.retryFailed) {
      this.log(`${label}: skipped (failed ${before.attempts} times, use --retry-failed)`)
      return { status: 'skipped', ready: 0, failed: 1, reason: before.reason }
    }

    const progressFile = this.progressPath(group, fileName)
    let progress = this.validProgress(readJson(progressFile))
    // A topic with a failed lesson, asked for again: the ready lessons stay as they are and only the failed positions are written again.
    if (!progress && existing) progress = this.progressFromFile(existing, group)
    try {
      const ref = await (this.o.reference ?? ((g: TopicGroup) => referenceFor(g)))(group)
      if (!progress) {
        const pitch = PITCH_TOPICS.some((p) => p.grade === group.grade && p.baseName === group.baseName)
        const range = lessonRange(group, ref, pitch)
        const outline = await this.call('outline', group, undefined, outlinePrompt(group, ref, pitch), OutlineSchema)
        if (!outline) return this.topicFailed(group, 'no model produced an outline')
        progress = { outline: scrubDashes({ lessons: outline.value.lessons.slice(0, Math.min(range.max, this.o.maxLessons ?? range.max)) }), results: [] }
        writeAtomic(progressFile, JSON.stringify(progress))
        this.log(`${label}: outline of ${progress.outline.lessons.length} lessons, reference ${ref.source.kind}`)
      } else this.log(`${label}: carrying on, ${progress.results.length} of ${progress.outline.lessons.length} lessons already done`)

      for (let i = 0; i < progress.outline.lessons.length; i++) {
        if (progress.results.some((r) => r.position === i + 1)) continue
        const result = await this.produceLesson(group, ref, progress.outline, i)
        progress.results.push(result)
        writeAtomic(progressFile, JSON.stringify(progress))
        this.log(`${label}: lesson ${result.position}/${progress.outline.lessons.length} ${result.status} (writer ${result.writer || '-'}, reviewer ${result.reviewer || '-'})`)
      }
      return this.finish(group, fileName, path, ref.source, progress)
    } catch (e) {
      if (e instanceof Stopped) {
        this.log(`${label}: stopped (${e.message}); the finished lessons are kept`)
        return { status: 'stopped', ready: progress?.results.filter((r) => r.status === 'ready').length ?? 0, failed: 0, reason: e.message }
      }
      throw e
    }
  }

  private validProgress(raw: unknown): Progress | null {
    const p = raw as Progress | null
    return p && OutlineSchema.safeParse(p.outline).success && Array.isArray(p.results) ? p : null
  }

  /** The outline and the ready lessons of a topic file, with the titles and objectives of its failed lessons from the fail list. Null when the fail list lacks one of them. */
  private progressFromFile(file: TopicLessons, group: TopicGroup): Progress | null {
    const failed = this.loadFailList().lessons.filter((l) => l.grade === group.grade && l.baseName === group.baseName)
    const results: LessonResult[] = []
    const lessons: Outline['lessons'] = []
    for (const status of [...file.status].sort((a, b) => a.position - b.position)) {
      if (status.position !== lessons.length + 1) return null
      if (status.status === 'ready') {
        const lesson = file.lessons.find((l) => l.position === status.position)
        if (!lesson) return null
        lessons.push({ title: lesson.title, objectives: lesson.objectives })
        results.push({ position: status.position, status: 'ready', problems: [], writer: status.writer, reviewer: status.reviewer, lesson })
      } else {
        const entry = failed.find((l) => l.position === status.position)
        if (!entry || !entry.title || !goodObjectives(entry.objectives)) return null
        lessons.push({ title: entry.title, objectives: entry.objectives, sections: entry.sections, hints: entry.problems.slice(0, 6) })
      }
    }
    const outline = { lessons }
    return OutlineSchema.safeParse(outline).success ? { outline, results } : null
  }

  private topicFailed(group: TopicGroup, reason: string): TopicResult {
    const list = this.loadFailList()
    const old = list.topics.find((t) => t.grade === group.grade && t.baseName === group.baseName)
    list.topics = [...list.topics.filter((t) => t !== old), { grade: group.grade, baseName: group.baseName, reason, attempts: (old?.attempts ?? 0) + 1, at: this.now().toISOString() }]
    this.saveFailList(list)
    this.log(`grade ${group.grade} ${group.baseName}: FAILED (${reason})`)
    return { status: 'failed', ready: 0, failed: 1, reason }
  }

  private finish(group: TopicGroup, fileName: string, path: string, source: TeachingSource, progress: Progress): TopicResult {
    const results = [...progress.results].sort((a, b) => a.position - b.position)
    const ready = results.filter((r) => r.status === 'ready' && r.lesson)
    const failed = results.filter((r) => r.status === 'failed')
    const list = this.loadFailList()
    const sameTopic = (x: { grade: number; baseName: string }) => x.grade === group.grade && x.baseName === group.baseName
    list.lessons = list.lessons.filter((l) => !sameTopic(l))
    const at = this.now().toISOString()
    if (ready.length === 0) {
      this.saveFailList({ ...list, lessons: [...list.lessons, ...failed.map((r) => this.failedEntry(group, progress, r, at))] })
      const reason = failed[0]?.problems.slice(0, 3).join(' | ') || 'no lesson passed'
      rmSync(this.progressPath(group, fileName), { force: true })
      return this.topicFailed(group, `lesson 1 failed: ${reason}`)
    }
    const file: TopicLessons = {
      grade: group.grade,
      baseName: group.baseName,
      family: group.family,
      capsNames: group.capsNames,
      terms: group.terms as TopicLessons['terms'],
      source,
      lessons: ready.map((r) => r.lesson!),
      status: results.map((r) => ({ position: r.position, status: r.status, problems: r.problems, writer: r.writer, reviewer: r.reviewer })),
      generatedAt: at,
    }
    writeAtomic(path, `${JSON.stringify(TopicLessonsSchema.parse(scrubDashes(file)), null, 2)}\n`)
    list.topics = list.topics.filter((t) => !sameTopic(t))
    list.lessons.push(...failed.map((r) => this.failedEntry(group, progress, r, at)))
    this.saveFailList(list)
    rmSync(this.progressPath(group, fileName), { force: true })
    const status = failed.length === 0 ? 'done' : 'partial'
    this.log(`grade ${group.grade} ${group.baseName}: ${status}, ${ready.length} ready, ${failed.length} failed`)
    return { status, ready: ready.length, failed: failed.length }
  }

  private failedEntry(group: TopicGroup, progress: Progress, r: LessonResult, at: string): FailList['lessons'][number] {
    const item = progress.outline.lessons[r.position - 1]
    return scrubDashes({ grade: group.grade, baseName: group.baseName, position: r.position, title: item?.title ?? '', objectives: item?.objectives, sections: item?.sections, problems: r.problems, writer: r.writer, reviewer: r.reviewer, at })
  }

  // ---- many topics ---------------------------------------------------------------------------------------------------------------------

  async runAll(groups: TopicGroup[]): Promise<RunSummary> {
    const names = topicFileNames(this.o.allGroups ?? groups)
    const summary: RunSummary = { done: 0, partial: 0, failed: 0, skipped: 0, stopped: 0, calls: 0, usd: 0, stopReason: null }
    const queue = [...groups]
    const startedWith = this.used
    const dollarsBefore = this.spent()
    const worker = async () => {
      while (queue.length > 0 && !this.stopRequested && !this.capReached && !this.budgetReached && !this.stopReason) {
        const group = queue.shift()!
        try {
          const result = await this.generateTopic(group, names.get(group) ?? group.baseName)
          summary[result.status] += 1
        } catch (e) {
          // One topic that breaks (a disk error, a bug) is logged and counted; the others go on.
          this.log(`grade ${group.grade} ${group.baseName}: ERROR ${e instanceof Error ? e.message : String(e)}`)
          summary.failed += 1
        }
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, this.o.concurrency ?? 4) }, worker))
    summary.calls = this.used - startedWith
    summary.usd = Math.round((this.spent() - dollarsBefore) * 10000) / 10000
    summary.stopReason = this.stopReason ?? (this.capReached ? 'the call cap was reached' : this.budgetReached ? `the budget of $${this.o.maxUsd} was reached` : this.stopRequested ? 'stopped on request' : null)
    return summary
  }
}

// ---- the command line --------------------------------------------------------------------------------------------------------------

/** The ledger as text: per model, then per kind of call, with tokens (in, cached, out), dollars and seconds. */
export function reportLines(records: LedgerRecord[]): string[] {
  const line = (name: string, s: { calls: number; avgSeconds: number; tokensIn: number; tokensCached: number; tokensOut: number; usd: number }, extra = '') =>
    `${name}: ${s.calls} calls${extra}, ${s.avgSeconds}s average, ${s.tokensIn} in (${s.tokensCached} cached), ${s.tokensOut} out, $${s.usd}`
  return [
    `calls in the ledger: ${records.length}, $${Math.round(sumCost(records) * 10000) / 10000} in all`,
    ...summarize(records).map((s) => line(s.model, s, `, ${s.failures} failed, ${s.limited} limit hits`)),
    ...summarizeByKind(records).map((s) => line(`kind ${s.kind}`, s)),
  ]
}

export async function main(argv = process.argv.slice(2), env: Record<string, string | undefined> = process.env): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      grade: { type: 'string' },
      topic: { type: 'string' },
      samples: { type: 'boolean' },
      concurrency: { type: 'string' },
      'limit-calls': { type: 'string' },
      'max-usd': { type: 'string' },
      'max-lessons': { type: 'string' },
      'retry-failed': { type: 'boolean' },
      'max-wait-min': { type: 'string' },
      'timeout-sec': { type: 'string' },
      'dry-run': { type: 'boolean' },
      report: { type: 'boolean' },
    },
    allowPositionals: false,
  })
  if (values.report) {
    for (const l of reportLines(readLedger(REPO_ROOT))) console.log(l)
    return
  }
  const number = (name: string, text: string | undefined, min: number): number | undefined => {
    if (text === undefined) return undefined
    const n = Number(text)
    if (!Number.isFinite(n) || n < min) throw new Error(`--${name} needs a number of at least ${min} (got "${text}")`)
    return n
  }
  const all = topicGroups()
  const grade = number('grade', values.grade, 1)
  const groups = values.samples
    ? SAMPLE_TOPICS.map((t) => all.find((g) => g.grade === t.grade && g.baseName === t.baseName)!).filter(Boolean)
    : all.filter((g) => (grade === undefined || g.grade === grade) && (values.topic === undefined || g.baseName.toLowerCase() === values.topic.toLowerCase()))
  if (groups.length === 0) throw new Error(`no topic matches --grade ${values.grade ?? '*'} --topic ${values.topic ?? '*'}`)
  if (values['dry-run']) {
    const names = topicFileNames(all)
    for (const g of groups) console.log(lessonPath(g, names.get(g)!))
    console.log(`${groups.length} topics`)
    return
  }
  const backend = backendFromEnv(env)
  const gen = new Generator({
    chain: new Chain(modelsFor(backend, env), Date.now, limitParkMsFor(backend)),
    run: runnerFor(backend, env),
    allGroups: all,
    concurrency: number('concurrency', values.concurrency, 1) ?? 4,
    limitCalls: number('limit-calls', values['limit-calls'], 0),
    maxUsd: number('max-usd', values['max-usd'], 0) ?? 8,
    maxLessons: number('max-lessons', values['max-lessons'], 1),
    retryFailed: values['retry-failed'] ?? false,
    maxWaitMs: (number('max-wait-min', values['max-wait-min'], 0) ?? 120) * MIN,
    timeoutMs: (number('timeout-sec', values['timeout-sec'], 1) ?? 300) * 1000,
  })
  let interrupted = false
  process.on('SIGINT', () => {
    if (interrupted) process.exit(130)
    interrupted = true
    console.log('Stopping after the topics in progress finish (press Ctrl-C again to stop now).')
    gen.requestStop()
  })
  console.log(`backend ${backend}, models ${gen.models().join(', ')}`)
  const summary = await gen.runAll(groups)
  console.log(JSON.stringify(summary))
  for (const l of reportLines(readLedger(REPO_ROOT))) console.log(l)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
