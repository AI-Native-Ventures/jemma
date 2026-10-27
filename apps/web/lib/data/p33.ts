import { LessonSchema } from '@jemma/profiling/schemas'
import { createSupabaseServer } from '../supabase/server'
import { dayLabel, getLearnersView, termOf, type AttStatus } from './p19'

/** Shown to the teacher in South African time, as the school keeps it. */
const TZ = 'Africa/Johannesburg'

const stamp = (at: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { date: `${get('weekday')} ${get('day')} ${get('month')}`, time: `${get('hour')}:${get('minute')}` }
}

const FORMAT_LABEL: Record<string, string> = { reading: 'Reading', diagram: 'Diagram', audio: 'Audio' }

// ---- Learner detail (laptop learners screen) ---------------------------------------------

export type AttendanceDay = { day: number; status: AttStatus }

export type LearnerDetailExtras = {
  /** The last 10 school days with the day of the month, as the register grid draws them. */
  days: AttendanceDay[]
  /** `Term 4 school days, 12 to 23 Oct` */
  daysLabel: string
  tonight: { title: string; format: string; minutes: number; planned: string; stage: string } | null
}

export async function getLearnerDetailExtras(childId: string): Promise<LearnerDetailExtras> {
  const supabase = await createSupabaseServer()
  const [attRes, sessionRes, gapRes] = await Promise.all([
    supabase.from('attendance').select('day, status').eq('child_id', childId).order('day', { ascending: false }).limit(10),
    supabase
      .from('sessions')
      .select('topic_name, format, planned_minutes, created_at, lessons(content)')
      .eq('child_id', childId)
      .neq('status', 'done')
      .order('planned_for')
      .limit(1),
    supabase.from('gaps').select('topic_name, stage').eq('child_id', childId),
  ])
  const rows = (attRes.data ?? []).slice().reverse()
  const days = rows.map((r) => ({ day: Number(r.day.slice(8, 10)), status: r.status as AttStatus }))
  const first = rows[0]
  const last = rows[rows.length - 1]
  const month = (d: string) => dayLabel(d).split(' ')[2]
  const daysLabel =
    first && last ? `Term ${termOf(new Date(`${last.day}T00:00:00Z`))} school days, ${Number(first.day.slice(8, 10))} to ${Number(last.day.slice(8, 10))} ${month(last.day)}` : 'School days'

  const s = sessionRes.data?.[0]
  let tonight: LearnerDetailExtras['tonight'] = null
  if (s?.topic_name && s.format && s.planned_minutes) {
    const lesson = LessonSchema.safeParse(s.lessons?.content)
    const gap = (gapRes.data ?? []).find((g) => g.topic_name === s.topic_name)
    tonight = {
      title: lesson.success ? lesson.data.title : s.topic_name,
      format: FORMAT_LABEL[s.format] ?? s.format,
      minutes: s.planned_minutes,
      planned: stamp(s.created_at).time,
      stage: gap?.stage ?? 'new',
    }
  }
  return { days, daysLabel, tonight }
}

// ---- Class report ------------------------------------------------------------------------

export type ReportTopic = {
  name: string
  term: number
  /** Class right on the latest test, 0 to 100, or null when no question covered it. */
  pct: number | null
  status: 'on_track' | 'reteach' | null
}

export type ReportLearner = {
  id: string
  name: string
  average: number | null
  present: number
  recorded: number
  topGap: string | null
  stage: 'new' | 'practising' | 'fixed' | null
  notes: number
}

export type ClassReport = {
  className: string
  term: number
  updated: string | null
  headline: string
  testTitle: string | null
  testId: string | null
  average: { value: number | null; sub: string }
  days: { present: number; recorded: number; learners: number }
  lessons: { count: number; sub: string }
  topics: ReportTopic[]
  learners: ReportLearner[]
}

const RETEACH_BELOW = 50

