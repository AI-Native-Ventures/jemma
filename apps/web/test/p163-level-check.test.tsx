// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { levelResults } from '@jemma/profiling/logic'
import { LevelCard } from '../app/k/LevelCard'
import { LevelDone, LevelFailed, LevelStart, LevelTop, LevelWriting } from '../app/k/level/_parts/LevelScreens'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { LevelCheckCard } from '../app/p/[childId]/learn/LevelCheckCard'
import { LevelResult } from '../app/p/[childId]/level/_parts/LevelResult'

// P163: the level check. A learner new to Jemma answers 12 questions in their own space and Jemma finds where to start; the parent sees what it found.

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&amp;/g, '&').replace(/&middot;/g, '·').replace(/\s+/g, ' ').trim()
const noop = () => {}
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('the learner side', () => {
  const screens = [
    renderToStaticMarkup(<LevelCard />),
    renderToStaticMarkup(<LevelCard started={5} />),
    renderToStaticMarkup(<LevelTop />),
    renderToStaticMarkup(<LevelStart firstName="Amina" grade={6} pending={false} onStart={noop} />),
    renderToStaticMarkup(<LevelWriting />),
    renderToStaticMarkup(<LevelFailed pending={false} onRetry={noop} />),
    renderToStaticMarkup(<LevelDone firstName="Amina" first="Equivalent fractions" />),
    renderToStaticMarkup(<LevelDone firstName="Amina" first={null} />),
  ].map(text)

  it('says what the check is in plain words, and goes on where the learner stopped', () => {
    expect(screens[0]).toContain('Find your level')
    expect(screens[0]).toContain('12 questions, about 10 minutes. No marks. Jemma finds where to start.')
    expect(screens[1]).toContain('5 of 12 done')
    expect(screens[1]).toContain('Carry on')
    expect(screens[2]).toContain('Find my level')
    expect(screens[3]).toContain("Let's find your level, Amina.")
    expect(screens[3]).toContain('From all of Grade 6')
    expect(screens[3]).toContain("Not sure? Tap “I don't know yet”. That helps Jemma too.")
    expect(screens[4]).toContain('Jemma is writing your questions.')
    expect(screens[5]).toContain('Try again')
    expect(screens[6]).toContain('All done, Amina!')
    expect(screens[6]).toContain('Your first lesson Equivalent fractions')
    expect(screens[7]).toContain('Every topic right Pick something new to learn in My maths.')
    expect(screens[7]).not.toContain('writing')
  })

  it('never shows a score, never says gap, and has no dash', () => {
    for (const s of screens) {
      expect(s).not.toMatch(/\bgaps?\b/i)
      expect(s).not.toMatch(/\d+ (of|out of) \d+ right|score|%/i)
      expect(s).not.toMatch(/[\u2014\u2013]/)
    }
  })

  it('asks each question with "I don\'t know yet" and the no-marks line, and never shows the answer', () => {
    const html = renderToStaticMarkup(
      <QuestionScreen
        q={{ position: 4, phase: 'try', index: 4, of: 12, prompt: '8 + 5 = ?', render: 'text', answerKind: 'whole', young: true }}
        busy={false}
        onAnswer={noop}
        note="No marks. Just do your best."
        skip={{ label: "I don't know yet", onSkip: noop }}
      />,
    )
    expect(text(html)).toContain('Question 4 of 12')
    expect(text(html)).toContain('No marks. Just do your best.')
    expect(text(html)).toContain("I don't know yet")
    expect(text(html)).not.toContain("You'll see how you did at the end.")
    // A practice keeps its own line and has no second button.
    const practice = text(renderToStaticMarkup(<QuestionScreen q={{ position: 1, phase: 'try', index: 1, of: 5, prompt: '2 + 2', render: 'text', answerKind: 'whole' }} busy={false} onAnswer={noop} />))
    expect(practice).toContain("You'll see how you did at the end.")
    expect(practice).not.toContain("I don't know yet")
  })

  it('is a full screen a handed-over phone may open, and its answers are marked on the server', () => {
    expect(read('app/k/layout.tsx')).toContain("const NO_BAR = ['/k/session', '/k/done', '/k/level']")
    expect(read('lib/handover.ts')).toMatch(/OWN_SCREENS = \[[^\]]*'\/k\/level'/)
    const actions = read('app/k/level/actions.ts')
    expect(actions).toContain('finishAnswer(item.question, text)')
    expect(actions).toContain("sendEvent('level.requested'")
    expect(actions).toContain("sendEvent('practice.requested'")
    expect(read('app/k/level/page.tsx')).toContain("if (!isOwnRecord(child)) redirect('/k')")
  })
})

describe('the parent side', () => {
  const answers = [
    { topicName: 'Counting to 100', correct: true, skipped: false },
    { topicName: 'Counting to 100', correct: true, skipped: false },
    { topicName: 'Adding past 10', correct: false, skipped: false },
    { topicName: 'Adding past 10', correct: false, skipped: true },
    { topicName: 'Skip counting in 2s and 5s', correct: true, skipped: false },
    { topicName: 'Skip counting in 2s and 5s', correct: false, skipped: false },
  ]
  const results = levelResults(answers.map((a) => ({ topicId: null, ...a })))
  const rows = answers.map((a, i) => ({ n: i + 1, topicName: a.topicName, prompt: `Question ${i + 1}`, answer: a.skipped ? '' : '13', correct: a.correct, skipped: a.skipped }))
  const page = text(renderToStaticMarkup(<LevelResult name="Lesedi" dateText="Tue 24 Nov" minutes={9} results={results} answers={rows} next={{ topicName: 'Adding past 10', ready: false }} />))

  it('says what the check found for each topic, with the learner named', () => {
    expect(page).toContain('Level check · Tue 24 Nov')
    expect(page).toContain('Lesedi is solid on counting to 100. Adding past 10 is where to start.')
    expect(page).toContain('Counting to 100 Solid')
    expect(page).toContain('Adding past 10 New gap')
    expect(page).toContain('Skip counting in 2s and 5s Too early to tell')
    expect(page).toContain('Skip counting in 2s and 5s had 1 of 2 right, so Jemma checks again in the lessons.')
    expect(page).toContain("See Lesedi's answers 6 questions, Tue 24 Nov, 9 minutes")
    expect(page).toContain("Didn't know yet")
    expect(page).toContain('First lesson Adding past 10 Jemma is writing it.')
    expect(page).not.toMatch(/\b(he|she|his|her|him)\b/i)
    expect(page).not.toMatch(/[\u2014\u2013]/)
  })

  it('hands the phone over before the check, and links to what it found after', async () => {
    const start = async () => {}
    const before = text(renderToStaticMarkup(<LevelCheckCard childId="c1" name="Lesedi" summary={{ state: 'none' }} start={start} />))
    expect(before).toContain("Find Lesedi's level")
    expect(before).toContain('Hand the phone to Lesedi')
    const started = text(renderToStaticMarkup(<LevelCheckCard childId="c1" name="Lesedi" summary={{ state: 'started', answered: 5, of: 12 }} start={start} />))
    expect(started).toContain('Lesedi has done 5 of 12 questions.')
    const after = renderToStaticMarkup(<LevelCheckCard childId="c1" name="Lesedi" summary={{ state: 'done', dateText: 'Tue 24 Nov', headline: 'Adding past 10 is where Lesedi starts.' }} start={start} />)
    expect(after).toContain('href="/p/c1/level"')
    expect(text(after)).toContain('Adding past 10 is where Lesedi starts.')
    expect(read('app/p/[childId]/learn/handover/own-actions.ts')).toContain("redirect('/k/level')")
  })
})
