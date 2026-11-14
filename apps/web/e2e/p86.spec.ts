import { mkdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { createServiceClient, type Json } from '@jemma/profiling/db'
import { LessonSchema, type Lesson, type Question } from '@jemma/profiling/schemas'
import { expect, test as base, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// A learner of a senior class (Mathematics, Grade 10) types algebra, an equation, a point and a negative number, and code marks them by meaning.
// The sandbox's class is made Grade 10 and the learner's planned session gets a lesson written here with the service client (no model is called):
// five typed questions in a fixed order (the order of the levels, see `QUESTIONS`), one of each new kind and one with a form.
//   Question 1  an expression, key 2x + 3        typed 3 + 2 and the x key: 3 + 2x            right
//   Question 2  an equation, key x = 3 or x = -1  typed with the keys: x = -1 or x = 3         right
//   Question 3  a point, key (2; -3)             typed (-3; 2) with the minus key              missed
//   Question 4  a number, key -3                 typed 3 and the minus key                     right
//   Question 5  an expression, key (x+2)(x-2), factorised   typed x^2 - 4                      missed
// The results screen then shows only Question 3 and Question 5, and the stored rows say the same.
//
// RUNS IN CI on every push (job "Feature specs in a browser", .github/workflows/ci.yml), on CI's own local database, phone project. There the stand-in
// below takes port 8787 (STAND_IN_AGENT_PORT), where the web app posts. Never run it against the hosted preview database. By hand, against a production build:
//   pnpm --filter web build
//   AGENT_URL=http://127.0.0.1:8786 pnpm --filter web exec next start --port 3286        (own terminal, stop it by its pid after)
//   P86_PROOF=1 PREVIEW_URL=http://localhost:3286 pnpm --filter web exec playwright test p86 --project=phone --workers=1
// Screenshots are written only when P86_PROOF is set, to design/proof/p86 (390 wide). No agent runs: the stand-in only takes the posts, and the end of a session is best effort.

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p86')
async function proof(page: Page, name: string) {
  if (!process.env.P86_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  const height = await page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, ...Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0')).map((e) => e.scrollHeight)),
  )
  const size = page.viewportSize()!
  if (height > size.height) await page.setViewportSize({ width: size.width, height })
  await page.screenshot({ path: resolve(proofDir, `${name}-390.png`), fullPage: true })
  await page.setViewportSize(size)
}

/** The agent's stand-in: accepts every post to /events, so the web app believes the agent took the event. It runs no job. */
let agent: Server
// The port the web app posts to (its AGENT_URL). CI frees 8787 (the real agent's) and sets STAND_IN_AGENT_PORT=8787.
const STAND_IN_PORT = Number(process.env.STAND_IN_AGENT_PORT ?? 8786)
base.beforeAll(async () => {
  agent = createServer((req, res) => {
    if (req.url === '/health') return void res.writeHead(200).end('ok')
    req.resume()
    req.on('end', () => res.writeHead(202, { 'content-type': 'application/json' }).end('{"queued":true}'))
  })
  await new Promise<void>((done) => agent.listen(STAND_IN_PORT, done))
})
base.afterAll(async () => {
  await new Promise((done) => agent.close(done))
})

const opened: OpenedSandbox[] = []
// A copy is removed as soon as its test is over: every copy adds topics that each screen reads through row level security, so copies left
// standing until the end of the file make every screen slower (seen on CI).
base.afterEach(async () => {
  await Promise.all(opened.splice(0).map((s) => s.cleanup().catch(() => undefined)))
})

const test = base
test.use({ screenshot: 'only-on-failure', actionTimeout: 45_000 })
test.setTimeout(240_000)

const MINUS = '\u2212'
const q = (difficulty: 1 | 2 | 3, prompt: string, answer: string, answerKind: Question['answerKind'], over: Partial<Question> = {}): Question => ({
  prompt,
  render: 'text',
  answer,
  answerKind,
  difficulty,
  why: `Why: ${prompt}`,
  rightWay: `Right way: ${prompt}`,
  ...over,
})

/** 15 questions, 5 at each level. The learner is asked, in this order: the first two of level 2, the first of level 3, the third and the fourth of level 2. */
const QUESTIONS: Question[] = [
  ...[1, 2, 3, 4, 5].map((n) => q(1, `Simplify ${n}x + ${n}x`, `${2 * n}x`, 'expression')),
  q(2, 'Simplify x + x + 3', '2x + 3', 'expression'),
  q(2, 'Solve x^2 - 2x - 3 = 0', 'x = 3 or x = -1', 'equation'),
  q(2, 'What is 3 - 6?', '-3', 'number'),
  q(2, 'Factorise x^2 - 4', '(x+2)(x-2)', 'expression', { form: 'factorised' }),
  q(2, 'What is 2 - 7?', '-5', 'number'),
  q(3, 'The point A is 2 across and 3 down. Give its coordinates.', '(2; -3)', 'point'),
  ...[2, 3, 4, 5].map((n) => q(3, `What is ${n} - ${n + 5}?`, '-5', 'number')),
]
const WARMUP: Question[] = [
  q(1, 'What is x^2 when x = 3?', 'B', 'choice', { choices: ['6', '9', '8', '5'] }),
  q(1, 'Which is the same as 2x + x?', 'A', 'choice', { choices: ['3x', '2x^2', '3', '2x'] }),
]

/** The sandbox class made Grade 10, and the planned session's lesson made the senior lesson above. */
async function makeSenior(childId: string, classId: string): Promise<string> {
  const db = admin()
  expect((await db.from('classes').update({ grade: 10, subject: 'Mathematics' }).eq('id', classId)).error).toBeNull()
  expect((await db.from('children').update({ grade: 10 }).eq('id', childId)).error).toBeNull()
  const session = (await db.from('sessions').select('id, lesson_id').eq('child_id', childId).eq('status', 'planned').not('lesson_id', 'is', null).single()).data!
  const old = LessonSchema.parse((await db.from('lessons').select('content').eq('id', session.lesson_id!).single()).data!.content)
  const lesson: Lesson = { ...old, title: 'Algebra', warmup: WARMUP, questions: QUESTIONS }
  expect(LessonSchema.safeParse(lesson).success).toBe(true)
  expect((await db.from('lessons').update({ content: lesson as unknown as NonNullable<Json> }).eq('id', session.lesson_id!)).error).toBeNull()
  expect((await db.from('sessions').update({ warmup: WARMUP as unknown as NonNullable<Json> }).eq('id', session.id)).error).toBeNull()
  return session.id
}

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)

const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true })
const answerBox = (page: Page) => page.getByLabel('Your answer', { exact: true })
const key = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

