import type { DiagnosedResult } from './types'

export type ClassGap = {
  topicName: string
  topicId: string | null
  learners: { childId: string; wrote: string[] }[]
  mistake: { label: string; example: string; count: number }
}

export function classGaps(results: DiagnosedResult[], roster: { id: string; name: string }[]): ClassGap[] {
  const order = new Map(roster.map((c, i) => [c.id, i]))
  const groups = new Map<string, DiagnosedResult[]>()
  for (const r of [...results].sort((a, b) => a.n - b.n)) {
    if (r.correct || !order.has(r.childId)) continue
    const key = r.gapTopicName ?? r.topicName
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const gaps = [...groups].map(([topicName, rows], position) => {
    const byChild = new Map<string, string[]>()
    for (const r of rows) byChild.set(r.childId, [...(byChild.get(r.childId) ?? []), r.answerRead])
    const learners = [...byChild]
      .sort((a, b) => order.get(a[0])! - order.get(b[0])!)
      .map(([childId, wrote]) => ({ childId, wrote }))
    const labels = new Map<string, { count: number; example: string }>()
    for (const r of rows) {
      if (!r.misconception) continue
      const seen = labels.get(r.misconception)
      if (seen) seen.count++
      else labels.set(r.misconception, { count: 1, example: `${r.prompt} = ${r.answerRead}` })
    }
    let best: { label: string; example: string; count: number } = { label: '', example: '', count: 0 }
    for (const [label, v] of labels) if (v.count > best.count) best = { label, ...v }
    return { gap: { topicName, topicId: null, learners, mistake: best } satisfies ClassGap, position }
  })
  return gaps
    .sort((a, b) => b.gap.learners.length - a.gap.learners.length || a.position - b.position)
    .map((g) => g.gap)
}