export async function getClassReport(classId: string): Promise<ClassReport | null> {
  const supabase = await createSupabaseServer()
  const { data: cls } = await supabase.from('classes').select('id, name').eq('id', classId).maybeSingle()
  if (!cls) return null
  const base = await getLearnersView(classId)
  const ids = base.learners.map((l) => l.id)
  const none = ['00000000-0000-0000-0000-000000000000']
  const termStart = new Date(Date.UTC(new Date().getUTCFullYear(), (termOf() - 1) * 3, 1)).toISOString()

  const [testRes, mapRes, gapRes, obsRes, sessionRes, logRes] = await Promise.all([
    supabase.from('tests').select('id, title, written_on, out_of').eq('class_id', classId).order('created_at', { ascending: false }).limit(1),
    supabase.from('curriculum_maps').select('id').eq('class_id', classId).eq('status', 'approved').limit(1),
    supabase.from('gaps').select('child_id, topic_name, stage').in('child_id', ids.length ? ids : none).neq('stage', 'fixed').order('created_at'),
    supabase.from('observations').select('child_id').in('child_id', ids.length ? ids : none).gte('created_at', termStart),
    supabase.from('sessions').select('child_id, right, question_count, finished_at').in('child_id', ids.length ? ids : none).eq('status', 'done').order('finished_at', { ascending: false }),
    supabase.from('activity_log').select('at').eq('class_id', classId).order('at', { ascending: false }).limit(1),
  ])
  const test = testRes.data?.[0] ?? null
  const mapId = mapRes.data?.[0]?.id ?? null

  const [topicRes, paperRes] = await Promise.all([
    mapId ? supabase.from('topics').select('id, name, term, position').eq('map_id', mapId) : Promise.resolve({ data: [] as { id: string; name: string; term: number; position: number }[] }),
    test ? supabase.from('papers').select('id, total').eq('test_id', test.id).eq('status', 'marked') : Promise.resolve({ data: [] as { id: string; total: number | null }[] }),
  ])
  const papers = paperRes.data ?? []
  const results = papers.length
    ? ((await supabase.from('question_results').select('topic_id, topic_name, correct').in('paper_id', papers.map((p) => p.id))).data ?? [])
    : []

  const tally = new Map<string, { right: number; all: number }>()
  for (const r of results) {
    const key = r.topic_id ?? r.topic_name
    const t = tally.get(key) ?? { right: 0, all: 0 }
    t.all += 1
    if (r.correct) t.right += 1
    tally.set(key, t)
  }
  const topics: ReportTopic[] = (topicRes.data ?? [])
    .slice()
    .sort((a, b) => b.term - a.term || a.position - b.position)
    .filter((t) => t.term >= termOf() || tally.has(t.id) || tally.has(t.name))
    .map((t) => {
      const v = tally.get(t.id) ?? tally.get(t.name)
      const pct = v && v.all > 0 ? Math.round((v.right / v.all) * 100) : null
      return { name: t.name, term: t.term, pct, status: pct === null ? null : pct < RETEACH_BELOW ? 'reteach' : 'on_track' }
    })

  const gaps = gapRes.data ?? []
  const notes = obsRes.data ?? []
  const learners: ReportLearner[] = base.learners.map((l) => {
    const gap = gaps.find((g) => g.child_id === l.id)
    return {
      id: l.id,
      name: l.name,
      average: l.average,
      present: l.present,
      recorded: l.recorded,
      topGap: l.topGap,
      stage: (gap?.stage as ReportLearner['stage']) ?? null,
      notes: notes.filter((n) => n.child_id === l.id).length,
    }
  })

  const avgs = learners.flatMap((l) => (l.average === null ? [] : [l.average]))
  const avg = avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null
  const done = sessionRes.data ?? []
  const doneKids = [...new Set(done.map((s) => s.child_id))]
  const nameOf = new Map(base.learners.map((l) => [l.id, l.name]))
  const lastDone = done[0]
  const lessonsSub = !lastDone
    ? 'Jemma plans a lesson for each learner'
    : doneKids.length === 1
      ? `${nameOf.get(lastDone.child_id)}, ${stamp(lastDone.finished_at ?? new Date().toISOString()).date} · ${lastDone.right ?? 0} of ${lastDone.question_count ?? 0}`
      : `${doneKids.map((id) => nameOf.get(id)).join(', ')}, ${stamp(lastDone.finished_at ?? new Date().toISOString()).date}`

  const reteach = topics.filter((t) => t.status === 'reteach')
  const firstWords = [...new Set(reteach.map((t) => t.name.split(' ')[0]))]
  const puts =
    reteach.length === 0
      ? 'Nothing needs reteaching before term ends.'
      : firstWords.length === 1
        ? `${firstWords[0]} is the one thing to reteach before term ends.`
        : `${reteach.length} topics to reteach before term ends.`
  const headline = avg === null ? 'No tests marked yet.' : `${cls.name.split(' ')[0]} averages ${avg}%. ${puts}`

  const log = logRes.data?.[0]
  const updated = log ? `${stamp(log.at).date}, ${stamp(log.at).time}` : null
  const present = learners.reduce((a, l) => a + l.present, 0)
  const recorded = learners.reduce((a, l) => a + l.recorded, 0)

  return {
    className: cls.name,
    term: termOf(),
    updated,
    headline,
    testTitle: test?.title ?? null,
    testId: test?.id ?? null,
    average: { value: avg, sub: test ? `${test.title.split(':')[0]} · ${dayLabel(test.written_on ?? '')}` : 'No test yet' },
    days: { present, recorded, learners: learners.length },
    lessons: { count: doneKids.length, sub: lessonsSub },
    topics,
    learners,
  }
}
