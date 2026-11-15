import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { extractJson } from '../src/ai/json'
import { bannedWords, leaveOutLabels } from '../src/logic/no-labels'
import { ReteachSchema } from '../src/schemas/diagnosis'
import { LessonSchema, type Lesson } from '../src/schemas/lesson'
import { screenClassReport } from '../src/tools/save/class-gap-report'
import { screenLesson } from '../src/tools/save/save-lesson'
import { GuidanceDraftSchema, screenGuidance } from '../src/tools/save/subject-guidance'

// P104, decision 3: the demo must read exactly as it does today. The word check runs over EVERY recorded answer of the three jobs
// (guidance, class_report, write_lesson) in fixtures/ai-replays.json.gz, and it must leave out nothing. If a recorded answer ever
// loses a word, this test fails and the list is NOT changed to make it pass: the answer is looked at.
// It reads the file only: no database, no network, no model.

type Part = { type?: string; text?: string }
type Message = { role: string; content: string | Part[] }
type Replay = { key: string; model: string; response: { content?: Part[]; request?: { body?: { messages?: Message[] } } } }

const root = resolve(import.meta.dirname, '../../..')
const replays = JSON.parse(gunzipSync(readFileSync(join(root, 'fixtures/ai-replays.json.gz'))).toString('utf8')) as Replay[]

const textOf = (content: string | Part[] | undefined): string => (typeof content === 'string' ? content : (content ?? []).map((p) => p.text ?? '').join(''))
const jobOf = (r: Replay): string | undefined => /# Job: (\S+)/.exec(textOf(r.response.request?.body?.messages?.find((m) => m.role === 'system')?.content))?.[1]
const promptOf = (r: Replay): string => textOf(r.response.request?.body?.messages?.find((m) => m.role === 'user')?.content)
const rawOf = (r: Replay): string => (r.response.content ?? []).filter((p) => p.type === 'text').map((p) => p.text ?? '').join('')
const answerOf = (r: Replay): unknown => {
  try {
    return extractJson(rawOf(r))
  } catch {
    return undefined
  }
}
/** The first names the model was given in the data block: the learner's `firstName`, or the `name` of each learner of a class report. */
const namesOf = (r: Replay): string[] => {
  const key = jobOf(r) === 'class_report' ? 'name' : 'firstName'
  return [...new Set([...promptOf(r).matchAll(new RegExp(`"${key}":"([^"]+)"`, 'g'))].map((m) => m[1]!))]
}

const ClassReportAnswer = z.object({ why: z.string(), missingBasic: z.string(), explanation: z.string(), reteach: ReteachSchema })

const of = (job: string) => replays.filter((r) => jobOf(r) === job)

describe('the recorded answers of the three jobs', () => {
  test('there are recorded answers of each job to read (the scan cannot pass by finding nothing)', () => {
    expect(of('guidance').length).toBeGreaterThanOrEqual(50)
    expect(of('class_report').length).toBeGreaterThanOrEqual(7)
    expect(of('write_lesson').length).toBeGreaterThanOrEqual(35)
  })

  test('every guidance card keeps every word', () => {
    let read = 0
    for (const r of of('guidance')) {
      const card = GuidanceDraftSchema.safeParse(answerOf(r))
      if (!card.success) continue
      read++
      const screened = screenGuidance(card.data, { people: namesOf(r) })
      expect(screened.dropped, r.key).toEqual([])
      expect(screened.guidance, r.key).toBe(card.data)
    }
    expect(read).toBe(of('guidance').length)
  })

  test('every class report keeps every word', () => {
    let read = 0
    for (const r of of('class_report')) {
      const report = ClassReportAnswer.safeParse(answerOf(r))
      if (!report.success) continue
      read++
      const screened = screenClassReport({ why: report.data.why, explanation: report.data.explanation, audience: report.data.reteach.audience }, { people: namesOf(r) })
      expect(screened.dropped, r.key).toEqual([])
      expect([screened.why, screened.explanation, screened.audience], r.key).toEqual([report.data.why, report.data.explanation, report.data.reteach.audience])
    }
    expect(read).toBe(of('class_report').length)
  })

  test('every lesson keeps every word', () => {
    const read = { whole: 0, partial: 0, notJson: 0 }
    for (const r of of('write_lesson')) {
      const answer = answerOf(r)
      const lesson = LessonSchema.safeParse(answer)
      if (lesson.success) {
        read.whole++
        const screened = screenLesson(lesson.data, { people: namesOf(r) })
        expect(screened.dropped, r.key).toEqual([])
        expect(screened.lesson, r.key).toBe(lesson.data)
      } else if (answer && typeof answer === 'object') {
        // A reply that is JSON but is not a whole lesson (a model's slip: no questions): the lesson writer refuses it, and still every line it has is read.
        read.partial++
        const screened = screenLesson({ warmup: [], questions: [], ...(answer as object) } as unknown as Lesson, { people: namesOf(r) })
        expect(screened.dropped, r.key).toEqual([])
      } else {
        // A reply that is not JSON at all: its whole text is read, sentence by sentence, as a text that speaks to or about the learner.
        read.notJson++
        expect(leaveOutLabels(rawOf(r), r.key, { aboutLearnerOnly: true, people: namesOf(r) }).dropped, r.key).toEqual([])
      }
    }
    // Every recorded answer was read, one way or another. The three that are not JSON and the two that are not whole lessons never reached a save tool.
    expect(read.whole + read.partial + read.notJson).toBe(of('write_lesson').length)
    expect(read.whole).toBeGreaterThanOrEqual(34)
    expect(read.notJson).toBeLessThanOrEqual(3)
  })

  test('even read without the sentence filter, no spoken script and no reading card of a recorded lesson has a banned word', () => {
    // The "why" and "right way" under a question are not in this list on purpose: a right way may say "the top and bottom of one half", which is
    // maths and not a ranking, and the lesson check reads them only in a sentence that names the learner or says you.
    for (const r of of('write_lesson')) {
      const lesson = LessonSchema.safeParse(answerOf(r))
      if (!lesson.success) continue
      const prose = [lesson.data.audio?.script ?? '', ...(lesson.data.cards ?? []).flatMap((c) => [c.heading, c.body])]
      for (const text of prose) expect(bannedWords(text, [], namesOf(r)), r.key).toEqual([])
    }
  })
})

describe('the scan is not blind', () => {
  test('a recorded guidance card with a label added loses exactly that sentence', () => {
    const r = of('guidance')[0]!
    const card = GuidanceDraftSchema.parse(answerOf(r))
    const screened = screenGuidance({ ...card, headline: `${card.headline} She is a gifted learner.` }, { people: namesOf(r) })
    expect(screened.guidance.headline).toBe(card.headline)
    expect(screened.dropped).toEqual([{ field: 'headline', text: 'She is a gifted learner.', reason: 'uses the word "gifted"' }])
  })

  test('a recorded spoken script with a label added loses exactly that sentence', () => {
    const r = of('write_lesson').find((x) => LessonSchema.safeParse(answerOf(x)).success && LessonSchema.parse(answerOf(x)).audio)!
    const lesson = LessonSchema.parse(answerOf(r))
    const script = lesson.audio!.script
    const screened = screenLesson({ ...lesson, audio: { script: `${script} You are such a genius.` } }, { people: namesOf(r) })
    expect(screened.lesson.audio!.script).toBe(script.trim())
    expect(screened.dropped.map((d) => d.text)).toEqual(['You are such a genius.'])
  })
})
