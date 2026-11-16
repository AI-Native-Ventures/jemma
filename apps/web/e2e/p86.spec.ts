import { mkdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'
import { createServiceClient, type Json } from '@jemma/profiling/db'
import { LessonSchema, type Lesson, type Question } from '@jemma/profiling/schemas'
import { expect, test as base, type Page, type Locator } from '@playwright/test'
import { mathField, writeAnswer, writtenLatex } from './helpers/math-field'
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

/** The box of an element that may be missing for a moment (the editor builds its keyboard again): wait until it has one. */
async function boxOf(target: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  let box: { x: number; y: number; width: number; height: number } | null = null
  await expect.poll(async () => ((box = await target.boundingBox()) !== null), { timeout: 10_000 }).toBe(true)
  return box!
}

const next = (page: Page) => page.getByRole('button', { name: 'Next', exact: true })
const answerBox = (page: Page) => page.getByLabel('Your answer', { exact: true })

/** From the learner's home to the first question on the screen: the warm-up, the lesson, "I'm ready", "Answer on the screen". */
async function toTheFirstQuestion(page: Page) {
  await page.goto('/k')
  await page.getByRole('link', { name: 'Start', exact: true }).click()
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

    // Question 1: an expression. The maths editor (P132), labelled "Your answer", with its help line. Next waits for something.
    await expect(page.locator('h1[data-prompt]')).toHaveAttribute('data-prompt', 'Simplify x + x + 3')
    const field = await mathField(page)
    await expect(field).toHaveAttribute('aria-label', 'Your answer')
    await expect(page.locator('input#answer')).toHaveCount(0)
    await expect(page.getByText('Type an expression, like 2x + 3.')).toBeVisible()
    await expect(next(page)).toBeDisabled()
    // In development the page has a round indicator at its bottom left (the Next.js dev tools, "Compiling"). The row of tabs is the last row of the keyboard
    // now, so the indicator sits on the Letters tab and takes the tap (CI run 3: "<nextjs-portal> intercepts pointer events"). It is not part of the app: it
    // is put away for this test.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important }' })
    // The keyboard of the editor comes up when the box is touched: our layout, six rows of ten keys (P140).
    await field.click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { mathVirtualKeyboard: { visible: boolean } }).mathVirtualKeyboard.visible)).toBe(true)
    const layoutId = await page.evaluate(() => (window as unknown as { mathVirtualKeyboard: { layouts: { id: string }[] } }).mathVirtualKeyboard.layouts[0]!.id)
    expect(layoutId).toMatch(/^jemma-expression-/)
    // The numbers, signs and fraction keys are on every tab; five word tabs change the two rows under them. This question ("Simplify x + x + 3") is algebra,
    // so the keyboard opens on Letters.
    const visibleLayer = () => page.locator('.MLK__layer.is-visible').first().getAttribute('id')
    // The editor shows its keyboard a moment after the touch (300 ms) and builds it once more then: it is measured when it has settled.
    await page.waitForTimeout(900)
    expect(await visibleLayer()).toBe('jemma-letters')
    const showKeyboard = async () => {
      // A change of the window size may put the keyboard away: it is brought back if it went, and measured when it has settled.
      const up = await page.evaluate(() => (window as unknown as { mathVirtualKeyboard: { visible: boolean } }).mathVirtualKeyboard.visible)
      if (!up) await page.evaluate(() => (window as unknown as { mathVirtualKeyboard: { show(): void } }).mathVirtualKeyboard.show())
      await page.waitForTimeout(900)
    }
    // Every key of the visible tab (the blank ones apart): its size and whether what is on it sticks out of it.
    type KeyBox = { name: string; width: number; height: number; overflowX: boolean; overflowY: boolean; detail: string }
    const measureKeys = (): Promise<KeyBox[]> =>
      page.locator('.MLK__layer.is-visible .MLK__keycap:not(.separator)').evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect()
          // How far anything inside the key reaches past the key (the parts of a drawn fraction are positioned, so they can reach further than the face).
          let right = 0
          let bottom = 0
          for (const d of Array.from(el.querySelectorAll('*'))) {
            const b = d.getBoundingClientRect()
            if (b.width === 0 && b.height === 0) continue
            right = Math.max(right, b.right - r.right)
            bottom = Math.max(bottom, b.bottom - r.bottom)
          }
          const detail = `scroll ${el.scrollWidth}x${el.scrollHeight}, client ${el.clientWidth}x${el.clientHeight}, inside reaches ${right.toFixed(1)} right and ${bottom.toFixed(1)} below`
          return { name: (el.getAttribute('data-tooltip') ?? el.textContent ?? '').trim(), width: r.width, height: r.height, overflowX: el.scrollWidth > el.clientWidth + 1, overflowY: el.scrollHeight > el.clientHeight + 1, detail }
        }),
      )
    // Each key is at least 44 px tall (and at least 30 px wide from 360 px up: a tenth of the width less the gap), and nothing sticks out of any key.
    const checkKeys = async (label: string, width: number) => {
      await showKeyboard()
      // The keys drawn with the keycap class: every key but the blanks and the action keys (the five tabs, backspace and the two arrows, which are
      // measured below). That is 31 on the tab with the fewest keys (Compare: 32), 43 on Letters.
      await expect.poll(async () => (await measureKeys()).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(30)
      const keys = await measureKeys()
      // Soft checks: a failure at one width does not hide the others (the test still fails at the end).
      expect.soft(keys.filter((k) => k.height < 44).map((k) => `${k.name} ${k.height}`), `${label}: keys under 44 px tall`).toEqual([])
      if (width >= 360) expect.soft(keys.filter((k) => k.width < 30).map((k) => `${k.name} ${k.width}`), `${label}: keys under 30 px wide`).toEqual([])
      expect.soft(keys.filter((k) => k.overflowX || k.overflowY).map((k) => `${k.name}: ${k.detail}`), `${label}: keys with something sticking out`).toEqual([])
    }
    // The row of tabs: five words, each one line, 11 to 15 px, and inside its key.
    const tabFaces = async (label: string) => {
      await showKeyboard()
      const tabs = page.locator('.MLK__layer.is-visible .tab')
      await expect(tabs).toHaveCount(5)
      await expect(tabs.first()).toBeVisible()
      expect((await tabs.allTextContents()).map((t) => t.trim())).toEqual(['Letters', 'Trig', 'Compare', 'Shapes', 'Calculus'])
      for (let i = 0; i < 5; i++) {
        const at = `${label}, tab ${i}`
        const key = await boxOf(tabs.nth(i))
        const face = await boxOf(tabs.nth(i).locator('.tab-face'))
        expect(key.width, at).toBeGreaterThanOrEqual(44)
        expect(key.height, at).toBeGreaterThanOrEqual(44)
        expect(face.height, at).toBeLessThanOrEqual(20)
        expect(face.x, at).toBeGreaterThanOrEqual(key.x - 0.5)
        expect(face.x + face.width, at).toBeLessThanOrEqual(key.x + key.width + 0.5)
        const px = parseFloat(await tabs.nth(i).locator('.tab-face').evaluate((el) => getComputedStyle(el).fontSize))
        expect(px, at).toBeGreaterThanOrEqual(11)
        expect(px, at).toBeLessThanOrEqual(15)
      }
    }
    await checkKeys('390 px', 390)
    await tabFaces('390 px')
    await noHorizontalScroll(page)
    for (const width of [360, 320, 430, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await checkKeys(`${width} px`, width)
      await tabFaces(`${width} px`)
      if (width === 360 || width === 390) await noHorizontalScroll(page)
    }
    await showKeyboard()
    await expect(page.locator('.MLK__layer.is-visible .tab').first()).toBeVisible()
    await proof(page, 'expression-keyboard')
    // Each tab is opened by clicking its word, and the digits row is there on every one of them.
    const tab = (word: string) => page.locator('.MLK__layer.is-visible .tab', { hasText: word }).first()
    const TABS: [string, string][] = [['Trig', 'jemma-trig'], ['Compare', 'jemma-compare'], ['Shapes', 'jemma-shapes'], ['Calculus', 'jemma-calculus'], ['Letters', 'jemma-letters']]
    for (const [word, id] of TABS) {
      await tab(word).click()
      await expect.poll(visibleLayer).toBe(id)
      await expect(page.locator('.MLK__layer.is-visible .tab.is-current-tab')).toHaveText(word)
      for (const digit of '1234567890') await expect(page.locator(`.MLK__layer.is-visible .MLK__keycap[data-keycap-value="${digit}"]`).first()).toBeVisible()
      await checkKeys(`${word} tab`, 390)
    }
    // The Letters tab has the letters, italic, apart from the signs.
    await page.locator('.MLK__layer.is-visible .MLK__keycap[data-keycap-value="k"]').first().click()
    expect(await writtenLatex(page)).toBe('k')
    await proof(page, 'expression-letters')
    // The keys write into the box: a digit, the plus on the signs row, and the fraction (a top and a bottom). The digits are on this tab too.
    await page.locator('.MLK__layer.is-visible .MLK__keycap[data-keycap-value="7"]').first().click()
    await page.locator('.MLK__layer.is-visible .MLK__keycap[data-tooltip="plus"], .MLK__layer.is-visible .MLK__keycap[data-keycap-value="+"]').first().click()
    await page.locator('.MLK__layer.is-visible .MLK__keycap[data-keycap-value="3"]').first().click()
    expect(await writtenLatex(page)).toBe('k7+3')
    await page.locator('.MLK__layer.is-visible .MLK__keycap[data-tooltip="fraction"], .MLK__layer.is-visible .MLK__keycap[data-keycap-value*="frac"]').first().click()
    expect(await writtenLatex(page)).toContain('\\frac')
    // Tapping outside the box puts the keyboard away (the box loses the focus; the editor hides its keyboard a moment after).
    await page.locator('h1[data-prompt]').click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { mathVirtualKeyboard: { visible: boolean } }).mathVirtualKeyboard.visible), { timeout: 15_000 }).toBe(false)
    await writeAnswer(page, '3+2x')
    await expect(next(page)).toBeEnabled()
    await noHorizontalScroll(page)
    await proof(page, 'expression')
    await next(page).click()

    // Question 2: an equation, with two answers and the word between them.
    await check(page.getByText('Question 2 of 5')).toBeVisible()
    await expect(page.getByText('Type the answer, like x = 4. Two answers: x = 3 or x = -1.')).toBeVisible()
    await expect(next(page)).toBeDisabled()
    await writeAnswer(page, 'x=-1\\text{ or }x=3')
    await expect(next(page)).toBeEnabled()
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

    // Question 4: a number that may be negative, in the same editor.
    await check(page.getByText('Question 4 of 5')).toBeVisible()
    await expect(page.getByText('Type a number. It may be negative, like -3.')).toBeVisible()
    await writeAnswer(page, '-3')
    await expect(next(page)).toBeEnabled()
    await noHorizontalScroll(page)
    await proof(page, 'number')
    await next(page).click()

    // Question 5: an expression that has to be factorised. The line says so; x^2 - 4 is not in that form.
    await check(page.getByText('Question 5 of 5')).toBeVisible()
    await expect(page.getByText('Type it as a product of brackets, like (x + 2)(x - 2).')).toBeVisible()
    await writeAnswer(page, 'x^{2}-4')
    await expect(next(page)).toBeEnabled()
    await noHorizontalScroll(page)
    await proof(page, 'factorised')
    await next(page).click()

    // The results show every question (P126): 3 and 5 were missed and are corrected, with the answers in their notation; the other three are confirmed.
    await check(page.getByRole('heading', { name: 'You finished, Amina!' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Question 3' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Question 5' })).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(5)
    await expect(page.locator('article[data-verdict="missed"]')).toHaveCount(2)
    await expect(page.locator('article[data-verdict="right"]')).toHaveCount(3)
    await expect(page.getByText('You got 3 of 5 right.')).toBeVisible()
    const five = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Question 5' }) })
    await expect(five.locator('[data-question] .msupsub')).toHaveText('2')
    await expect(five.locator('.msupsub').first()).toBeVisible()
    await noHorizontalScroll(page)
    await proof(page, 'results')

    // What was stored: each answer as typed, marked by meaning.
    const rows = (await admin().from('session_items').select('position, phase, answer, correct').eq('session_id', sessionId).eq('phase', 'try').order('position')).data ?? []
    expect(rows.map((r) => r.correct)).toEqual([true, true, false, true, false])
    expect(rows.map((r) => r.answer)).toEqual(['3 + 2x', 'x = -1 or x = 3', '(-3; 2)', '-3', 'x^2 - 4'])
  })

  test('the demo path boxes are the ones they always were: a fraction question of a Grade 6 class has no maths keys', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'the learner screens are phone screens')
    const sb = await openSandbox(page, { stage: 'marked', role: 'learner' })
    opened.push(sb)
    await toTheFirstQuestion(page)
    await expect(page.locator('math-field')).toHaveCount(0)
    await expect(page.locator('[data-keys]')).toHaveCount(0)
    await expect(page.locator('[data-point]')).toHaveCount(0)
    await expect(page.locator('[data-reads]')).toHaveCount(0)
  })
})
