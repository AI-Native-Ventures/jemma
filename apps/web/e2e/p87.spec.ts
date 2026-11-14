import { mkdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { pictureProblem } from '@jemma/profiling/logic'
import { createServiceClient, type Json } from '@jemma/profiling/db'
import { LessonSchema, type Lesson, type Question } from '@jemma/profiling/schemas'
import { expect, test as base, type Locator, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// A learner of a Grade 10 class meets a graph and a triangle inside a question, types the answers, and finds the parts of their own map on My maths.
// The sandbox's class is made Grade 10, its approved map gets the families of a Grade 10 map (algebra, functions, trigonometry, analytical geometry),
// and the learner's planned session gets a lesson written here with the service client (no model is called). The learner is asked, in this order
// (see `QUESTIONS`): the first two of level 2, the first of level 3, then the third and the fourth of level 2.
//   Question 1  a line on a grid, "What is the gradient of this line?"   key 2          typed 2             right
//   Question 2  a triangle with an angle x, "Find the size of angle x"   key 30         typed 30            right
//   Question 3  a line on a grid, "Where does it cut the y-axis?"        key (0; 3)     typed (0; 2)        missed
//   Question 4  no picture, "What is 3 - 6?"                             key -3         typed 3 and minus   right
//   Question 5  no picture, "What is 2 - 7?"                             key -5         typed 5 and minus   right
// The pictures are checked on the question screen (an image with its spoken description, between the words and the answer box, at most 300 px
// tall, inside the screen), the results screen shows only Question 3 with its picture, and My maths lists Algebra and no Whole numbers.
//
// RUNS IN CI on every push (job "Feature specs in a browser", .github/workflows/ci.yml), on CI's own local database, phone project. There the stand-in
// below takes port 8787 (STAND_IN_AGENT_PORT), where the web app posts. Never run it against the hosted preview database. By hand, against a production build:
//   pnpm --filter web build
//   AGENT_URL=http://127.0.0.1:8788 pnpm --filter web exec next start --port 3288        (own terminal, stop it by its pid after)
//   P87_PROOF=1 PREVIEW_URL=http://localhost:3288 pnpm --filter web exec playwright test p87 --project=phone --workers=1
// Screenshots are written only when P87_PROOF is set, to design/proof/p87 (390 wide). No agent runs: the stand-in only takes the posts, and the end of a session is best effort.

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p87')
async function proof(page: Page, name: string) {
  if (!process.env.P87_PROOF) return
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
const STAND_IN_PORT = Number(process.env.STAND_IN_AGENT_PORT ?? 8788)
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

const LINE_UP: Question['diagram'] = { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'line', m: 2, c: 1 }] }
const LINE_DOWN: Question['diagram'] = { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5, graphs: [{ type: 'line', m: -1, c: 3 }] }
const RIGHT_TRIANGLE: Question['diagram'] = { kind: 'triangle', vertices: ['A', 'B', 'C'], angles: [90, 60, 30], angleLabels: ['', '60°', 'x'] }

const LINE_NAME = 'A grid from -5 to 5 with a straight line'
const TRIANGLE_NAME = 'Triangle ABC. Right angle at A. Angle B is 60°. Angle C is x.'

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
  ...[1, 2, 3, 4, 5].map((n) => q(1, `What is ${n} + ${n}?`, `${2 * n}`, 'number')),
  q(2, 'What is the gradient of this line?', '2', 'number', { diagram: LINE_UP }),
  q(2, 'Find the size of angle x.', '30', 'number', { diagram: RIGHT_TRIANGLE }),
  q(2, 'What is 3 - 6?', '-3', 'number'),
  q(2, 'What is 2 - 7?', '-5', 'number'),
  q(2, 'What is 4 - 9?', '-5', 'number'),
  q(3, 'Where does this line cut the y-axis? Give the point.', '(0; 3)', 'point', { diagram: LINE_DOWN }),
  ...[2, 3, 4, 5].map((n) => q(3, `What is ${n} - ${n + 5}?`, '-5', 'number')),
]
const WARMUP: Question[] = [
  q(1, 'What is x^2 when x = 3?', 'B', 'choice', { choices: ['6', '9', '8', '5'] }),
  q(1, 'Which is the same as 2x + x?', 'A', 'choice', { choices: ['3x', '2x^2', '3', '2x'] }),
]

