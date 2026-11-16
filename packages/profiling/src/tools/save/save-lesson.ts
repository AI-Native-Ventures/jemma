import { z } from 'zod'
import { parseAnswer } from '../../logic/answers'
import { isMeaningKind, meaningKeyProblem } from '../../logic/meaning'
import { labelsRefused, leaveOutLabels, type LabelCheck } from '../../logic/no-labels'
import { pictureProblem } from '../../logic/picture'
import { FormatSchema, LessonSchema, type Format, type Lesson, type Question } from '../../schemas/lesson'
import { LabelDropSchema, type LabelDrop } from '../../schemas/no-labels'
import { resolveSpeech } from '../../speech'
import { assertInSchool, contextFor, defineTool, logActivity, ok, type ToolContext } from '../context'
import type { Json } from '../../db'

const MIN_PER_LEVEL = 4

/**
 * Why a question cannot be used, or null when it can: its answer does not fit its `answerKind`, or its picture makes no sense. A key of the four senior
 * kinds (number, expression, equation, point) must be readable by its kind (logic/meaning.ts); the old kinds are checked by `parseAnswer` exactly as
 * they always were. The answer is looked at first. A picture (senior classes only) is checked by `pictureProblem`.
 */
export function answerProblem(q: Question): string | null {
  const answer = answerKeyProblem(q)
  if (answer) return answer
  const picture = q.diagram ? pictureProblem(q.diagram) : null
  return picture ? `picture: ${picture}` : null
}

