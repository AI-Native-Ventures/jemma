import { z } from 'zod'
import { markAnswer, matchName } from '../../logic'
import { AnswerKeyItemSchema } from '../../schemas/curriculum'
import { PaperReadSchema, type PaperRead } from '../../schemas/papers'
import { contextFor, defineTool, logActivity, maybe, ok, type ToolContext } from '../context'

const DEFAULT_READ_CONFIDENCE_MIN = 0.8

/** Under this confidence an answer or a name is not trusted: it goes to Needs you instead of being marked silently. */
export function readConfidenceMin(ctx: ToolContext): number {
  const fromEnv = (ctx.env as Record<string, unknown>).READ_CONFIDENCE_MIN ?? globalThis.process?.env?.READ_CONFIDENCE_MIN
  const n = Number(fromEnv)
  return fromEnv !== undefined && fromEnv !== '' && Number.isFinite(n) ? n : DEFAULT_READ_CONFIDENCE_MIN
}

const PROBLEM_TITLE: Record<NonNullable<PaperRead['problem']>, string> = {
  too_dark: 'Photo too dark',
  blurry: 'Photo too blurry',
  cut_off: 'Photo cut off',
  not_a_test: 'Not a test paper',
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export const markPaper = defineTool({
  name: 'mark_paper',
  description:
    'Save what the model read from one paper. Code marks every answer against the answer key (the model never decides a mark), matches the name to the class roster and routes anything unsure to Needs you.',
  input: z.object({ paperId: z.string(), read: PaperReadSchema }),
  output: z.object({
    childId: z.string().nullable(),
    total: z.number(),
    unsure: z.array(z.number()),
    status: z.enum(['marked', 'needs_you', 'failed']),
  }),
  async run(base, { paperId, read }) {
    const ctx = await contextFor(base, 'papers', paperId)
    const db = ctx.db
    const min = readConfidenceMin(ctx)
    const paper = await ok(db.from('papers').select('id, test_id, child_id, owner').eq('id', paperId).single())

    // Re-running replaces the earlier read and its open items.
    await ok(db.from('question_results').delete().eq('paper_id', paperId).select('id'))
    await ok(db.from('needs_you_items').delete().eq('ref_id', paperId).eq('status', 'open').select('id'))

    const teacherPaper = !!paper.test_id
    const test = paper.test_id ? await ok(db.from('tests').select('id, title, class_id').eq('id', paper.test_id).single()) : null
    const cls = test ? await ok(db.from('classes').select('id, teacher_id').eq('id', test.class_id).single()) : null
    const classId = cls?.id
    const owner = async (): Promise<string | null> => {
      if (cls) return cls.teacher_id
      if (!paper.child_id) return null
      const link = await maybe(
        db.from('parent_links').select('parent_id').eq('child_id', paper.child_id).eq('status', 'approved').limit(1).maybeSingle(),
      )
      return link?.parent_id ?? null
    }
    const needsYou = async (kind: 'check_answer' | 'unreadable_name' | 'confirm_scan', childId: string | null, title: string, detail: string) => {
      const ownerId = await owner()
      if (!ownerId) return
      await ok(
        db
          .from('needs_you_items')
          .insert({ owner_id: ownerId, school_id: ctx.schoolId, child_id: childId, kind, ref_id: paperId, status: 'open', title, detail })
          .select('id'),
      )
    }
    const setPaper = async (patch: Record<string, unknown>) => {
      await ok(db.from('papers').update(patch as never).eq('id', paperId).select('id'))
    }

    if (!read.pageUsable) {
      const problem = read.problem ?? 'blurry'
      const label = PROBLEM_TITLE[problem]
      if (teacherPaper) {
        await setPaper({ status: 'needs_you', error: problem, name_read: read.nameAsWritten })
        await needsYou('confirm_scan', paper.child_id, label, `${test!.title} · retake the photo or check it yourself`)
        await logActivity(ctx, { text: 'Read 1 paper. 1 unsure, sent to you.', tool: 'mark_paper', classId, childId: paper.child_id ?? undefined })
        return { childId: paper.child_id, total: 0, unsure: [], status: 'needs_you' as const }
      }
      await setPaper({ status: 'failed', error: problem })
      await logActivity(ctx, { text: `${label}, asked for a new photo`, tool: 'mark_paper', childId: paper.child_id ?? undefined })
      return { childId: paper.child_id, total: 0, unsure: [], status: 'failed' as const }
    }

    // Who wrote it.
    let childId = paper.child_id
    let matchedName: string | null = null
    if (teacherPaper) {
      const enrolled = await ok(db.from('enrolments').select('child_id').eq('class_id', test!.class_id))
      const kids = enrolled.length
        ? await ok(db.from('children').select('id, first_name, last_name').in('id', enrolled.map((e) => e.child_id)))
        : []
      const roster = kids.map((k) => ({ id: k.id, name: [k.first_name, k.last_name].filter(Boolean).join(' ') }))
      const m = read.nameAsWritten ? matchName(read.nameAsWritten, roster) : { childId: null, confidence: 0 }
      if (m.childId && Math.min(m.confidence, read.nameConfidence) >= min) {
        childId = m.childId
        matchedName = kids.find((k) => k.id === m.childId)!.first_name
      }
    }

    // Mark in code.
    const answerKey = test ? await maybe(db.from('answer_keys').select('items').eq('test_id', test.id).maybeSingle()) : null
    const key = answerKey ? z.array(AnswerKeyItemSchema).parse(answerKey.items) : []
    if (teacherPaper && key.length === 0) throw new Error('no answer key for this test')
    const byN = new Map(read.answers.map((a) => [a.n, a]))
    const topicIds = new Map<string, string>()
    if (cls) {
      const maps = await ok(db.from('curriculum_maps').select('id').eq('class_id', cls.id))
      const topics = maps.length ? await ok(db.from('topics').select('id, name').in('map_id', maps.map((m) => m.id))) : []
      for (const t of topics) topicIds.set(t.name, t.id)
    }

    const unsure: number[] = []
    const lines: { n: number; read: string }[] = []
    let total = 0
    const rows = teacherPaper
      ? key.map((item) => {
          const a = byN.get(item.n)
          const answerRead = a?.answerAsRead ?? ''
          const confidence = a?.confidence ?? 0
          const { correct, comparable } = markAnswer(answerRead, item.answer)
          if (confidence < min || !comparable) {
            unsure.push(item.n)
            lines.push({ n: item.n, read: answerRead })
          }
          const mark = correct ? item.marks : 0
          total += mark
          return {
            n: item.n, prompt: item.prompt, answer_read: answerRead, read_confidence: confidence, correct, mark,
            topic_id: topicIds.get(item.topicName) ?? null, topic_name: item.topicName, crop: a?.crop ?? null,
          }
        })
      : // Homework has no key: the answers are stored unmarked and the parent confirms the scan.
        read.answers.map((a) => ({
          n: a.n, prompt: '', answer_read: a.answerAsRead, read_confidence: a.confidence, correct: false, mark: 0,
          topic_id: null, topic_name: 'Homework', crop: a.crop ?? null,
        }))

    if (childId && rows.length) {
      await ok(db.from('question_results').insert(rows.map((r) => ({ ...r, paper_id: paperId, child_id: childId! }))).select('id'))
    }
    await setPaper({ child_id: childId, name_read: read.nameAsWritten, total: childId && teacherPaper ? total : null, error: null })

    const logCtx = { tool: 'mark_paper', classId, childId: childId ?? undefined }
    if (matchedName) await logActivity(ctx, { ...logCtx, text: `Matched ${matchedName}'s name to your class list` })

    if (!teacherPaper) {
      const hasParent = !!(await owner())
      if (hasParent && childId) {
        await needsYou('confirm_scan', childId, 'Check the scan', `${plural(rows.length, 'answer')} read, please confirm`)
        await setPaper({ status: 'needs_you' })
        await logActivity(ctx, { ...logCtx, text: `Read ${plural(rows.length, 'answer')} from the homework photo` })
        return { childId, total: 0, unsure: [], status: 'needs_you' as const }
      }
      await setPaper({ status: 'marked' })
      return { childId, total: 0, unsure: [], status: 'marked' as const }
    }

    await logActivity(ctx, { ...logCtx, text: `Marked ${plural(rows.length, 'answer')} against your key` })
    if (!childId) {
      await needsYou('unreadable_name', null, 'Whose paper is this?', `${test!.title} · I read "${read.nameAsWritten ?? 'no name'}"`)
    }
    if (unsure.length) {
      const first = matchedName ?? 'this learner'
      await needsYou(
        'check_answer',
        childId,
        `Check ${first}'s answers`,
        `${test!.title} · ${lines.map((l) => `question ${l.n} · I read ${l.read || 'nothing'}`).join(' · ')}`,
      )
    }
    const flagged = unsure.length + (childId ? 0 : 1)
    const status = flagged ? ('needs_you' as const) : ('marked' as const)
    await setPaper({ status })
    await logActivity(ctx, { ...logCtx, text: flagged ? `Read 1 paper. ${flagged} unsure, sent to you.` : 'Read 1 paper.' })
    return { childId, total, unsure, status }
  },
})
