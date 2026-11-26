import { z } from 'zod'
import { parseAnswer } from '../../logic/answers'
import { choicePictureProblem, isPickQuestion, pickKeyProblem } from '../../logic/answers/pick'
import { blocksKeyProblem, blocksProblem } from '../../logic/answers/blocks'
import { groupsKeyProblem, groupsProblem, tidyGroups } from '../../logic/answers/groups'
import { plotKeyProblem, plotProblem, sketchKeyProblem, tidyPlot } from '../../logic/answers/plot'
import { shadeKeyProblem, shadeProblem } from '../../logic/answers/shade'
import { tapKeyProblem, tapProblem, tidyTap } from '../../logic/answers/tap'
import { lineKeyProblem, lineProblem, tidyLine } from '../../logic/answers/line'
import { pinKeyProblem, pinProblem } from '../../logic/answers/pin'
import { clockFaceProblem, clockKeyProblem, clockProblem } from '../../logic/answers/clock'
import { matchKeyProblem, matchProblem, tidyMatch } from '../../logic/answers/match'
import { proofKeyProblem, proofProblem, tidyProof } from '../../logic/answers/proof'
import { generalKeyProblem, generalProblem, tidyGeneral } from '../../logic/answers/general'
import { graphMatchKeyProblem, graphMatchProblem, tidyGraphMatch } from '../../logic/answers/graph-match'
import { firstPrinciplesKeyProblem, firstPrinciplesProblem, tidyFirstPrinciples } from '../../logic/answers/first-principles'
import { columnsKeyProblem, columnsProblem } from '../../logic/answers/columns'
import { graphKeyProblem, graphProblem, tidyGraph } from '../../logic/answers/graph'
import { isListKind, listKeyProblem } from '../../logic/answers/lists'
import { isSeniorQuestion, quantityProblem, readCents, stripUnit } from '../../logic/answers/quantity'
import { degreeEquationOf, degreeGraphOf, graphEquationOf, isMeaningKind, workedLineOf, meaningKeyProblem, readNumber, sameExpression } from '../../logic/meaning'
import { labelsRefused, leaveOutLabels, type LabelCheck } from '../../logic/no-labels'
import { pictureProblem, questionPictureProblem } from '../../logic/picture'
import { cleanSteps } from '../../logic/steps'
import { FormatSchema, LessonSchema, MIN_QUESTIONS_PER_LEVEL, type Format, type Lesson, type Question } from '../../schemas/lesson'
import { LabelDropSchema, type LabelDrop } from '../../schemas/no-labels'
import { resolveSpeech } from '../../speech'
import { assertInSchool, contextFor, defineTool, logActivity, ok, type ToolContext } from '../context'
import type { Json } from '../../db'

const MIN_PER_LEVEL = MIN_QUESTIONS_PER_LEVEL

/**
 * What is wrong with the picture of a question, or null. A senior question (it has `steps`, a senior kind or a senior picture) is checked by `pictureProblem`,
 * as it always was. P166: a Grade 1 to 6 question may carry one of the seven primary pictures, and its picture must also be small enough for a young learner
 * (`questionPictureProblem`).
 */
export function questionPictureOf(q: Question): string | null {
  if (!q.diagram) return null
  return isSeniorQuestion(q) ? pictureProblem(q.diagram) : questionPictureProblem(q.diagram)
}

/**
 * Why a question cannot be used, or null when it can: its answer does not fit its `answerKind`, or its picture makes no sense. A key of the four senior
 * kinds (number, expression, equation, point) must be readable by its kind (logic/meaning.ts); the old kinds are checked by `parseAnswer` exactly as
 * they always were. The answer is looked at first. A picture is checked by `questionPictureOf`.
 */