/** From the learner's home to the first question on the screen: the warm-up, the lesson, "I'm ready", "Answer on the screen". */
async function toTheFirstQuestion(page: Page) {
  await page.goto('/k')
  await page.getByRole('link', { name: 'Start' }).click()
  for (const n of [1, 2]) {
    await check(page.getByText(`Warm-up · ${n} of 2`)).toBeVisible()
    await page.getByRole('button', { pressed: false }).first().click()
    await next(page).click()
  }
  await page.getByRole('button', { name: "I'm ready" }).click()
  await page.getByRole('button', { name: 'Answer on the screen', exact: true }).click()
  await check(page.getByText('Question 1 of 5')).toBeVisible()
}

test.describe('a learner of a Grade 10 class types algebra', () => {
  test('an expression, an equation, a point and a number are marked by meaning, and the results show only the missed ones', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the learner screens are phone screens')
    const sb = await openSandbox(page, { stage: 'marked', role: 'learner' })
    opened.push(sb)
    const sessionId = await makeSenior(sb.childId, sb.classId)
    await toTheFirstQuestion(page)

    // Question 1: an expression. One text box set up for letters, the row of maths keys, the help line. Next waits for something.
    await expect(page.locator('h1[data-prompt]')).toHaveAttribute('data-prompt', 'Simplify x + x + 3')
    const box = answerBox(page)
    await expect(box).toHaveAttribute('inputmode', 'text')
    await expect(box).toHaveAttribute('autocorrect', 'off')
    await expect(box).toHaveAttribute('autocapitalize', 'off')
    await expect(box).toHaveAttribute('spellcheck', 'false')
    await expect(box).toHaveAttribute('maxlength', '40')
    await expect(page.locator('[data-keys] button')).toHaveText(['x', 'y', '²', '^', '(', ')', MINUS, '√'])
    await expect(page.getByText('Type an expression, like 2x + 3.')).toBeVisible()
    await expect(next(page)).toBeDisabled()
    await box.fill('3 + 2')
    await key(page, 'x').click()
    await expect(box).toHaveValue('3 + 2x')
    await expect(next(page)).toBeEnabled()
    await expect(page.locator('[data-reads]')).toContainText('It reads:')
    await noHorizontalScroll(page)
    await proof(page, 'expression')
    await next(page).click()

    // Question 2: an equation, with the keys x = minus root or. Typed with the keys and a few digits.
    await check(page.getByText('Question 2 of 5')).toBeVisible()
    await expect(page.locator('[data-keys] button')).toHaveText(['x', '=', MINUS, '√', 'or'])
    await expect(page.getByText('Type the answer, like x = 4. Two answers: x = 3 or x = -1.')).toBeVisible()
    await key(page, 'x').click()
    await key(page, 'equals').click()
    await key(page, 'minus').click()
    await page.keyboard.type('1')
    await key(page, 'or').click()
    await key(page, 'x').click()
    await key(page, 'equals').click()
    await page.keyboard.type('3')
    await expect(answerBox(page)).toHaveValue(`x = ${MINUS}1 or x = 3`)
    await noHorizontalScroll(page)
    await proof(page, 'equation')
    await next(page).click()

    // Question 3: a point. A bracket, a box, a semicolon, a box and a bracket, with a minus key beside each box. Next waits for both.
    await check(page.getByText('Question 3 of 5')).toBeVisible()
    await expect(page.getByText('Type the x and the y of the point.')).toBeVisible()
    await expect(page.getByRole('button', { name: /minus sign/i })).toHaveCount(2)
    await page.getByLabel('x of the point').fill('3')
    await page.getByRole('button', { name: 'Minus sign for x' }).click()
    await expect(page.getByLabel('x of the point')).toHaveValue('-3')
    await expect(next(page)).toBeDisabled()
    await page.getByLabel('y of the point').fill('2')
    await expect(next(page)).toBeEnabled()
    await noHorizontalScroll(page)
    await proof(page, 'point')
    await next(page).click()

    // Question 4: a number that may be negative, with one minus key beside the box.
    await check(page.getByText('Question 4 of 5')).toBeVisible()
    await expect(page.getByText('Type a number. It may be negative, like -3.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Minus sign', exact: true })).toHaveCount(1)
    await answerBox(page).fill('3')
    await page.getByRole('button', { name: 'Minus sign', exact: true }).click()
    await expect(answerBox(page)).toHaveValue('-3')
    await noHorizontalScroll(page)
    await proof(page, 'number')
    await next(page).click()

    // Question 5: an expression that has to be factorised. The line says so, and x^2 - 4 is drawn with a raised 2 under the keys.
    await check(page.getByText('Question 5 of 5')).toBeVisible()
    await expect(page.getByText('Type it as a product of brackets, like (x + 2)(x - 2).')).toBeVisible()
    await answerBox(page).fill('x^2 - 4')
    await expect(page.locator('[data-reads] sup')).toHaveText('2')
    await noHorizontalScroll(page)
    await proof(page, 'factorised')
    await next(page).click()

    // The results show only the two that were missed, and the answers with their notation.
    await check(page.getByRole('heading', { name: 'You finished, Amina!' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Question 3' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Question 5' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Question [124]$/ })).toHaveCount(0)
    await expect(page.getByRole('article')).toHaveCount(2)
    const five = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Question 5' }) })
    await expect(five.locator('[data-question] sup')).toHaveText('2')
    await expect(five.locator('sup').first()).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'results')

    // What was stored: each answer as typed, marked by meaning.
    const rows = (await admin().from('session_items').select('position, phase, answer, correct').eq('session_id', sessionId).eq('phase', 'try').order('position')).data ?? []
    expect(rows.map((r) => r.correct)).toEqual([true, true, false, true, false])
    expect(rows.map((r) => r.answer)).toEqual(['3 + 2x', `x = ${MINUS}1 or x = 3`, '(-3; 2)', '-3', 'x^2 - 4'])
  })

  test('the demo path boxes are the ones they always were: a fraction question of a Grade 6 class has no maths keys', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the learner screens are phone screens')
    const sb = await openSandbox(page, { stage: 'marked', role: 'learner' })
    opened.push(sb)
    await toTheFirstQuestion(page)
    await expect(page.locator('[data-keys]')).toHaveCount(0)
    await expect(page.locator('[data-point]')).toHaveCount(0)
    await expect(page.locator('[data-reads]')).toHaveCount(0)
  })
})
