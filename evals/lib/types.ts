import type { JemmaDb } from '../../packages/profiling/src/db'
import type { JobName } from '../../packages/profiling/src/plans'
import type { EventType } from '../../packages/profiling/src/schemas/events'
import type { TranscriptCall } from '../../packages/runner/src/index'
import type { Sandbox, SandboxStage } from '../../supabase/seed/demo'

/** One named yes or no with a one-line reason. Every check is decided by code, never by a model. */
export type Check = { name: string; pass: boolean; detail: string }

export type Tokens = { input: number; output: number; costUsd: number }

/** One goose run on one model, as the runner reports it. */
export type AttemptRecord = {
  model: string
  seconds: number
  status: 'done' | 'failed'
  note: string
  saved: boolean
  timedOut: boolean
  tokens: Tokens | null
  /**
   * When the provider answered this attempt with an error (a rate limit, a capacity or server error), its message, as
   * goose reported it. Null when it did not. Missing in results saved before the field existed: the report then reads
   * it from `note` with the same function (`providerErrorOf`).
   */
  providerError?: string | null
}

export type EventSummary = { status: string; error: string | null; runner: string; attempts: number }

/** What happened in one run, as far as the agent and the event go. The checks read this next to the facts from the database. */
export type Outcome = {
  event: EventSummary | null
  run: { status: 'done' | 'failed'; note: string } | null
  attempts: AttemptRecord[]
  /** Every tool call of every attempt, in order. */
  calls: TranscriptCall[]
  /** The calls of each attempt, same order as `attempts`. */
  callsByAttempt: TranscriptCall[][]
  finalModel: string | null
  /** Seconds from starting the runner to the end of the agent run. */
  seconds: number
  /** What `log_external_calls` answered, or null when there was nothing to report. */
  reported: boolean | null
  /** For each tool (`server__tool`), the content types its answers carried in the stream (text, image). */
  contentTypes: Record<string, string[]>
}

/** The person who owns the sandbox's classroom, and the parent, as made by the seed. */
export type SandboxPeople = {
  teacher: { userId: string; email: string }
  parent: { userId: string }
}

export type PrepareContext = {
  admin: JemmaDb
  sandbox: Sandbox
  people: SandboxPeople
  /** A client signed in as the teacher: what the runner reads the job plan with. */
  teacherDb: JemmaDb
  /** Opens another sandbox (another school). It is deleted when the run ends. */
  openSandbox(stage: SandboxStage): Promise<Sandbox>
}

export type CollectContext = {
  admin: JemmaDb
  sandbox: Sandbox
  people: SandboxPeople
  /** The one folder the borrowed file server may use. */
  reportsDir: string
  /** The temp folder that holds the reports folder (two levels up from it). */
  evalRoot: string
  /** ISO time just before the event was sent. */
  startedAt: string
}

export type Prepared<S = Record<string, unknown>> = {
  /** The real event the app would send. */
  event: { type: EventType; payload: Record<string, string> }
  /** Ids to use instead of the ones the plan gives (the other-school task). */
  ids?: Record<string, string>
  /** Models to try, in order. Default: the runner's normal list. */
  models?: string[]
  /** One extra sentence for the job prompt. */
  promptSuffix?: string
  /** What the checks need that is not in the database afterwards (a before snapshot, ids, expected values). Plain JSON. */
  state: S
}

export type Task<S = any, F = any> = {
  id: string
  /** What this task proves, in one plain line (shown in EVALS.md). */
  proves: string
  /** The job of the event's plan this task runs. */
  job: JobName
  stage: SandboxStage
  /** Sets the sandbox up and says which event to send. */
  prepare(ctx: PrepareContext): Promise<Prepared<S>>
  /** The SELECTs (and file reads) after the run. Returns plain JSON that is saved with the result. */
  collect(ctx: CollectContext, prepared: Prepared<S>, outcome: Outcome): Promise<F>
  /** Pure: the named checks. No database, no model, so a unit test can feed it prepared rows and transcripts. */
  checks(facts: F, prepared: Prepared<S>, outcome: Outcome): Check[]
  /** Things worth showing in EVALS.md next to pass or fail (for example who stopped a bad word). */
  extras?(facts: F, prepared: Prepared<S>, outcome: Outcome): Record<string, string | number | boolean | null>
}

export type { TranscriptCall }