export function answerProblem(q: Question): string | null {
  const answer = answerKeyProblem(q)
  if (answer) return answer
  // P167: a graph the learner draws can be drawn, and its key is one value for each empty bar, each one the bar can show. The graph is the question's picture.
  if (q.graph) {
    if (q.diagram || q.choices?.length) return 'graph: a question that draws a graph has no other picture and no choices'
    const graph = graphProblem(q.graph) ?? graphKeyProblem({ ...q, graph: q.graph }, readNumber)
    if (graph) return `graph: ${graph}`
  }
  // P168: a sum in columns can be shown on a phone, and its key is its true answer. The sum is the question's picture.
  if (q.columns) {
    if (q.diagram || q.graph || q.choices?.length) return 'columns: a sum in columns has no picture, no graph and no choices'
    const columns = columnsProblem(q.columns) ?? columnsKeyProblem({ ...q, columns: q.columns })
    if (columns) return `columns: ${columns}`
  }
  // P169: a number built with blocks needs only the blocks the learner has. The mat is the question's picture.
  if (q.blocks) {
    if (q.diagram || q.graph || q.columns || q.choices?.length) return 'blocks: a number built with blocks has no picture, no graph, no sum in columns and no choices'
    const blocks = blocksProblem(q.blocks) ?? blocksKeyProblem({ ...q, blocks: q.blocks })
    if (blocks) return `blocks: ${blocks}`
  }
  // P170: things to sort into groups: each in one group, and every group used.
  if (q.groups) {
    if (q.diagram || q.graph || q.columns || q.blocks || q.choices?.length) return 'groups: things sorted into groups have no picture, no graph and no choices'
    const groups = groupsProblem(q.groups) ?? groupsKeyProblem({ ...q, groups: q.groups })
    if (groups) return `groups: ${groups}`
  }
  // P171: points placed on a grid: a grid a phone can show, and a key that is a point on it for each point to place.
  if (q.plot) {
    if (q.diagram || q.choices?.length) return 'plot: a grid to place points on is the picture of its question, and it has no choices'
    const plot = plotProblem(q.plot) ?? plotKeyProblem({ ...q, plot: q.plot }, readNumber)
    if (plot) return `plot: ${plot}`
    // P176: a sketch: its key points make one parabola, and it is the graph of the equation in the question.
    const sketch = q.plot.curve ? sketchKeyProblem({ ...q, plot: q.plot }, readNumber, graphEquationOf, degreeGraphOf) : null
    if (sketch) return `plot: ${sketch}`
  }
  // P172: a shape to shade: a shape a phone can show, and a key that is a number of its parts.
  if (q.shade) {
    if (q.diagram || q.graph || q.columns || q.blocks || q.groups || q.choices?.length) return 'shade: a shape to shade is the picture of its question, and it has no choices'
    const shade = shadeProblem(q.shade) ?? shadeKeyProblem({ ...q, shade: q.shade })
    if (shade) return `shade: ${shade}`
  }
  // P173: shapes to tap: a picture a phone can show, and a key of 2 or more of its shapes.
  if (q.tap) {
    if (q.diagram || q.graph || q.columns || q.blocks || q.groups || q.shade || q.choices?.length) return 'tap: shapes to tap are the picture of their question, and it has no choices'
    const tap = tapProblem(q.tap) ?? tapKeyProblem({ ...q, tap: q.tap })
    if (tap) return `tap: ${tap}`
  }
  // P174: a line to draw: a grid a phone can show, and a key of two different corners of it.
  if (q.line) {
    if (q.diagram || q.plot || q.choices?.length) return 'line: a grid to draw a line on is the picture of its question, and it has no choices'
    const line = lineProblem(q.line) ?? lineKeyProblem({ ...q, line: q.line }, readNumber)
    if (line) return `line: ${line}`
  }
  // P179: an identity to prove: two sides that are equal, and a key that is a proof of it, line by line.
  if (q.proof) {
    if (q.diagram || q.plot || q.line || q.choices?.length) return 'proof: an identity to prove has no picture and no choices'
    const proof = proofProblem(q.proof, sameExpression) ?? proofKeyProblem({ ...q, proof: q.proof }, sameExpression)
    if (proof) return `proof: ${proof}`
  }
  // P185: a derivative from first principles: a function of x that can be read, and a key whose every line follows, down to f′(x).
  if (q.firstPrinciples) {
    if (q.diagram || q.plot || q.line || q.proof || q.general || q.graphMatch || q.choices?.length) return 'firstPrinciples: a derivative from first principles has no picture and no choices'
    const principles = firstPrinciplesProblem(q.firstPrinciples, workedLineOf) ?? firstPrinciplesKeyProblem({ ...q, firstPrinciples: q.firstPrinciples }, workedLineOf)
    if (principles) return `firstPrinciples: ${principles}`
  }
  // P184: graphs to match to their equations: small planes a phone can show, and a key whose every equation is its graph and no other.
  if (q.graphMatch) {
    if (q.diagram || q.plot || q.line || q.proof || q.general || q.choices?.length) return 'graphMatch: graphs to match are the picture of their question, and it has no choices'
    const graphs = graphMatchProblem(q.graphMatch, pictureProblem) ?? graphMatchKeyProblem({ ...q, graphMatch: q.graphMatch }, graphEquationOf, degreeGraphOf)
    if (graphs) return `graphMatch: ${graphs}`
  }
  // P180: every solution of a trig equation: a key whose families are the solutions of the equation in the question, every one of them.
  if (q.general) {
    if (q.diagram || q.plot || q.line || q.proof || q.choices?.length) return 'general: every solution has no picture and no choices'
    const general = generalProblem(q.general) ?? generalKeyProblem({ ...q, general: q.general }, readNumber, degreeEquationOf)
    if (general) return `general: ${general}`
  }
  // P175: a pin on a number line: a line a phone can show, and a key on one of its marks.
  if (q.pin) {
    if (q.diagram || q.choices?.length) return 'pin: a number line to put a pin on is the picture of its question, and it has no choices'
    const pin = pinProblem(q.pin) ?? pinKeyProblem({ ...q, pin: q.pin }, readNumber)
    if (pin) return `pin: ${pin}`
  }
  // P177: a clock to set: a stop of the long hand a phone can drag to, and a key that is a time on its face other than 12:00.
  if (q.clock) {
    if (q.diagram || q.graph || q.columns || q.blocks || q.groups || q.shade || q.tap || q.pin || q.choices?.length) return 'clock: a clock to set is the picture of its question, and it has no choices'
    const clock = clockProblem(q.clock) ?? clockKeyProblem({ ...q, clock: q.clock })
    if (clock) return `clock: ${clock}`
  }
  // P183: a clock face to read: a time on its face, and a key that is that time.
  if (q.clockFace) {
    if (q.diagram || q.graph || q.columns || q.blocks || q.groups || q.shade || q.tap || q.pin || q.clock || q.match) return 'clockFace: a clock face is the picture of its question'
    const face = clockFaceProblem({ ...q, clockFace: q.clockFace })
    if (face) return `clockFace: ${face}`
  }
  // P178: things to match in pairs: a few short things a side, and a key of one partner each, mixed up.
  if (q.match) {
    if (q.diagram || q.graph || q.columns || q.blocks || q.groups || q.shade || q.tap || q.pin || q.clock || q.choices?.length) return 'match: things to match are the picture of their question, and it has no choices'
    const match = matchProblem(q.match) ?? matchKeyProblem({ ...q, match: q.match })
    if (match) return `match: ${match}`
  }
  const picture = questionPictureOf(q)
  if (picture) return `picture: ${picture}`
  // P149: the pictures (and words) of the choices of a question that is picked. A true or false or a reason question ignores any choices it carries.
  return q.answerKind === 'truefalse' || q.answerKind === 'reason' ? null : choicePictureProblem(q.choices)
}

