import { resolve } from 'node:path'
import { createServiceClient, type Json } from '@jemma/profiling/db'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { AMINA_LESSON, LESSON_QUESTIONS } from '../../../supabase/seed/fixtures/marked-state'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

const admin = () =>
  createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const actual = (board: string) => resolve(import.meta.dirname, `../../../design/actual/${board}.png`)

/** Design match gate: boards are phone-size, so screenshots come from the phone project only. */
async function shot(page: Page, testInfo: TestInfo, board: string) {
  if (testInfo.project.name !== 'phone') return
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  await page.screenshot({ path: actual(board), fullPage: true })
}

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)

/** Answers the child gives to reach the seeded result: Q2 and Q5 wrong. */
const WRONG: Record<string, string> = { '2/3 + 1/6': '3/9', '3/4 + 1/8': '4/12' }
const answerFor = (prompt: string) => WRONG[prompt] ?? LESSON_QUESTIONS.find((q) => q.prompt === prompt)!.answer

let sandbox: OpenedSandbox | null = null
test.afterEach(async () => {
  await sandbox?.cleanup().catch(() => undefined)
  sandbox = null
})

async function sessionIdOf(childId: string) {
  const { data } = await admin().from('sessions').select('id').eq('child_id', childId).eq('status', 'planned').not('lesson_id', 'is', null).single()
  return data!.id
}

async function warmupThrough(page: Page) {
  await expect(page.getByText('Warm-up · 1 of 2')).toBeVisible()
  await page.getByRole('button', { pressed: false }).first().click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('Warm-up · 2 of 2')).toBeVisible()
  await page.getByRole('button', { pressed: false }).first().click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
}

async function tryQuestion(page: Page, n: number, wrong: boolean) {
  await expect(page.getByText(`Question ${n} of 5`)).toBeVisible()
  const prompt = (await page.locator('h1[data-prompt]').getAttribute('data-prompt'))!
  const value = wrong ? (WRONG[prompt] ?? '1/99') : LESSON_QUESTIONS.find((q) => q.prompt === prompt)!.answer
  const [top, bottom] = value.split('/')
  await page.getByLabel('Top number').fill(top!)
  await page.getByLabel('Bottom number').fill(bottom!)
  return { prompt }
}

test('today shows tonight with its numbers', async ({ page }, testInfo) => {
  sandbox = await openSandbox(page, { stage: 'marked', role: 'learner' })
  await page.goto('/k')
  await expect(page.getByRole('heading', { name: "Hi Amina. One thing tonight, then you're done." })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Adding fractions with different denominators' })).toBeVisible()
  await expect(page.getByText('12 minutes')).toBeVisible()
  await expect(page.getByText('With a diagram')).toBeVisible()
  await expect(page.getByText("You've fixed 3 gaps so far")).toBeVisible()
  await expect(page.getByText('2 more to go')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Start' })).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'child-today')
})

test('nothing tonight after the session is done', async ({ page }, testInfo) => {
  sandbox = await openSandbox(page, { stage: 'session_done', role: 'learner' })
  await page.goto('/k')
  await expect(page.getByRole('heading', { name: /^Nothing new tonight, Amina! Your next lesson is on \w+day\.$/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Adding decimals' })).toBeVisible()
  await expect(page.getByText('Keep a fixed gap fixed')).toBeVisible()
  await expect(page.getByText("You've fixed 3 gaps so far")).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'child-nothing-tonight')
})

test('the whole session: no right or wrong, only missed questions at the end, gap moves', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  sandbox = await openSandbox(page, { stage: 'marked', role: 'learner' })
  const sessionId = await sessionIdOf(sandbox.childId)

  // Slow the first server action so the loading board can be captured.
  let slowed = false
  await page.route('**/k/session/**', async (route) => {
    if (!slowed && route.request().method() === 'POST' && route.request().headers()['next-action']) {
      slowed = true
      await new Promise((r) => setTimeout(r, 1500))
    }
    await route.continue()
  })
  await page.goto('/k')
  await page.getByRole('link', { name: 'Start' }).click()
  await expect(page.getByRole('heading', { name: 'Getting your lesson ready.' })).toBeVisible()
  await expect(page.getByText('About 10 seconds. Grab a pencil and some paper!')).toBeVisible()
  await shot(page, testInfo, 'child-loading')

  await expect(page.getByText('Warm-up · 1 of 2')).toBeVisible()
  await expect(page.getByText('A quick one from a gap you already fixed.')).toBeVisible()
  await shot(page, testInfo, 'child-warmup')
  await page.getByRole('button', { pressed: false }).first().click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('Warm-up · 2 of 2')).toBeVisible()
  await page.getByRole('button', { pressed: false }).first().click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Why 1/2 + 1/4 is 3/4' })).toBeVisible()
  await expect(page.getByText("Why not 2/6?")).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'child-learn-diagram')
  await page.getByRole('button', { name: "I'm ready" }).click()

  const noFeedback = async () => {
    const text = (await page.locator('body').innerText()).toLowerCase()
    for (const word of ['right', 'wrong', 'correct', 'score', 'well done']) expect(text).not.toContain(word)
  }
  const wrongAt = new Set([2, 5])
  for (let n = 1; n <= 5; n++) {
    await tryQuestion(page, n, wrongAt.has(n))
    if (n === 3) await shot(page, testInfo, 'child-question')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    if (n < 5) await noFeedback()
  }

  await expect(page.getByRole('heading', { name: 'You finished, Amina!' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Question 2' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Question 5' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Question [134]$/ })).toHaveCount(0)
  await expect(page.getByText('you added the tops and the bottoms.').first()).toBeVisible()
  await expect(page.getByText("Let's look at these 2 together.")).toBeVisible()
  await shot(page, testInfo, 'child-results')

  const { data: session } = await admin().from('sessions').select('status, right').eq('id', sessionId).single()
  expect(session).toMatchObject({ status: 'done', right: 3 })

  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByRole('heading', { name: 'You moved it to Practising!' })).toBeVisible()
  await expect(page.locator('ol[aria-label=Stages] li[aria-current=step]')).toContainText('Practising')
  await shot(page, testInfo, 'child-progress')

  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page).toHaveURL(/\/k\/done$/)
  await expect(page.getByRole('heading', { name: 'All done, Amina!' })).toBeVisible()
  await expect(page.getByText(/Now pass the phone back to your mum\./)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'For Thandi' })).toBeVisible()
  await shot(page, testInfo, 'child-handback')
})

