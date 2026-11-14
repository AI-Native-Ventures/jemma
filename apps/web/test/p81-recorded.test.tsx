import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { LessonSchema, type Question } from '@jemma/profiling/schemas'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { boxesFor } from '../e2e/helpers/answers'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { answerShape, answerValue, completeAnswer, stripQuestion } from '../app/k/session/[sessionId]/logic'

// Every question of every recorded lesson (fixtures/ai-replays.json.gz, the answers the demo path replays): the screen asks for the
// boxes the demo path types in, and what the boxes hold is marked right (or wrong) by the same rule the server uses. No database, no browser.

type Replay = { response: { request?: unknown; content?: { type: string; text?: string }[] } }

function recordedQuestions(): Question[] {
  const replays = JSON.parse(gunzipSync(readFileSync(resolve(import.meta.dirname, '../../../fixtures/ai-replays.json.gz'))).toString()) as Replay[]
  const out: Question[] = []
  for (const r of replays) {
    if (!JSON.stringify(r.response.request ?? '').includes('Job: write_lesson')) continue
    const text = (r.response.content ?? []).filter((p) => p.type === 'text').map((p) => p.text ?? '').join('')
    let lesson
    try {
      lesson = LessonSchema.safeParse(JSON.parse(text))
    } catch {
      continue
    }
    if (lesson.success) out.push(...lesson.data.warmup, ...lesson.data.questions)
  }
  return out
}

const QUESTIONS = recordedQuestions()

const stateOf = (boxes: { label: string; value: string }[]) => ({
  whole: boxes.find((b) => b.label === 'Whole number')?.value ?? '',
  top: boxes.find((b) => b.label === 'Top number')?.value ?? '',
  bottom: boxes.find((b) => b.label === 'Bottom number')?.value ?? '',
  text: boxes.find((b) => b.label === 'Your answer' || b.label === 'Missing number')?.value ?? '',
})

describe('the recorded lessons', () => {
  it('there are recorded questions to try', () => {
    expect(QUESTIONS.length).toBeGreaterThan(300)
  })

  it('every typed question: what the demo path types for the right answer is marked right, and what it types for a wrong one is marked wrong', () => {
    const problems: string[] = []
    for (const q of QUESTIONS.filter((x) => !x.choices?.length)) {
      const shape = answerShape(q)
      for (const right of [true, false]) {
        const value = answerValue(shape, stateOf(boxesFor(q, right)))
        const marked = completeAnswer(q, value)
        if (!value || marked.correct !== right) problems.push(`${right ? 'right' : 'wrong'}: ${q.prompt} [${q.answerKind}] key ${q.answer} typed ${JSON.stringify(boxesFor(q, right))} sent ${value} stored ${marked.stored}`)
      }
    }
    expect(problems).toEqual([])
  })

  it('every typed question shows the boxes the demo path looks for, each with its label, and one heading with the prompt', () => {
    const problems: string[] = []
    for (const q of QUESTIONS.filter((x) => !x.choices?.length)) {
      const html = renderToStaticMarkup(<QuestionScreen q={stripQuestion(q, { position: 3, phase: 'try', index: 1, of: 5 })} busy={false} onAnswer={() => {}} />)
      for (const b of boxesFor(q, true)) if (!html.includes(`>${b.label}</label>`)) problems.push(`${q.prompt}: no box labelled ${b.label}`)
      const labels = html.match(/<\/label>/g)?.length ?? 0
      if (labels !== boxesFor(q, true).length) problems.push(`${q.prompt}: ${labels} boxes on screen, the demo path fills ${boxesFor(q, true).length}`)
      if (html.match(/<h1[^>]* data-prompt=/g)?.length !== 1) problems.push(`${q.prompt}: not exactly one h1 with the prompt`)
    }
    expect(problems).toEqual([])
  })

  it('counts the answer kinds the lessons use', () => {
    const count = new Map<string, number>()
    for (const q of QUESTIONS) {
      const key = q.choices?.length ? 'choice' : `${q.answerKind}${q.render === 'fraction_sum' ? ' (fraction sum)' : ''}`
      count.set(key, (count.get(key) ?? 0) + 1)
    }
    // Printed so the number can be read in the test log; the check is that no kind falls outside the ones the screen handles.
    console.info('recorded answer kinds', Object.fromEntries(count))
    for (const key of count.keys()) expect(['choice', 'fraction', 'mixed', 'whole', 'decimal', 'money']).toContain(key.replace(' (fraction sum)', ''))
  })
})