function answerKeyProblem(q: Question): string | null {
  // P148: a unit or a round the screen could not use is a problem, and the key may be written with the unit of the question ("24 cm²" for a unit of cm²).
  const setting = quantityProblem(q)
  if (setting) return setting
  // P149: a question with choices (any kind), a true or false and a reason are picked: the key is the letter, true or false, or a reason of the list.
  if (isPickQuestion(q)) return pickKeyProblem(q)
  // P150: a list, an order and a table are several values, each read as a number (the unit of a question is no part of a value).
  // P179: the lines of a proof are maths, not numbers: the proof check of `answerProblem` reads them. P185: and so are the lines of first principles.
  if (isListKind(q.answerKind)) return q.proof || q.firstPrinciples ? null : listKeyProblem(q, readNumber)
  const key = stripUnit(q.answer, q.unit)
  if (isMeaningKind(q.answerKind)) return meaningKeyProblem(q.answerKind, key)
  const parsed = parseAnswer(key)
  // A negative whole or decimal key is for a senior class (its box has a minus key); a primary question keeps the rule it always had: the number kind is for it.
  const negative = parsed.kind === 'number' && parsed.value.n < 0n && !isSeniorQuestion(q)
  const fine =
    q.answerKind === 'choice' ? parsed.kind === 'choice'
    // A rand sign and an amount written the way a book writes it (R 15 386,42, R15,386.42) are an amount too, to the cent (P148).
    : q.answerKind === 'money' ? parsed.kind === 'money' || (/^\s*-?\s*R/i.test(q.answer) && readCents(q.answer) !== null)
    : q.answerKind === 'whole' ? parsed.kind === 'number' && parsed.value.d === 1n && !negative
    : parsed.kind === 'number' && !negative
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
  box_plot: 'a box and whisker plot',
  tree: 'a probability tree',
  timeline: 'a time line',
}