/** The families of a Grade 10 map, by term of the sandbox map (it has topics in terms 1 to 4). */
const FAMILY_OF_TERM = { 1: 'algebra', 2: 'functions', 3: 'trigonometry', 4: 'analytical_geometry' } as const

/** The sandbox class made Grade 10 with a Grade 10 map, and the planned session's lesson made the lesson above. */
async function makeSenior(childId: string, classId: string): Promise<string> {
  const db = admin()
  expect((await db.from('classes').update({ grade: 10, subject: 'Mathematics' }).eq('id', classId)).error).toBeNull()
  expect((await db.from('children').update({ grade: 10 }).eq('id', childId)).error).toBeNull()
  const map = (await db.from('curriculum_maps').select('id').eq('class_id', classId).eq('status', 'approved').single()).data!
  for (const [term, family] of Object.entries(FAMILY_OF_TERM)) {
    expect((await db.from('topics').update({ family }).eq('map_id', map.id).eq('term', Number(term))).error).toBeNull()
  }
  const session = (await db.from('sessions').select('id, lesson_id').eq('child_id', childId).eq('status', 'planned').not('lesson_id', 'is', null).single()).data!
  const old = LessonSchema.parse((await db.from('lessons').select('content').eq('id', session.lesson_id!).single()).data!.content)
  const lesson: Lesson = { ...old, title: 'Graphs and triangles', warmup: WARMUP, questions: QUESTIONS }
  expect(LessonSchema.safeParse(lesson).success).toBe(true)
  for (const question of QUESTIONS) if (question.diagram) expect(pictureProblem(question.diagram)).toBeNull()
  expect((await db.from('lessons').update({ content: lesson as unknown as NonNullable<Json> }).eq('id', session.lesson_id!)).error).toBeNull()
  expect((await db.from('sessions').update({ warmup: WARMUP as unknown as NonNullable<Json> }).eq('id', session.id)).error).toBeNull()
  return session.id
}

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)

const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true })
const answerBox = (page: Page) => page.getByLabel('Your answer', { exact: true })

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

/** The picture of the question is on the screen: an image with its spoken description, under the words and above the answer box, at most 300 px tall, inside the screen. */
async function seesThePicture(page: Page, name: string, answer: Locator) {
  const picture = page.getByRole('img', { name, exact: true })
  await expect(picture).toBeVisible()
  const box = (await picture.boundingBox())!
  const words = (await page.locator('h1[data-prompt]').boundingBox())!
  const below = (await answer.first().boundingBox())!
  expect(box.height).toBeLessThanOrEqual(300)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(box.y).toBeGreaterThanOrEqual(words.y + words.height - 1)
  expect(box.y + box.height).toBeLessThanOrEqual(below.y + 1)
  // The description of a picture in a question never says the equation of the line or the angle that is asked for.
  expect(name).not.toMatch(/y =|2x|-x/)
}

