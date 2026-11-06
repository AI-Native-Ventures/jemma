/** What Jemma Desktop is doing, in words a teacher or parent can read. */
export type Status =
  | { kind: 'off' }
  | { kind: 'ready' }
  | { kind: 'paused' }
  | { kind: 'running'; label: string; done?: number; total?: number; timeLeft?: string; className?: string; snappedAt?: string }
  | { kind: 'cant_run'; reason: string }

export type PaperCounts = { done: number; total: number }

export function describeJob(eventType: string, papers: PaperCounts | null): string {
  switch (eventType) {
    case 'paper.snapped':
    case 'paper.checked':
      if (papers && papers.total > 1) return `Reading ${Math.min(papers.done + 1, papers.total)} of ${papers.total} papers`
      return 'Reading a paper'
    case 'homework.snapped':
      return 'Reading homework'
    case 'curriculum.uploaded':
      return 'Reading the curriculum'
    case 'key.snapped':
      return 'Reading the answer key'
    case 'session.finished':
    case 'observation.added':
    case 'activity.added':
      return 'Updating a learner profile'
    default:
      return 'Working on a job'
  }
}

export function describeStatus(s: Status): string {
  switch (s.kind) {
    case 'off':
      return 'Jemma Desktop is off'
    case 'ready':
      return 'Ready'
    case 'paused':
      return 'Paused'
    case 'running':
      return s.label
    case 'cant_run':
      return "Can't run"
  }
}

/** "About a minute left" from how long the papers done so far took. Null when there is nothing to go on. */
export function timeLeft(done: number, total: number, elapsedMs: number): string | null {
  if (done <= 0 || total <= done) return null
  const seconds = (elapsedMs / done) * (total - done) / 1000
  if (seconds < 90) return 'About a minute left'
  return `About ${Math.round(seconds / 60)} minutes left`
}