function answerKeyProblem(q: Question): string | null {
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

export const DIAGRAM_WORDS: Record<string, string> = {
  fraction_bar: 'fraction bars',
  number_line: 'a number line',
  area_model: 'an area model',
  place_value: 'a place value chart',
  bar_chart: 'a bar chart',
  shape_2d: 'shapes',
  grid_area: 'a grid',
  coordinate_plane: 'graphs on a grid',
  triangle: 'triangles',
}

function how(lesson: Lesson): string {
  if (lesson.format === 'audio') return 'as a spoken lesson'
  if (lesson.format === 'reading') return 'as short reading cards'
  const kind = lesson.diagram?.steps[0]?.diagram.kind
  return `with ${(kind && DIAGRAM_WORDS[kind]) ?? 'diagrams'}`
}

/** The plain error of a lesson that cannot go on because dropping the questions with nothing left of their feedback would leave a level too small. */
function levelTooSmall(level: number, lost: number, left: number, because: readonly LabelDrop[]): Error {
  const why = [...new Set(because.map((d) => d.reason))].join(' and ')
  return new Error(
    `Not saved: the "why" or the "right way" of ${lost} ${lost === 1 ? 'question' : 'questions'} of level ${level} had nothing left after leaving out sentences with a label (${why}), and that leaves level ${level} with ${left}. Each level needs at least ${MIN_PER_LEVEL} questions. Write it again about what was seen, with no labels, rankings or careers.`,
  )
}

/**
 * "A profile, never a label": the lines of a lesson that speak to or about the learner pass the word check before the lesson is saved. No database.
 * A lesson is full of maths, and a maths line may say "a clever trick", "the top and bottom of one half" or "the track is 3/4 km": that is not a
 * label on a child. So only a sentence that names the learner, says you or your, or names learners in general is read, and only in the lines a
 * learner is spoken to in: the spoken script, the reading cards, and the "why" and "right way" under each question. A question, an answer, a
 * choice, a title and a picture are never read.
 * A sentence with a label, a ranking or career talk is left out and the rest is kept. A card with nothing left goes. A question (in the warm-up or
 * in the questions) whose "why" or "right way" has nothing left goes whole and is recorded in `dropped` (field `question 3`, `warm-up 2`), so one
 * hint never throws away a lesson. The lesson is refused only when no question is left, or when a level that lost a question is left with fewer
 * than `MIN_PER_LEVEL` (the minimum `dropInvalid` already keeps below). A script with nothing left still refuses the lesson.
 * This runs before the lesson is stored, so a dropped question never exists and nothing keys on the number it had: a session's answers are
 * numbered by their place in the session, and the paper indexes are read from the stored lesson. Careful: the readers parse the stored lesson with
 * `LessonSchema`, which asks for exactly 15 questions (5 per level) and a warm-up of 0 or 2, so a lesson that lost a question only opens for the
 * learner once those readers accept it (`dropInvalid` below already saves such lessons).
 * `check.people` is the learner's first name (Clever, Bright and Smart are first names).
 */
export function screenLesson(lesson: Lesson, check: Pick<LabelCheck, 'people'> = {}): { lesson: Lesson; dropped: LabelDrop[] } {
  const dropped: LabelDrop[] = []
  const read = (text: string, field: string) => {
    const kept = leaveOutLabels(text, field, { ...check, aboutLearnerOnly: true })
    dropped.push(...kept.dropped)
    return kept
  }
  const required = (text: string, field: string, what: string) => {
    const kept = read(text, field)
    if (text.trim() && !kept.text) throw labelsRefused(what, kept.dropped)
    return kept.text
  }
  /** The questions whose "why" and "right way" still have something, and the ones that went whole, with the sentences that emptied them. */
  const feedback = (questions: Question[], group: 'warm-up' | 'question') => {
    const lost: { question: Question; because: LabelDrop[] }[] = []
    const kept = questions.flatMap((q, i) => {
      const why = read(q.why, `${group} ${i + 1} why`)
      const rightWay = read(q.rightWay, `${group} ${i + 1} right way`)
      if ((q.why.trim() && !why.text) || (q.rightWay.trim() && !rightWay.text)) {
        dropped.push({ field: `${group} ${i + 1}`, text: q.prompt.trim() || `${group} ${i + 1}`, reason: 'left out whole: nothing was left of its "why" or its "right way"' })
        lost.push({ question: q, because: [...why.dropped, ...rightWay.dropped] })
        return []
      }
      return [{ ...q, why: why.text, rightWay: rightWay.text }]
    })
    return { kept, lost }
  }

  const audio = lesson.audio ? { ...lesson.audio, script: required(lesson.audio.script, 'spoken script', 'the spoken script') } : undefined
  const cards = lesson.cards?.flatMap((card, i) => {
    const heading = read(card.heading, `card ${i + 1} heading`)
    const body = read(card.body, `card ${i + 1} text`)
    if ((card.heading.trim() && !heading.text) || (card.body.trim() && !body.text)) {
      dropped.push({ field: `card ${i + 1}`, text: card.heading.trim(), reason: 'left out whole: nothing was left of its heading or its text' })
      return []
    }
    return [{ ...card, heading: heading.text, body: body.text }]
  })
  if (lesson.format === 'reading' && lesson.cards?.length && !cards?.length) {
    throw labelsRefused('every reading card', dropped.filter((d) => /^card \d+ (heading|text)$/.test(d.field)))
  }
  const warmupRead = feedback(lesson.warmup, 'warm-up')
  const questionsRead = feedback(lesson.questions, 'question')
  const warmup = warmupRead.kept
  const questions = questionsRead.kept
  if (questionsRead.lost.length) {
    const sentences = questionsRead.lost.flatMap((l) => l.because)
    if (!questions.length) throw labelsRefused('the "why" or the "right way" of every question', sentences)
    for (const level of [1, 2, 3] as const) {
      const lostHere = questionsRead.lost.filter((l) => l.question.difficulty === level)
      const left = questions.filter((q) => q.difficulty === level).length
      if (lostHere.length && left < MIN_PER_LEVEL) throw levelTooSmall(level, lostHere.length, left, lostHere.flatMap((l) => l.because))
    }
  }
  if (dropped.length === 0) return { lesson, dropped }
  const screened: Lesson = { ...lesson, warmup, questions }
  if (audio) screened.audio = audio
  if (cards?.length) screened.cards = cards
  else delete screened.cards
  return { lesson: screened, dropped }
}

const hasQuestions = (content: unknown) =>
  typeof content === 'object' && content !== null && Array.isArray((content as { questions?: unknown }).questions) && (content as { questions: unknown[] }).questions.length > 0

export const saveLesson = defineTool({
  name: 'save_lesson',
  description:
    "Save the lesson for a planned session. Every answer is checked with parseAnswer; a bad answer is rejected with its question number so you can regenerate once, then call again with dropInvalid true to drop it (each level keeps at least 4). A lesson that already exists is returned as is. Audio lessons get speech once.",
  input: z.object({ sessionId: z.string(), lesson: LessonSchema, dropInvalid: z.boolean().optional() }),
  output: z.object({
    lessonId: z.string(),
    format: FormatSchema,
    /** What the word check left out of the lines that speak to or about the learner (a label, a ranking or career talk). Missing when nothing was left out. */
    dropped: z.array(LabelDropSchema).optional(),
  }),
  async run(base: ToolContext, { sessionId, lesson: written, dropInvalid }) {
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

    if (written.format !== row.format) throw new Error(`this session is planned as ${row.format}, not ${written.format}`)
    // The lines that speak to or about the learner pass the word check first. The learner's name is not a label, whatever it is.
    const learner = await ok(db.from('children').select('first_name').eq('id', session.child_id).single())
    const { lesson, dropped } = screenLesson(written, { people: [learner.first_name] })
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
    return dropped.length ? { lessonId: row.id, format: kept.format satisfies Format, dropped } : { lessonId: row.id, format: kept.format satisfies Format }
  },
})