function how(lesson: Lesson): string {
  if (lesson.format === 'audio') return 'as a spoken lesson'
  if (lesson.format === 'reading') return 'as short reading cards'
  const kind = lesson.diagram?.steps[0]?.diagram.kind
  return `with ${(kind && DIAGRAM_WORDS[kind]) ?? 'diagrams'}`
}

/**
 * The plain lines that stand in for a "why" or a "right way" when the word check leaves nothing of it (P116). They say nothing about the learner, so
 * they pass the word check themselves, and they hold no em dash.
 */
export const WHY_AFTER_LABELS = 'Go back over each step, one at a time, and check each number.'
export const RIGHT_WAY_AFTER_LABELS = 'Work it out again one step at a time, then check the answer.'

/** The reason of the `LabelDrop` that records a plain line put in place of a "why" or a "right way". */
const REPLACED_WITH_PLAIN_LINE = 'replaced with a plain line: nothing was left after leaving out a label'
/** The reason of the `LabelDrop` that records worked steps (P127) left out whole because a line of them held a label. */
const STEPS_LEFT_OUT = 'left out whole: a line of them held a label'

/**
 * Each question as it is saved: its worked steps trimmed (`cleanSteps`), and left off a question whose steps cannot be used (the question stays); and (P167) a
 * graph of several bars to draw made an ordered list with the name of each bar over its box (`tidyGraph`).
 */
const tidySteps = (questions: Question[]): Question[] =>
  questions.map(({ steps, ...rest }) => {
    const clean = cleanSteps(steps)
    return tidyFirstPrinciples(tidyGraphMatch(tidyGeneral(tidyProof(tidyMatch(tidyLine(tidyTap(tidyPlot(tidyGroups(tidyGraph(clean ? { ...rest, steps: clean } : rest))))))))))
  })

/**
 * "A profile, never a label": the lines of a lesson that speak to or about the learner pass the word check before the lesson is saved. No database.
 * A lesson is full of maths, and a maths line may say "a clever trick", "the top and bottom of one half" or "the track is 3/4 km": that is not a
 * label on a child. So only a sentence that names the learner, says you or your, or names learners in general is read, and only in the lines a
 * learner is spoken to in: the spoken script, the reading cards, and the "why" and "right way" under each question. A question, an answer, a
 * choice, a title and a picture are never read.
 * A sentence with a label, a ranking or career talk is left out and the rest is kept. A card with nothing left goes. A "why" or a "right way"
 * (in the warm-up or in the questions) with nothing left is replaced by a plain line (`WHY_AFTER_LABELS`, `RIGHT_WAY_AFTER_LABELS`) and the
 * replacement is recorded in `dropped` (field `question 3 why`), so one hint never throws away a lesson. Every question stays, so the lesson keeps
 * its 15 questions and its warm-up and still parses as a `Lesson` for the learner. A script with nothing left still refuses the lesson.
 * The worked `steps` of a question (P127) are read the same way: a step with a label leaves that question's steps out whole (recorded as `question 3 steps`), and the question stays.
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
  /** A hint (a "why" or a "right way"): what is left of it, or `plain` when nothing is left, and the replacement is recorded. */
  const hint = (text: string, field: string, plain: string) => {
    const kept = read(text, field)
    if (!text.trim() || kept.text) return kept.text
    dropped.push({ field, text: kept.dropped.map((d) => d.text).join(' '), reason: REPLACED_WITH_PLAIN_LINE })
    return plain
  }
  const feedback = (questions: Question[], group: 'warm-up' | 'question'): Question[] =>
    questions.map(({ steps, ...q }, i) => {
      const screened: Question = {
        ...q,
        why: hint(q.why, `${group} ${i + 1} why`, WHY_AFTER_LABELS),
        rightWay: hint(q.rightWay, `${group} ${i + 1} right way`, RIGHT_WAY_AFTER_LABELS),
      }
      if (!steps) return screened
      // Worked steps (P127) are lines of maths. If a line holds a label the steps are left out whole (a gap in a working is worse than none); the question stays.
      const field = `${group} ${i + 1} steps`
      const labels = steps.flatMap((line) => leaveOutLabels(line, field, { ...check, aboutLearnerOnly: true }).dropped)
      if (!labels.length) return { ...screened, steps }
      dropped.push({ field, text: labels.map((d) => d.text).join(' '), reason: STEPS_LEFT_OUT })
      return screened
    })

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
  const warmup = feedback(lesson.warmup, 'warm-up')
  const questions = feedback(lesson.questions, 'question')
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
    const { lesson, dropped } = screenLesson({ ...written, warmup: tidySteps(written.warmup), questions: tidySteps(written.questions) }, { people: [learner.first_name] })
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