test.describe('a learner of a Grade 10 class meets a graph and a triangle in a question', () => {
  test('the pictures are on the screen, the answers are typed and marked, the results show the picture of the missed question, and My maths lists the map', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the learner screens are phone screens')
    const sb = await openSandbox(page, { stage: 'marked', role: 'learner' })
    opened.push(sb)
    const sessionId = await makeSenior(sb.childId, sb.classId)
    await toTheFirstQuestion(page)

    // Question 1: a line on a grid. The gradient is typed in one box.
    await expect(page.locator('h1[data-prompt]')).toHaveAttribute('data-prompt', 'What is the gradient of this line?')
    await seesThePicture(page, LINE_NAME, answerBox(page))
    await expect(page.locator('[data-picture] svg path[data-graph]')).toHaveCount(1)
    await noHorizontalScroll(page)
    await proof(page, 'line')
    await answerBox(page).fill('2')
    await next(page).click()

    // Question 2: a triangle with a right angle and an angle called x.
    await check(page.getByText('Question 2 of 5')).toBeVisible()
    await expect(page.locator('h1[data-prompt]')).toHaveAttribute('data-prompt', 'Find the size of angle x.')
    await seesThePicture(page, TRIANGLE_NAME, answerBox(page))
    await expect(page.locator('[data-picture] svg path[data-mark="right"]')).toHaveCount(1)
    // Only the labels the model gave are on the picture: the angle that is asked for is x, the 30 that draws the shape is not written.
    await expect(page.locator('[data-picture] svg text[data-angle]')).toHaveText(['60°', 'x'])
    await expect(page.locator('[data-picture] svg')).not.toContainText('30')
    await noHorizontalScroll(page)
    await proof(page, 'triangle')
    await answerBox(page).fill('30')
    await next(page).click()

    // Question 3: another line, and a point to type (the picture sits above the two boxes).
    await check(page.getByText('Question 3 of 5')).toBeVisible()
    await seesThePicture(page, LINE_NAME, page.getByLabel('x of the point'))
    await page.getByLabel('x of the point').fill('0')
    await page.getByLabel('y of the point').fill('2')
    await noHorizontalScroll(page)
    await proof(page, 'point')
    await next(page).click()

    // Questions 4 and 5 have no picture: nothing is drawn for them, and no empty box is left.
    await check(page.getByText('Question 4 of 5')).toBeVisible()
    await expect(page.locator('[data-picture]')).toHaveCount(0)
    await answerBox(page).fill('3')
    await page.getByRole('button', { name: 'Minus sign', exact: true }).click()
    await expect(answerBox(page)).toHaveValue('-3')
    await next(page).click()
    await check(page.getByText('Question 5 of 5')).toBeVisible()
    await expect(page.locator('[data-picture]')).toHaveCount(0)
    await answerBox(page).fill('5')
    await page.getByRole('button', { name: 'Minus sign', exact: true }).click()
    await next(page).click()

    // The results show only the question that was missed, with its picture under the heading; now the answer is shown, the description has the equation.
    await check(page.getByRole('heading', { name: 'You finished, Amina!' })).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(1)
    const three = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Question 3' }) })
    await expect(three).toBeVisible()
    await expect(three.getByRole('img', { name: 'A grid from -5 to 5 with the line y = -x + 3', exact: true })).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'results')

    // What was stored: each answer as typed, marked by meaning.
    const rows = (await admin().from('session_items').select('position, phase, answer, correct').eq('session_id', sessionId).eq('phase', 'try').order('position')).data ?? []
    expect(rows.map((r) => r.correct)).toEqual([true, true, false, true, true])
    expect(rows.map((r) => r.answer)).toEqual(['2', '30', '(0; 2)', '-3', '-5'])

    // My maths: the parts of this class's own map, in the order of the map, and none of the six parts of primary school that the map does not have.
    await page.goto('/k/maths')
    const all = page.getByRole('region', { name: 'All of Mathematics' })
    await check(all).toBeVisible()
    const hrefs = await all.getByRole('link').evaluateAll((links) => links.map((l) => l.getAttribute('href')))
    expect(hrefs.slice(0, 4)).toEqual(['/k/maths/algebra', '/k/maths/functions', '/k/maths/trigonometry', '/k/maths/analytical_geometry'])
    await expect(all.getByRole('link', { name: /^Algebra/ })).toBeVisible()
    await expect(all).not.toContainText('Whole numbers')
    expect(hrefs).not.toContain('/k/maths/whole_numbers')
    await noHorizontalScroll(page)
    await proof(page, 'my-maths')

    // A part of the map opens, with its topics.
    await all.getByRole('link', { name: /^Algebra/ }).click()
    await check(page.getByRole('heading', { level: 1, name: 'Algebra' })).toBeVisible()
    await expect(page.locator('main li').first()).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'my-maths-algebra')
  })

  test('a question of the demo class has no picture: the screen is what it always was', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the learner screens are phone screens')
    const sb = await openSandbox(page, { stage: 'marked', role: 'learner' })
    opened.push(sb)
    await toTheFirstQuestion(page)
    await expect(page.locator('[data-picture]')).toHaveCount(0)
    await expect(page.locator('[data-keys]')).toHaveCount(0)
  })
})
