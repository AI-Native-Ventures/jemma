import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { TeachingLessonSchema, TopicLessonsSchema, type TeachingLesson, type TeachingSource, type TopicLessons } from '@jemma/profiling/schemas'
import { Chain, callJson, modelsFromEnv, type Attempt } from './chain'
import { checkLesson } from './checks'
import { appendLedger, readLedger, summarize, type LedgerRecord } from './ledger'
import { runOpencode, type Runner } from './opencode'
import { OutlineSchema, ReviewSchema, lessonRange, outlinePrompt, reviewPrompt, writePrompt, type Outline } from './build-prompts'
import { referenceFor, type Reference } from './sources'
import { PITCH_TOPICS, REPO_ROOT, lessonPath, topicFileNames, topicGroups, type TopicGroup } from './topics'

/**
 * The generator. For each topic: the reference, an outline (1 to 8 lessons), then for each lesson a write call, the code checks, a review call by
 * a different model, and one rewrite with the problems listed when anything is wrong. Every call goes to the ledger. It can be stopped and started
 * again at any time: finished topics are skipped, a half done topic carries on from its saved lessons, and every file is written whole (temp file
 * and rename). Nothing here touches a database or a server.
 */

const MIN = 60_000
const CAP_ERROR = 'call cap reached'
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
  /** Try again topics that failed twice, and rewrite topics that kept a failed lesson. */
  retryFailed?: boolean
  concurrency?: number
  /** Every group of every grade, so that file names stay the same whichever groups are asked for. */
  allGroups?: TopicGroup[]
}

export type TopicResult = { status: 'skipped' | 'done' | 'partial' | 'failed' | 'stopped'; ready: number; failed: number; reason?: string }
export type RunSummary = { done: number; partial: number; failed: number; skipped: number; stopped: number; calls: number; stopReason: string | null }

