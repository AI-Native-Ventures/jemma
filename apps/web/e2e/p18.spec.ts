import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

const actual = (board: string) => resolve(import.meta.dirname, `../../../design/actual/${board}.png`)

/** Design match gate: boards are phone-size, so screenshots are saved from the phone project only. */
async function shot(page: Page, testInfo: TestInfo, board: string) {
  if (testInfo.project.name !== 'phone') return
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  await page.screenshot({ path: actual(board), fullPage: true })
}

async function noHorizontalScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(wide).toBe(false)
}

let sandbox: OpenedSandbox | undefined
test.afterEach(async () => {
  await sandbox?.cleanup()
  sandbox = undefined
})

test.describe('teacher class home (stage marked)', () => {
  test('headline, Needs you, gaps in order, latest test, what Jemma did', async ({ page }, testInfo) => {
    sandbox = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    await page.goto(`/t/${sandbox.classId}`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      '4 of 5 learners add the tops and the bottoms when adding fractions.',
    )
    await expect(page.getByRole('link', { name: 'See the papers it comes from' })).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Needs you' })).toBeVisible()
    await expect(page.getByText("Check 1 answer on Sipho's paper")).toBeVisible()
    await expect(page.getByText('Class Test 1 · question 7 · I read 0,8')).toBeVisible()

    await expect(page.getByRole('heading', { name: "What the class doesn't get yet" })).toBeVisible()
    const gaps = page.locator('section[aria-labelledby="gaps"] > a')
    await expect(gaps).toHaveCount(3)
    await expect(gaps.nth(0)).toContainText('Adding fractions with different denominators')
    await expect(gaps.nth(0)).toContainText('4 of 5 learners')
    await expect(gaps.nth(0)).toContainText('Adds the tops and the bottoms: 1/2 + 1/4 = 2/6')
    await expect(gaps.nth(1)).toContainText('Adding decimals')
    await expect(gaps.nth(1)).toContainText('3 of 5 learners')
    await expect(gaps.nth(1)).toContainText('Lines up the last digits: 0,5 + 0,25 = 0,30')
    await expect(gaps.nth(2)).toContainText('Comparing fractions')
    await expect(gaps.nth(2)).toContainText('2 of 5 learners')

    await expect(page.getByText('Latest test', { exact: true })).toBeVisible()
    await expect(page.getByText('Class Test 1: Fractions and decimals')).toBeVisible()
    await expect(page.getByText('Written today · 5 papers · 1 answer still to check')).toBeVisible()
    await expect(page.getByText('Average', { exact: true })).toBeVisible()
    await expect(page.getByText('Range, %', { exact: true })).toBeVisible()
    await expect(page.getByText('Hardest', { exact: true })).toBeVisible()

    await expect(page.getByRole('heading', { name: 'What Jemma did', exact: true })).toBeVisible()
    await expect(page.getByText('Read 5 papers. 1 unsure, sent to you.')).toBeVisible()
    await expect(page.getByText('Found 3 class gaps and the mistake behind each one')).toBeVisible()
    await expect(page.getByText('Wrote a 10 minute reteach for adding fractions')).toBeVisible()
    await expect(page.getByText("Planned tonight's lesson for all 5 learners")).toBeVisible()
    await expect(page.getByText("Last night's lessons")).toHaveCount(0)

    await noHorizontalScroll(page)
    await shot(page, testInfo, 'teacher-class-home')
  })

  test('gap detail: who is stuck, the mistake, the reteach, mark done', async ({ page }, testInfo) => {
    sandbox = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    await page.goto(`/t/${sandbox.classId}`)
    await page.locator('section[aria-labelledby="gaps"] > a').first().click()
    await expect(page).toHaveURL(new RegExp(`/t/${sandbox.classId}/gaps/`))

    await expect(page.getByText('Class gap 1 of 3')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Adding fractions with different denominators')
    await expect(
      page.getByText('4 of 5 add the tops and the bottoms. It points back to equivalent fractions, a Term 1 basic.'),
    ).toBeVisible()

    await expect(page.getByRole('heading', { name: "Who's stuck" })).toBeVisible()
    await expect(page.getByText('Wrote 2/6, 3/9 and 3 2/6')).toHaveCount(2)
    await expect(page.getByText('Wrote 2/6, 3/9 and 3 2/4')).toBeVisible()
    await expect(page.getByText('Wrote 2/6 and 3 2/6, got question 2 right')).toBeVisible()
    await expect(page.getByText('Lerato got all three right. A good partner for this.')).toBeVisible()

    await expect(page.getByRole('heading', { name: 'The mistake' })).toBeVisible()
    await expect(page.getByText('Seen 10 times on Class Test 1')).toBeVisible()
    await expect(page.getByText('1/2 + 1/4 = 2/6')).toBeVisible()
    await expect(page.getByText('4 learners')).toBeVisible()
    await expect(page.getByText('2/3 + 1/6 = 3/9')).toBeVisible()
    await expect(page.getByText('1 1/2 + 2 1/4 = 3 2/6')).toBeVisible()
    await expect(page.getByText("The bottom number says the size of the pieces. Halves and quarters are different sizes, so they can't be added until the bottoms match.")).toBeVisible()
    await expect(page.getByText('Equivalent fractions · Term 1')).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Reteach tomorrow' })).toBeVisible()
    await expect(page.getByText('Fraction strips · 10 minutes · whole class')).toBeVisible()
    await expect(page.getByText('3 paper strips per learner, all the same length.')).toBeVisible()
    await expect(page.getByText('Fold one strip into halves and one into quarters.')).toBeVisible()
    await expect(page.getByText('Lay them side by side. How many quarters fit in a half? Write 1/2 = 2/4.')).toBeVisible()
    await expect(page.getByText('Add 1/2 + 1/4 with the strips. Count the quarters: 3/4. Ask why 2/6 is smaller than 1/2.')).toBeVisible()
    await expect(page.getByText('Exit question on the board: 1/3 + 1/6.')).toBeVisible()
    await expect(page.getByText("Jemma checks this gap again in each learner's next session.")).toBeVisible()
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible()

    await noHorizontalScroll(page)
    await shot(page, testInfo, 'teacher-gap')

    await page.getByRole('button', { name: 'Mark reteach done' }).click()
    await expect(page.getByRole('button', { name: 'Reteach done' })).toBeDisabled()
    const { data } = await admin().from('reteach_plans').select('done_at').eq('class_id', sandbox.classId)
    expect(data?.[0]?.done_at).not.toBeNull()
  })

  test('second gap has no reteach plan and still opens', async ({ page }) => {
    sandbox = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    await page.goto(`/t/${sandbox.classId}`)
    await page.locator('section[aria-labelledby="gaps"] > a').nth(1).click()
    await expect(page.getByText('Class gap 2 of 3')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Adding decimals')
    await expect(page.getByRole('heading', { name: 'Reteach tomorrow' })).toHaveCount(0)
  })
})

test.describe('teacher class home, next morning (stage session_done)', () => {
  test('Amina moved to Practising', async ({ page }, testInfo) => {
    sandbox = await openSandbox(page, { stage: 'session_done', role: 'teacher' })
    await page.goto(`/t/${sandbox.classId}`)

    await expect(page.getByText(/^Class · \w{3} \d{1,2} \w{3}$/)).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Adding fractions is still the gap. Amina started fixing it last night.',
    )
    await expect(page.getByRole('heading', { name: 'Needs you' })).toBeVisible()
    await expect(page.getByText("Nothing right now. Sipho's paper is done.")).toBeVisible()

    await expect(page.getByText('Today', { exact: true })).toBeVisible()
    await expect(page.getByText('Reteach adding fractions')).toBeVisible()
    await expect(page.getByText('Fraction strips · 10 minutes · plan ready')).toBeVisible()

    await expect(page.getByRole('heading', { name: "Last night's lessons" })).toBeVisible()
    await expect(page.getByText('Amina · 3 of 5')).toBeVisible()
    await expect(page.getByText('Adding fractions moved from New to Practising')).toBeVisible()
    await expect(page.getByText("Lerato, Naledi, Sipho and Thabo haven't done theirs yet.")).toBeVisible()

    const gaps = page.locator('section[aria-labelledby="gaps"] > a')
    await expect(gaps).toHaveCount(3)
    await expect(gaps.nth(0)).toContainText('4 of 5 learners · 1 practising, 3 new')
    for (const name of ['Amina', 'Thabo', 'Sipho', 'Naledi']) await expect(gaps.nth(0)).toContainText(name)
    await expect(gaps.nth(1)).toContainText('3 of 5 learners · 3 new')
    await expect(gaps.nth(1)).toContainText("Amina's lesson is")
    await expect(gaps.nth(2)).toContainText('2 of 5 learners · 2 new')

    await expect(page.getByRole('heading', { name: 'What Jemma did since yesterday' })).toBeVisible()
    await expect(page.getByText('Amina finished her lesson: 3 of 5. Moved her to Practising')).toBeVisible()
    await expect(page.getByText('Latest test', { exact: true })).toHaveCount(0)

    await noHorizontalScroll(page)
    await shot(page, testInfo, 'teacher-class-next')
  })
})
