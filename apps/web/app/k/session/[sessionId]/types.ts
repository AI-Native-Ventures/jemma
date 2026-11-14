import type { Lesson } from '@jemma/profiling/schemas'
import type { MissedQuestion, QuestionForChild, StageMove } from './logic'

/** The lesson as the child's screen may hold it: no question answers at all. */
export type LessonForChild = {
  title: string
  format: Lesson['format']
  minutes: number
  topicName: string
  cards?: Lesson['cards']
  diagram?: Lesson['diagram']
  audio?: { script: string; url: string | null }
  warmupCount: number
  tryCount: number
  /** The next unanswered question: warm-up 1 on a fresh run, or where the child left off. */
  first: QuestionForChild | null
  /** The five questions of a practice answered on paper, numbered 1 to 5, without answers. Empty (or missing) when the lesson cannot put five on paper. */
  paper?: QuestionForChild[]
}

export type FinishedSession = {
  missed: MissedQuestion[]
  /** Null when the child has no open gap on this topic. */
  stage: (StageMove & { topicName: string }) | null
  minutes: number
  topicName: string
  next: { day: string; topic: string } | null
}