type LessonResult = { position: number; status: 'ready' | 'failed'; problems: string[]; writer: string; reviewer: string; lesson?: TeachingLesson }
type Progress = { outline: Outline; results: LessonResult[] }
type FailList = {
  updatedAt: string
  topics: { grade: number; baseName: string; reason: string; attempts: number; at: string }[]
  lessons: { grade: number; baseName: string; position: number; title: string; problems: string[]; writer: string; reviewer: string; at: string }[]
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

const isContentError = (error?: string) => !!error && /^(schema:|no JSON)/.test(error)

export class Generator {
  capReached = false
  stopReason: string | null = null
  private stopRequested = false
  private used: number
  private readonly root: string
  private readonly o: GenOptions

  constructor(o: GenOptions) {
    this.o = o
    this.root = o.root ?? REPO_ROOT
    this.used = readLedger(this.root).length
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

  /** Every model attempt passes here: the cap is checked before the call, so a call that hangs still counts. */
  private runner: Runner = async (model, prompt, opts) => {
    if (this.o.limitCalls !== undefined && this.used >= this.o.limitCalls) {
      this.capReached = true
      return { text: '', limited: false, error: CAP_ERROR }
    }
    this.used += 1
    return (this.o.run ?? runOpencode)(model, prompt, opts)
  }

  private record(kind: LedgerRecord['kind'], group: TopicGroup, position: number | undefined, a: Attempt): void {
    if (a.error === CAP_ERROR) return
    appendLedger(this.root, {
      time: this.now().toISOString(),
      model: a.model,
      kind,
      seconds: Math.round(a.seconds * 10) / 10,
      tokensIn: a.tokensIn,
      tokensOut: a.tokensOut,
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
      const found = await callJson(this.o.chain, prompt, schema, {
        timeoutMs: this.o.timeoutMs ?? 300_000,
        run: this.runner,
        exclude: opts.exclude,
        prefer: opts.prefer,
        onAttempt: (a) => {
          attempts.push(a)
          this.record(kind, group, position, a)
        },
      })
      if (found) return found
      if (this.capReached) throw this.stop('the call cap was reached')
      const resting = this.o.chain.msUntilAvailable(opts.exclude)
      const onlyInfrastructure = attempts.every((a) => a.limited || !isContentError(a.error))
      if (resting === null || !onlyInfrastructure) {
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

  private normalize(lesson: TeachingLesson, position: number, item: OutlineItem): TeachingLesson {
    return scrubDashes({ ...lesson, position, title: item.title, objectives: goodObjectives(item.objectives) ? item.objectives : lesson.objectives })
  }

  private async produceLesson(group: TopicGroup, ref: Reference, outline: Outline, index: number): Promise<LessonResult> {
    const position = index + 1
    const item = outline.lessons[index]!
    const titles = outline.lessons.map((l) => l.title)
    const ctx = { grade: group.grade, source: ref.source }
    const input = { group, ref, titles, position, title: item.title, objectives: item.objectives, sections: item.sections }
    const schema = lessonSchema(position, item)
    const failed = (problems: string[], writer: string, reviewer: string): LessonResult => ({ position, status: 'failed', problems, writer, reviewer })

    const first = await this.call('write', group, position, writePrompt(input), schema)
    if (!first) return failed(['no model produced a lesson that fits the lesson shape'], '', '')
    let lesson = this.normalize(first.value, position, item)
    let writer = first.model

    let problems = checkLesson(lesson, ctx)
    let reviewer = ''
    const review = async (): Promise<string[]> => {
      const r = await this.call('review', group, position, reviewPrompt(group, ref, lesson, titles.length, item.sections), ReviewSchema, { exclude: [writer] })
      if (!r) return ['no other model was free to check this lesson']
      reviewer = r.model
      return r.value.ok ? [] : r.value.problems.length ? r.value.problems : ['the reviewer did not accept the lesson and gave no reason']
    }
    if (problems.length === 0) problems = await review()
    if (problems.length === 0) return { position, status: 'ready', problems: [], writer, reviewer, lesson }

    this.log(`  lesson ${position}: ${problems.length} problem(s), one rewrite: ${problems[0]!.slice(0, 120)}`)
    const second = await this.call('rewrite', group, position, writePrompt({ ...input, rewrite: { problems, previous: lesson } }), schema, { prefer: writer })
    if (!second) return failed(problems, writer, reviewer)
    lesson = this.normalize(second.value, position, item)
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
    if (existing && !this.o.retryFailed) {
      const clean = existing.status.length > 0 && existing.status.every((s) => s.status === 'ready')
      this.log(`${label}: skipped (${clean ? 'done already' : 'has a failed lesson, use --retry-failed'})`)
      return { status: 'skipped', ready: existing.lessons.length, failed: existing.status.filter((s) => s.status === 'failed').length }
    }
    const before = this.loadFailList().topics.find((t) => t.grade === group.grade && t.baseName === group.baseName)
    if (!existing && before && before.attempts >= FAIL_TWICE && !this.o.retryFailed) {
      this.log(`${label}: skipped (failed ${before.attempts} times, use --retry-failed)`)
      return { status: 'skipped', ready: 0, failed: 1, reason: before.reason }
    }

    const progressFile = this.progressPath(group, fileName)
    let progress = (readJson(progressFile) as Progress | null) ?? null
    try {
      const ref = await (this.o.reference ?? ((g: TopicGroup) => referenceFor(g)))(group)
      if (!progress || !OutlineSchema.safeParse(progress.outline).success || !Array.isArray(progress.results)) {
        const pitch = PITCH_TOPICS.some((p) => p.grade === group.grade && p.baseName === group.baseName)
        const range = lessonRange(group, ref, pitch)
        const outline = await this.call('outline', group, undefined, outlinePrompt(group, ref, pitch), OutlineSchema)
        if (!outline) return this.topicFailed(group, 'no model produced an outline')
        progress = { outline: { lessons: outline.value.lessons.slice(0, range.max) }, results: [] }
        writeAtomic(progressFile, JSON.stringify(progress))
        this.log(`${label}: outline of ${progress.outline.lessons.length} lessons, reference ${ref.source.kind}`)
      } else this.log(`${label}: carrying on, ${progress.results.length} of ${progress.outline.lessons.length} lessons done`)

      for (let i = progress.results.length; i < progress.outline.lessons.length; i++) {
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

  private topicFailed(group: TopicGroup, reason: string): TopicResult {
    const list = this.loadFailList()
    const old = list.topics.find((t) => t.grade === group.grade && t.baseName === group.baseName)
    list.topics = [...list.topics.filter((t) => t !== old), { grade: group.grade, baseName: group.baseName, reason, attempts: (old?.attempts ?? 0) + 1, at: this.now().toISOString() }]
    this.saveFailList(list)
    this.log(`grade ${group.grade} ${group.baseName}: FAILED (${reason})`)
    return { status: 'failed', ready: 0, failed: 1, reason }
  }

  private finish(group: TopicGroup, fileName: string, path: string, source: TeachingSource, progress: Progress): TopicResult {
    const ready = progress.results.filter((r) => r.status === 'ready' && r.lesson)
    const failed = progress.results.filter((r) => r.status === 'failed')
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
      status: progress.results.map((r) => ({ position: r.position, status: r.status, problems: r.problems, writer: r.writer, reviewer: r.reviewer })),
      generatedAt: at,
    }
    writeAtomic(path, `${JSON.stringify(TopicLessonsSchema.parse(file), null, 2)}\n`)
    list.topics = list.topics.filter((t) => !sameTopic(t))
    list.lessons.push(...failed.map((r) => this.failedEntry(group, progress, r, at)))
    this.saveFailList(list)
    rmSync(this.progressPath(group, fileName), { force: true })
    const status = failed.length === 0 ? 'done' : 'partial'
    this.log(`grade ${group.grade} ${group.baseName}: ${status}, ${ready.length} ready, ${failed.length} failed`)
    return { status, ready: ready.length, failed: failed.length }
  }

  private failedEntry(group: TopicGroup, progress: Progress, r: LessonResult, at: string): FailList['lessons'][number] {
    return { grade: group.grade, baseName: group.baseName, position: r.position, title: progress.outline.lessons[r.position - 1]?.title ?? '', problems: r.problems, writer: r.writer, reviewer: r.reviewer, at }
  }

  // ---- many topics ---------------------------------------------------------------------------------------------------------------------

  async runAll(groups: TopicGroup[]): Promise<RunSummary> {
    const names = topicFileNames(this.o.allGroups ?? groups)
    const summary: RunSummary = { done: 0, partial: 0, failed: 0, skipped: 0, stopped: 0, calls: 0, stopReason: null }
    const queue = [...groups]
    const startedWith = this.used
    const worker = async () => {
      while (queue.length > 0 && !this.stopRequested && !this.capReached && !this.stopReason) {
        const group = queue.shift()!
        const result = await this.generateTopic(group, names.get(group) ?? group.baseName)
        summary[result.status] += 1
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, this.o.concurrency ?? 4) }, worker))
    summary.calls = this.used - startedWith
    summary.stopReason = this.stopReason ?? (this.capReached ? 'the call cap was reached' : this.stopRequested ? 'stopped on request' : null)
    return summary
  }
}

// ---- the command line --------------------------------------------------------------------------------------------------------------

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      grade: { type: 'string' },
      topic: { type: 'string' },
      concurrency: { type: 'string' },
      'limit-calls': { type: 'string' },
      'retry-failed': { type: 'boolean' },
      'max-wait-min': { type: 'string' },
      'timeout-sec': { type: 'string' },
      'dry-run': { type: 'boolean' },
      report: { type: 'boolean' },
    },
    allowPositionals: false,
  })
  if (values.report) {
    const records = readLedger(REPO_ROOT)
    console.log(`calls in the ledger: ${records.length}`)
    for (const s of summarize(records)) console.log(`${s.model}: ${s.calls} calls, ${s.failures} failed, ${s.limited} limit hits, ${s.avgSeconds}s average, ${s.tokensIn} in, ${s.tokensOut} out`)
    return
  }
  const all = topicGroups()
  const groups = all.filter((g) => (values.grade === undefined || g.grade === Number(values.grade)) && (values.topic === undefined || g.baseName.toLowerCase() === values.topic.toLowerCase()))
  if (groups.length === 0) throw new Error(`no topic matches --grade ${values.grade ?? '*'} --topic ${values.topic ?? '*'}`)
  if (values['dry-run']) {
    const names = topicFileNames(all)
    for (const g of groups) console.log(lessonPath(g, names.get(g)!))
    console.log(`${groups.length} topics`)
    return
  }
  const gen = new Generator({
    chain: new Chain(modelsFromEnv()),
    allGroups: all,
    concurrency: values.concurrency ? Number(values.concurrency) : 4,
    limitCalls: values['limit-calls'] ? Number(values['limit-calls']) : undefined,
    retryFailed: values['retry-failed'] ?? false,
    maxWaitMs: values['max-wait-min'] !== undefined ? Number(values['max-wait-min']) * MIN : 120 * MIN,
    timeoutMs: values['timeout-sec'] ? Number(values['timeout-sec']) * 1000 : 300_000,
  })
  let interrupted = false
  process.on('SIGINT', () => {
    if (interrupted) process.exit(130)
    interrupted = true
    console.log('Stopping after the topics in progress finish (press Ctrl-C again to stop now).')
    gen.requestStop()
  })
  const summary = await gen.runAll(groups)
  console.log(JSON.stringify(summary))
  for (const s of summarize(readLedger(REPO_ROOT))) console.log(`${s.model}: ${s.calls} calls, ${s.failures} failed, ${s.limited} limit hits, ${s.avgSeconds}s average`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