test('answers never reach the client before finishing', async ({ page }) => {
  sandbox = await openSandbox(page, { stage: 'marked', role: 'learner' })
  const bodies: string[] = []
  page.on('response', async (res) => {
    if (res.request().method() === 'POST' && res.request().headers()['next-action']) bodies.push(await res.text().catch(() => ''))
  })
  await page.goto('/k')
  await page.getByRole('link', { name: 'Start' }).click()
  await warmupThrough(page)
  await page.getByRole('button', { name: "I'm ready" }).click()
  await tryQuestion(page, 1, false)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('Question 2 of 5')).toBeVisible()
  const joined = bodies.join('\n')
  expect(joined).not.toContain('rightWay')
  expect(joined).not.toContain('you added the tops')
  expect(joined).not.toContain('"correct"')
})

test('lesson load failure shows retry', async ({ page }, testInfo) => {
  sandbox = await openSandbox(page, { stage: 'marked', role: 'learner' })
  let failed = false
  await page.route('**/k/session/**', async (route) => {
    if (!failed && route.request().method() === 'POST' && route.request().headers()['next-action']) {
      failed = true
      return route.abort('failed')
    }
    return route.continue()
  })
  await page.goto('/k')
  await page.getByRole('link', { name: 'Start' }).click()
  await expect(page.getByRole('heading', { name: 'Your lesson is taking a little longer' })).toBeVisible()
  await expect(page.getByText("It's not you. The internet is slow right now. Nothing you did is lost.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Do the warm-up first' })).toBeVisible()
  await shot(page, testInfo, 'child-error')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Warm-up · 1 of 2')).toBeVisible()
})

test('reading cards and audio memo formats', async ({ page }, testInfo) => {
  sandbox = await openSandbox(page, { stage: 'marked', role: 'learner' })
  const db = admin()
  const sessionId = await sessionIdOf(sandbox.childId)
  const { data: s } = await db.from('sessions').select('lesson_id').eq('id', sessionId).single()
  const audio = {
    ...AMINA_LESSON,
    format: 'audio' as const,
    title: "Why we can't add the bottoms",
    minutes: 3,
    audio: {
      script:
        "Lots of people write 2/6 for a half plus a quarter. It feels right: one and one make two, two and four make six.\nBut the bottom number isn't something you add. It tells you the size of the pieces.\nHalves are big pieces. Quarters are smaller. Before we add, we make the pieces the same size.",
    },
  }
  const reading = { ...AMINA_LESSON, format: 'reading' as const }

  await db.from('lessons').update({ format: 'reading', content: reading as unknown as NonNullable<Json> }).eq('id', s!.lesson_id!)
  await page.goto(`/k/session/${sessionId}`)
  await warmupThrough(page)
  await expect(page.getByText('Learn · card 1 of 4')).toBeVisible()
  await page.getByRole('button', { name: 'Next card' }).click()
  await expect(page.getByText('Learn · card 2 of 4')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Make the bottoms match first' })).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'child-learn-cards')

  await db.from('lessons').update({ format: 'audio', content: audio as unknown as NonNullable<Json> }).eq('id', s!.lesson_id!)
  await page.goto(`/k/session/${sessionId}`)
  await expect(page.getByRole('heading', { name: "Why we can't add the bottoms" })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Read along' })).toBeVisible()
  await expect(page.getByText('Jemma, for Amina')).toBeVisible()
  await page.getByRole('button', { name: /Change language/ }).click()
  await expect(page.getByRole('heading', { name: 'Coming after the challenge' })).toBeVisible()
  await page.getByRole('button', { name: 'Got it' }).click()
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'child-learn-audio')
})
