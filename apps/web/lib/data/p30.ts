import { createSupabaseServer } from '@/lib/supabase/server'
import {
  behindHeadline,
  choicesSummary,
  currentTerm,
  dayLabel,
  plural,
  readDraft,
  termInView,
  timeHm,
  type ReadDraft,
} from '@/app/t/[classId]/curriculum/format'

/** Curriculum queries for the teacher screens. All reads run under RLS as the signed-in teacher. */

export type CurriculumState = {
  map: { id: string; status: 'draft' | 'approved'; draft: unknown; created_at: string; approved_at: string | null } | null
  docs: { id: string; title: string; pages: number }[]
  /** `draft` once the draft_map job has saved a map. */
  read: ReadDraft | null
  failedEventId: string | null
}

export async function getCurriculum(classId: string): Promise<CurriculumState> {
  const supabase = await createSupabaseServer()
  const [maps, docs] = await Promise.all([
    supabase.from('curriculum_maps').select('id, status, draft, created_at, approved_at').eq('class_id', classId).order('created_at', { ascending: false }).limit(1),
    supabase.from('curriculum_docs').select('id, title, pages').eq('class_id', classId).order('created_at'),
  ])
  const map = maps.data?.[0] ?? null
  const read = map ? readDraft(map.draft) : null
  let failedEventId: string | null = null
  if (map && !read) {
    const ev = await supabase.from('events').select('id').eq('type', 'curriculum.uploaded').eq('payload->>mapId', map.id).eq('status', 'failed').order('created_at', { ascending: false }).limit(1)
    failedEventId = ev.data?.[0]?.id ?? null
  }
  return { map, docs: docs.data ?? [], read, failedEventId }
}

/** What the draft job told the teacher, oldest first, as `13:52` + sentence. */
export async function getDraftLog(classId: string, since: string): Promise<{ at: string; text: string }[]> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('activity_log')
    .select('at, text')
    .eq('class_id', classId)
    .eq('tool', 'save_topic_map_draft')
    .gte('at', since)
    .order('at')
  return (data ?? []).map((r) => ({ at: timeHm(r.at), text: r.text }))
}

export type ApprovedTopic = { id: string; name: string; term: number; pct: number | null; reteach: boolean }
export type ApprovedView = {
  approvedOn: string
  headline: string
  testName: string | null
  current: number
  currentTopics: ApprovedTopic[]
  earlier: ApprovedTopic[]
  log: { at: string; text: string }[]
}

/** Everything the approved board shows, from the map's topics and the class's marked results. */
export async function getApprovedView(classId: string, state: CurriculumState, now = new Date()): Promise<ApprovedView> {
  const supabase = await createSupabaseServer()
  const map = state.map!
  const [topics, tests, plans] = await Promise.all([
    supabase.from('topics').select('id, name, term, position').eq('map_id', map.id).order('term').order('position'),
    supabase.from('tests').select('id, title').eq('class_id', classId).order('written_on', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(1),
    supabase.from('reteach_plans').select('topic_id').eq('class_id', classId).is('done_at', null),
  ])
  const test = tests.data?.[0] ?? null
  const testName = test ? test.title.split(':')[0]! : null

  type Row = { topic_id: string | null; correct: boolean; n: number }
  let rows: Row[] = []
  if (test) {
    const papers = await supabase.from('papers').select('id').eq('test_id', test.id)
    const ids = (papers.data ?? []).map((p) => p.id)
    if (ids.length) {
      const res = await supabase.from('question_results').select('topic_id, correct, n').in('paper_id', ids)
      rows = res.data ?? []
    }
  }
  const stat = new Map<string, { right: number; all: number }>()
  for (const r of rows) {
    if (!r.topic_id) continue
    const s = stat.get(r.topic_id) ?? { right: 0, all: 0 }
    s.all += 1
    if (r.correct) s.right += 1
    stat.set(r.topic_id, s)
  }
  const reteach = new Set((plans.data ?? []).map((p) => p.topic_id).filter(Boolean))
  const all: ApprovedTopic[] = (topics.data ?? []).map((t) => {
    const s = stat.get(t.id)
    return { id: t.id, name: t.name, term: t.term, pct: s ? Math.round((s.right / s.all) * 100) : null, reteach: reteach.has(t.id) }
  })

  // A three term year has no term 4: in the last quarter of the calendar the current term is its last term.
  const termsInMap = [...new Set(all.map((t) => t.term))].sort((a, b) => a - b)
  const current = termsInMap.length > 0 ? termInView(termsInMap, currentTerm(now)) : currentTerm(now)
  const currentTopics = all.filter((t) => t.term === current)
  const earlier = all.filter((t) => t.term < current && t.pct !== null)
  const weak = all.filter((t) => t.pct !== null && t.pct < 50).map((t) => ({ name: t.name, term: t.term }))
  const topicTotal = all.length
  const headline =
    behindHeadline(weak, current) ??
    (testName ? `${testName} is steady across the map.` : `Your map is approved: ${plural(topicTotal, 'topic')} ready for Class Test 1.`)

  const read = state.read
  const tagged = new Set(rows.filter((r) => r.topic_id).map((r) => r.n))
  const taggedTopics = new Set(rows.filter((r) => r.topic_id).map((r) => r.topic_id))
  const approvedAt = map.approved_at ?? map.created_at
  const choices = read ? choicesSummary(read) : []
  const log: { at: string; text: string }[] = []
  if (testName && tagged.size > 0) log.push({ at: timeHm(approvedAt), text: `Tagged ${testName}'s ${plural(tagged.size, 'question')} to ${plural(taggedTopics.size, 'topic')} on your map` })
  log.push({ at: timeHm(approvedAt), text: `Saved the map you approved: ${plural(topicTotal, 'topic')}${choices.map((c) => `, ${c}`).join('')}` })
  log.push({ at: timeHm(map.created_at), text: `Drafted the map from your ${plural(state.docs.length, 'document')}` })

  return { approvedOn: dayLabel(approvedAt), headline, testName, current, currentTopics, earlier, log }
}
