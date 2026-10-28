/** What Jemma Desktop is doing, in words a teacher or parent can read. */
export type Status =
  | { kind: 'off' }
  | { kind: 'idle' }
  | { kind: 'paused' }
  | { kind: 'running'; label: string }

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
    case 'idle':
      return 'Idle'
    case 'paused':
      return 'Paused'
    case 'running':
      return s.label
  }
}
