import { notFound } from 'next/navigation'
import { markAnswer } from '@jemma/profiling/logic'
import { AnswerKeyItemSchema, type AnswerKeyItem } from '@jemma/profiling/schemas'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

/** Under this confidence a read answer is "not sure" (same default as the mark_paper tool). */
export const READ_MIN = 0.8
const ZONE = 'Africa/Johannesburg'

/** `14:06` in the school's time zone. */
export function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: ZONE })
}

/** `Mon 26 Oct 2026`, as the snap board writes the test date. */
export function longDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: ZONE }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('weekday')} ${get('day')} ${get('month')} ${get('year')}`
}

export type ClassTopic = { id: string; name: string; term: number }

/** Topics on the class's approved map, in map order. */
export async function getClassTopics(classId: string): Promise<ClassTopic[]> {
  const supabase = await createSupabaseServer()
  const { data: maps } = await supabase.from('curriculum_maps').select('id').eq('class_id', classId).eq('status', 'approved')
  if (!maps?.length) return []
  const { data } = await supabase
    .from('topics')
    .select('id, name, term, position')
    .in('map_id', maps.map((m) => m.id))
    .order('term')
    .order('position')
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, term: t.term }))
}

export type TestRow = { id: string; title: string; writtenOn: string | null; outOf: number; keyStatus: 'draft' | 'approved' | null }

/** Tests of a class, newest first, with where their key stands. */
export async function getClassTests(classId: string): Promise<TestRow[]> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('tests')
    .select('id, title, written_on, out_of, created_at, answer_keys(status)')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
  return (data ?? []).map((t) => {
    const key = Array.isArray(t.answer_keys) ? t.answer_keys[0] : t.answer_keys
    return { id: t.id, title: t.title, writtenOn: t.written_on, outOf: t.out_of, keyStatus: key?.status ?? null }
  })
}

export type KeyView = {
  test: { id: string; title: string; outOf: number; classId: string }
  status: 'draft' | 'approved' | null
  items: AnswerKeyItem[]
  memoPath: string | null
  memoUrl: string | null
  memoAt: string | null
  /** Draft key with no memo: Jemma worked the answers out itself. */
  fromScratch: boolean
  createdAt: string | null
}

/** A test with its answer key (RLS: only the class teacher sees it). Not found when the test is not theirs. */
export async function getKeyView(classId: string, testId: string): Promise<KeyView> {
  const supabase = await createSupabaseServer()
  const { data: test } = await supabase.from('tests').select('id, title, out_of, class_id').eq('id', testId).eq('class_id', classId).maybeSingle()
  if (!test) notFound()
  const { data: key } = await supabase.from('answer_keys').select('status, items, memo_path, created_at').eq('test_id', testId).maybeSingle()
  const items = key ? (Array.isArray(key.items) ? key.items : []).flatMap((i) => {
    const parsed = AnswerKeyItemSchema.safeParse(i)
    return parsed.success ? [parsed.data] : []
  }) : []
  let memoUrl: string | null = null
  if (key?.memo_path) memoUrl = await signedUrl('papers', key.memo_path)
  return {
    test: { id: test.id, title: test.title, outOf: test.out_of, classId: test.class_id },
    status: key?.status ?? null,
    items: items.sort((a, b) => a.n - b.n),
    memoPath: key?.memo_path ?? null,
    memoUrl,
    memoAt: key?.created_at ?? null,
    fromScratch: !!key && !key.memo_path,
    createdAt: key?.created_at ?? null,
  }
}

/** Short-lived link to a private file. Service role signs it after the caller's RLS read proved access. */
export async function signedUrl(bucket: string, path: string, seconds = 3600): Promise<string | null> {
  const { data } = await createSupabaseAdmin().storage.from(bucket).createSignedUrl(path, seconds)
  return data?.signedUrl ?? null
}

export type PileRow = {
  id: string
  position: number
  pages: number
  status: 'queued' | 'reading' | 'needs_you' | 'marked' | 'failed'
  childName: string | null
  nameRead: string | null
  total: number | null
  hasUser: boolean
  createdAt: string
}

/** Papers of a test in snap order. */
export async function getPile(testId: string): Promise<PileRow[]> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('papers')
    .select('id, status, name_read, total, created_at, children(first_name, user_id), paper_pages(id)')
    .eq('test_id', testId)
    .order('created_at')
    .order('id')
  return (data ?? []).map((p, i) => ({
    id: p.id,
    position: i + 1,
    pages: p.paper_pages.length || 1,
    status: p.status,
    childName: p.children?.first_name ?? null,
    nameRead: p.name_read,
    total: p.total,
    hasUser: !!p.children?.user_id,
    createdAt: p.created_at,
  }))
}

/** The last things Jemma did for this class since `since`, oldest first, as `{ at, text }`. */
export async function getTestLog(classId: string, since: string, limit = 3) {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('activity_log')
    .select('at, text')
    .eq('class_id', classId)
    .gte('at', since)
    .order('at', { ascending: false })
    .limit(limit)
  return (data ?? []).reverse().map((r) => ({ at: hhmm(r.at), text: r.text }))
}

export type ReviewResult = {
  id: string
  n: number
  prompt: string
  answer: string
  confidence: number
  correct: boolean
  mark: number
  previous: string | null
  changed: boolean
  keyAnswer: string | null
  unsure: boolean
  crop: { x: number; y: number; w: number; h: number } | null
}

export type NeedsItem = {
  id: string
  kind: string
  status: string
  title: string
  detail: string
  paperId: string
}

export type PaperView = {
  paper: { id: string; status: string; nameRead: string | null; total: number | null; createdAt: string }
  test: { id: string; title: string; outOf: number }
  child: { id: string; firstName: string } | null
  results: ReviewResult[]
  pages: { id: string; pageNo: number; url: string | null }[]
}

/** One teacher paper with its marks, for the review, paper and fix screens. */
export async function getPaperView(classId: string, paperId: string): Promise<PaperView> {
  const supabase = await createSupabaseServer()
  const { data: paper } = await supabase
    .from('papers')
    .select('id, status, name_read, total, created_at, test_id, child_id, children(id, first_name), paper_pages(id, page_no, storage_path)')
    .eq('id', paperId)
    .maybeSingle()
  if (!paper?.test_id) notFound()
  const { data: test } = await supabase.from('tests').select('id, title, out_of, class_id').eq('id', paper.test_id).maybeSingle()
  if (!test || test.class_id !== classId) notFound()
  const [{ data: key }, { data: rows }] = await Promise.all([
    supabase.from('answer_keys').select('items').eq('test_id', test.id).maybeSingle(),
    supabase
      .from('question_results')
      .select('id, n, prompt, answer_read, read_confidence, correct, mark, previous_answer, changed_by, crop')
      .eq('paper_id', paperId)
      .order('n'),
  ])
  const keyItems = new Map<number, AnswerKeyItem>()
  for (const i of Array.isArray(key?.items) ? key.items : []) {
    const parsed = AnswerKeyItemSchema.safeParse(i)
    if (parsed.success) keyItems.set(parsed.data.n, parsed.data)
  }
  const results = (rows ?? []).map((r): ReviewResult => {
    const keyAnswer = keyItems.get(r.n)?.answer ?? null
    const comparable = keyAnswer === null ? true : markAnswer(r.answer_read, keyAnswer).comparable
    const crop = r.crop as ReviewResult['crop']
    return {
      id: r.id,
      n: r.n,
      prompt: r.prompt,
      answer: r.answer_read,
      confidence: r.read_confidence,
      correct: r.correct,
      mark: r.mark,
      previous: r.previous_answer,
      changed: r.changed_by !== null,
      keyAnswer,
      unsure: r.changed_by === null && (r.read_confidence < READ_MIN || !comparable),
      crop: crop && typeof crop.x === 'number' ? crop : null,
    }
  })
  const pages = await Promise.all(
    [...paper.paper_pages]
      .sort((a, b) => a.page_no - b.page_no)
      .map(async (p) => ({ id: p.id, pageNo: p.page_no, url: await signedUrl('papers', p.storage_path) })),
  )
  return {
    paper: { id: paper.id, status: paper.status, nameRead: paper.name_read, total: paper.total, createdAt: paper.created_at },
    test: { id: test.id, title: test.title, outOf: test.out_of },
    child: paper.children ? { id: paper.children.id, firstName: paper.children.first_name } : null,
    results,
    pages,
  }
}

/** A Needs you item owned by the signed-in teacher. */
export async function getNeedsItem(itemId: string): Promise<NeedsItem> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.from('needs_you_items').select('id, kind, status, title, detail, ref_id').eq('id', itemId).maybeSingle()
  if (!data) notFound()
  return { id: data.id, kind: data.kind, status: data.status, title: data.title, detail: data.detail, paperId: data.ref_id }
}

export type RosterRow = { id: string; firstName: string; hasPaper: boolean }

/** Learners in the class, and whether each already has a paper in this test. */
export async function getRoster(classId: string, testId: string): Promise<RosterRow[]> {
  const supabase = await createSupabaseServer()
  const { data: enrolled } = await supabase.from('enrolments').select('child_id').eq('class_id', classId)
  const ids = (enrolled ?? []).map((e) => e.child_id)
  if (!ids.length) return []
  const [{ data: kids }, { data: papers }] = await Promise.all([
    supabase.from('children').select('id, first_name').in('id', ids).order('created_at'),
    supabase.from('papers').select('child_id').eq('test_id', testId).not('child_id', 'is', null),
  ])
  const has = new Set((papers ?? []).map((p) => p.child_id))
  return (kids ?? []).map((k) => ({ id: k.id, firstName: k.first_name, hasPaper: has.has(k.id) }))
}
