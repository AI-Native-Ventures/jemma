import { z } from 'zod'
import { parseAnswer } from '../../logic/answers'
import { isMeaningKind, meaningKeyProblem } from '../../logic/meaning'
import { FormatSchema, LessonSchema, type Format, type Lesson, type Question } from '../../schemas/lesson'
import { resolveSpeech } from '../../speech'
import { assertInSchool, contextFor, defineTool, logActivity, ok, type ToolContext } from '../context'
import type { Json } from '../../db'

const MIN_PER_LEVEL = 4

/**
 * Why an answer does not fit its `answerKind`, or null when it does. A key of the four senior kinds (number, expression, equation, point) must be
 * readable by its kind (logic/meaning.ts); the old kinds are checked by `parseAnswer` exactly as they always were.
 */
export function answerProblem(q: Question): string | null {
  if (isMeaningKind(q.answerKind)) return meaningKeyProblem(q.answerKind, q.answer)
  const parsed = parseAnswer(q.answer)
  const fine =
    q.answerKind === 'choice' ? parsed.kind === 'choice'
    : q.answerKind === 'money' ? parsed.kind === 'money'
    : q.answerKind === 'whole' ? parsed.kind === 'number' && parsed.value.d === 1n
    : parsed.kind === 'number'
  return fine ? null : `answer "${q.answer}" is not a ${q.answerKind}`
}

/** Indices (0 based) of questions whose answer does not parse as its kind. */
export function badQuestions(lesson: Lesson): { warmup: number[]; questions: number[] } {
  const bad = (qs: Question[]) => qs.flatMap((q, i) => (answerProblem(q) ? [i] : []))
  return { warmup: bad(lesson.warmup), questions: bad(lesson.questions) }
}

const DIAGRAM_WORDS: Record<string, string> = {
  fraction_bar: 'fraction bars',
  number_line: 'a number line',
  area_model: 'an area model',
  place_value: 'a place value chart',
  bar_chart: 'a bar chart',
  shape_2d: 'shapes',
  grid_area: 'a grid',
}

function how(lesson: Lesson): string {
  if (lesson.format === 'audio') return 'as a spoken lesson'
  if (lesson.format === 'reading') return 'as short reading cards'
  const kind = lesson.diagram?.steps[0]?.diagram.kind
  return `with ${(kind && DIAGRAM_WORDS[kind]) ?? 'diagrams'}`
}

const hasQuestions = (content: unknown) =>
  typeof content === 'object' && content !== null && Array.isArray((content as { questions?: unknown }).questions) && (content as { questions: unknown[] }).questions.length > 0

export const saveLesson = defineTool({
  name: 'save_lesson',
  description:
    "Save the lesson for a planned session. Every answer is checked with parseAnswer; a bad answer is rejected with its question number so you can regenerate once, then call again with dropInvalid true to drop it (each level keeps at least 4). A lesson that already exists is returned as is. Audio lessons get speech once.",
  input: z.object({ sessionId: z.string(), lesson: LessonSchema, dropInvalid: z.boolean().optional() }),
  output: z.object({ lessonId: z.string(), format: FormatSchema }),
  async run(base: ToolContext, { sessionId, lesson, dropInvalid }) {
    await assertInSchool(base, 'sessions', [sessionId])
    const ctx = await contextFor(base, 'sessions', sessionId)
    const db = ctx.db
    const session = await ok(db.from('sessions').select('child_id, lesson_id, topic_id, topic_name, format').eq('id', sessionId).single())
    let lessonId = session.lesson_id
    if (!lessonId) {
      // A planned session without a lesson row yet: create it from the session's topic and format.
      if (!session.topic_name || !session.format) throw new Error(`session ${sessionId} has no topic or format`)
      const created = await ok(
        db.from('lessons').insert({ child_id: session.child_id, topic_id: session.topic_id, topic_name: session.topic_name, format: session.format, content: {} as NonNullable<Json> }).select('id').single(),
      )
      lessonId = created.id
      const link = await db.from('sessions').update({ lesson_id: lessonId }).eq('id', sessionId)
      if (link.error) throw new Error(link.error.message)
    }
    const row = await ok(db.from('lessons').select('id, format, topic_name, content, audio_path').eq('id', lessonId).single())
    if (hasQuestions(row.content)) return { lessonId: row.id, format: row.format }

    if (lesson.format !== row.format) throw new Error(`this session is planned as ${row.format}, not ${lesson.format}`)
    if (lesson.format === 'diagram' && !lesson.diagram) throw new Error('a diagram lesson needs a diagram')
    if (lesson.format === 'reading' && !lesson.cards?.length) throw new Error('a reading lesson needs cards')
    if (lesson.format === 'audio' && !lesson.audio?.script) throw new Error('an audio lesson needs an audio script')

    const bad = badQuestions(lesson)
    if (bad.warmup.length) {
      throw new Error(`warm-up ${bad.warmup.map((i) => `question ${i + 1} (${answerProblem(lesson.warmup[i]!)})`).join(', ')}`)
    }
    let kept = lesson
    if (bad.questions.length) {
      const list = bad.questions.map((i) => `question ${i + 1} (${answerProblem(lesson.questions[i]!)})`).join(', ')
      if (!dropInvalid) throw new Error(`bad answers: ${list}`)
      kept = { ...lesson, questions: lesson.questions.filter((_, i) => !bad.questions.includes(i)) }
      for (const level of [1, 2, 3]) {
        if (kept.questions.filter((q) => q.difficulty === level).length < MIN_PER_LEVEL) {
          throw new Error(`dropping ${list} leaves level ${level} with fewer than ${MIN_PER_LEVEL}: each level needs at least 4 questions`)
        }
      }
    }

    // Speech first, once. If it fails or none is set up, the player falls back to browser speech.
    let audioPath: string | null = null
    const synth = kept.format === 'audio' ? resolveSpeech(ctx) : null
    if (synth && kept.audio) {
      try {
        const spoken = await synth.synthesize(kept.audio.script)
        const path = `${row.id}.mp3`
        const up = await db.storage.from('lesson-audio').upload(path, spoken.bytes, { contentType: spoken.mediaType, upsert: true })
        if (!up.error) audioPath = path
      } catch {
        audioPath = null
      }
    }

    const upd = await db
      .from('lessons')
      .update({ content: JSON.parse(JSON.stringify(kept)) as NonNullable<Json>, format: kept.format, audio_path: audioPath })
      .eq('id', row.id)
    if (upd.error) throw new Error(upd.error.message)
    const warm = await db.from('sessions').update({ warmup: JSON.parse(JSON.stringify(kept.warmup)) as NonNullable<Json> }).eq('id', sessionId)
    if (warm.error) throw new Error(warm.error.message)

    const topic = row.topic_name.charAt(0).toLowerCase() + row.topic_name.slice(1)
    await logActivity(ctx, {
      childId: session.child_id,
      tool: 'save_lesson',
      text: `Built tonight's ${kept.minutes}-minute lesson on ${topic}, ${how(kept)}`,
    })
    return { lessonId: row.id, format: kept.format satisfies Format }
  },
})
