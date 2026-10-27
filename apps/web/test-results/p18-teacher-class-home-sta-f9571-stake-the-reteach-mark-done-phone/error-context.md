# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: p18.spec.ts >> teacher class home (stage marked) >> gap detail: who is stuck, the mistake, the reteach, mark done
- Location: e2e/p18.spec.ts:77:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('section[aria-labelledby="gaps"] > a').first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - heading "404" [level=1] [ref=e4]
    - heading "This page could not be found." [level=2] [ref=e6]
  - button "Open Next.js Dev Tools" [ref=e12] [cursor=pointer]
  - alert [ref=e16]
```

# Test source

```ts
  1   | import { resolve } from 'node:path'
  2   | import { createServiceClient } from '@jemma/profiling/db'
  3   | import { expect, test, type Page, type TestInfo } from '@playwright/test'
  4   | import { openSandbox, type OpenedSandbox } from './helpers/sandbox'
  5   | 
  6   | const admin = () =>
  7   |   createServiceClient({
  8   |     SUPABASE_URL: process.env.SUPABASE_URL!,
  9   |     SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  10  |   })
  11  | 
  12  | const actual = (board: string) => resolve(import.meta.dirname, `../../../design/actual/${board}.png`)
  13  | 
  14  | /** Design match gate: boards are phone-size, so screenshots are saved from the phone project only. */
  15  | async function shot(page: Page, testInfo: TestInfo, board: string) {
  16  |   if (testInfo.project.name !== 'phone') return
  17  |   await page.evaluate(() => document.fonts.ready)
  18  |   await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  19  |   await page.screenshot({ path: actual(board), fullPage: true })
  20  | }
  21  | 
  22  | async function noHorizontalScroll(page: Page) {
  23  |   const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  24  |   expect(wide).toBe(false)
  25  | }
  26  | 
  27  | let sandbox: OpenedSandbox | undefined
  28  | test.afterEach(async () => {
  29  |   await sandbox?.cleanup()
  30  |   sandbox = undefined
  31  | })
  32  | 
  33  | test.describe('teacher class home (stage marked)', () => {
  34  |   test('headline, Needs you, gaps in order, latest test, what Jemma did', async ({ page }, testInfo) => {
  35  |     sandbox = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  36  |     await page.goto(`/t/${sandbox.classId}`)
  37  | 
  38  |     await expect(page.getByRole('heading', { level: 1 })).toHaveText(
  39  |       '4 of 5 learners add the tops and the bottoms when adding fractions.',
  40  |     )
  41  |     await expect(page.getByRole('link', { name: 'See the papers it comes from' })).toBeVisible()
  42  | 
  43  |     await expect(page.getByRole('heading', { name: 'Needs you' })).toBeVisible()
  44  |     await expect(page.getByText("Check 1 answer on Sipho's paper")).toBeVisible()
  45  |     await expect(page.getByText('Class Test 1 · question 7 · I read 0,8')).toBeVisible()
  46  | 
  47  |     await expect(page.getByRole('heading', { name: "What the class doesn't get yet" })).toBeVisible()
  48  |     const gaps = page.locator('section[aria-labelledby="gaps"] > a')
  49  |     await expect(gaps).toHaveCount(3)
  50  |     await expect(gaps.nth(0)).toContainText('Adding fractions with different denominators')
  51  |     await expect(gaps.nth(0)).toContainText('4 of 5 learners')
  52  |     await expect(gaps.nth(0)).toContainText('Adds the tops and the bottoms: 1/2 + 1/4 = 2/6')
  53  |     await expect(gaps.nth(1)).toContainText('Adding decimals')
  54  |     await expect(gaps.nth(1)).toContainText('3 of 5 learners')
  55  |     await expect(gaps.nth(1)).toContainText('Lines up the last digits: 0,5 + 0,25 = 0,30')
  56  |     await expect(gaps.nth(2)).toContainText('Comparing fractions')
  57  |     await expect(gaps.nth(2)).toContainText('2 of 5 learners')
  58  | 
  59  |     await expect(page.getByText('Latest test', { exact: true })).toBeVisible()
  60  |     await expect(page.getByText('Class Test 1: Fractions and decimals')).toBeVisible()
  61  |     await expect(page.getByText('Written today · 5 papers · 1 answer still to check')).toBeVisible()
  62  |     await expect(page.getByText('Average', { exact: true })).toBeVisible()
  63  |     await expect(page.getByText('Range, %', { exact: true })).toBeVisible()
  64  |     await expect(page.getByText('Hardest', { exact: true })).toBeVisible()
  65  | 
  66  |     await expect(page.getByRole('heading', { name: 'What Jemma did', exact: true })).toBeVisible()
  67  |     await expect(page.getByText('Read 5 papers. 1 unsure, sent to you.')).toBeVisible()
  68  |     await expect(page.getByText('Found 3 class gaps and the mistake behind each one')).toBeVisible()
  69  |     await expect(page.getByText('Wrote a 10 minute reteach for adding fractions')).toBeVisible()
  70  |     await expect(page.getByText("Planned tonight's lesson for all 5 learners")).toBeVisible()
  71  |     await expect(page.getByText("Last night's lessons")).toHaveCount(0)
  72  | 
  73  |     await noHorizontalScroll(page)
  74  |     await shot(page, testInfo, 'teacher-class-home')
  75  |   })
  76  | 
  77  |   test('gap detail: who is stuck, the mistake, the reteach, mark done', async ({ page }, testInfo) => {
  78  |     sandbox = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  79  |     await page.goto(`/t/${sandbox.classId}`)
> 80  |     await page.locator('section[aria-labelledby="gaps"] > a').first().click()
      |                                                                       ^ Error: locator.click: Test timeout of 30000ms exceeded.
  81  |     await expect(page).toHaveURL(new RegExp(`/t/${sandbox.classId}/gaps/`))
  82  | 
  83  |     await expect(page.getByText('Class gap 1 of 3')).toBeVisible()
  84  |     await expect(page.getByRole('heading', { level: 1 })).toHaveText('Adding fractions with different denominators')
  85  |     await expect(
  86  |       page.getByText('4 of 5 add the tops and the bottoms. It points back to equivalent fractions, a Term 1 basic.'),
  87  |     ).toBeVisible()
  88  | 
  89  |     await expect(page.getByRole('heading', { name: "Who's stuck" })).toBeVisible()
  90  |     await expect(page.getByText('Wrote 2/6, 3/9 and 3 2/6')).toHaveCount(2)
  91  |     await expect(page.getByText('Wrote 2/6, 3/9 and 3 2/4')).toBeVisible()
  92  |     await expect(page.getByText('Wrote 2/6 and 3 2/6, got question 2 right')).toBeVisible()
  93  |     await expect(page.getByText('Lerato got all three right. A good partner for this.')).toBeVisible()
  94  | 
  95  |     await expect(page.getByRole('heading', { name: 'The mistake' })).toBeVisible()
  96  |     await expect(page.getByText('Seen 10 times on Class Test 1')).toBeVisible()
  97  |     await expect(page.getByText('1/2 + 1/4 = 2/6')).toBeVisible()
  98  |     await expect(page.getByText('4 learners')).toBeVisible()
  99  |     await expect(page.getByText('2/3 + 1/6 = 3/9')).toBeVisible()
  100 |     await expect(page.getByText('1 1/2 + 2 1/4 = 3 2/6')).toBeVisible()
  101 |     await expect(page.getByText("The bottom number says the size of the pieces. Halves and quarters are different sizes, so they can't be added until the bottoms match.")).toBeVisible()
  102 |     await expect(page.getByText('Equivalent fractions · Term 1')).toBeVisible()
  103 | 
  104 |     await expect(page.getByRole('heading', { name: 'Reteach tomorrow' })).toBeVisible()
  105 |     await expect(page.getByText('Fraction strips · 10 minutes · whole class')).toBeVisible()
  106 |     await expect(page.getByText('3 paper strips per learner, all the same length.')).toBeVisible()
  107 |     await expect(page.getByText('Fold one strip into halves and one into quarters.')).toBeVisible()
  108 |     await expect(page.getByText('Lay them side by side. How many quarters fit in a half? Write 1/2 = 2/4.')).toBeVisible()
  109 |     await expect(page.getByText('Add 1/2 + 1/4 with the strips. Count the quarters: 3/4. Ask why 2/6 is smaller than 1/2.')).toBeVisible()
  110 |     await expect(page.getByText('Exit question on the board: 1/3 + 1/6.')).toBeVisible()
  111 |     await expect(page.getByText("Jemma checks this gap again in each learner's next session.")).toBeVisible()
  112 |     await expect(page.getByRole('button', { name: 'Print' })).toBeVisible()
  113 | 
  114 |     await noHorizontalScroll(page)
  115 |     await shot(page, testInfo, 'teacher-gap')
  116 | 
  117 |     await page.getByRole('button', { name: 'Mark reteach done' }).click()
  118 |     await expect(page.getByRole('button', { name: 'Reteach done' })).toBeDisabled()
  119 |     const { data } = await admin().from('reteach_plans').select('done_at').eq('class_id', sandbox.classId)
  120 |     expect(data?.[0]?.done_at).not.toBeNull()
  121 |   })
  122 | 
  123 |   test('second gap has no reteach plan and still opens', async ({ page }) => {
  124 |     sandbox = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  125 |     await page.goto(`/t/${sandbox.classId}`)
  126 |     await page.locator('section[aria-labelledby="gaps"] > a').nth(1).click()
  127 |     await expect(page.getByText('Class gap 2 of 3')).toBeVisible()
  128 |     await expect(page.getByRole('heading', { level: 1 })).toHaveText('Adding decimals')
  129 |     await expect(page.getByRole('heading', { name: 'Reteach tomorrow' })).toHaveCount(0)
  130 |   })
  131 | })
  132 | 
  133 | test.describe('teacher class home, next morning (stage session_done)', () => {
  134 |   test('Amina moved to Practising', async ({ page }, testInfo) => {
  135 |     sandbox = await openSandbox(page, { stage: 'session_done', role: 'teacher' })
  136 |     await page.goto(`/t/${sandbox.classId}`)
  137 | 
  138 |     await expect(page.getByText(/^Class · \w{3} \d{1,2} \w{3}$/)).toBeVisible()
  139 |     await expect(page.getByRole('heading', { level: 1 })).toHaveText(
  140 |       'Adding fractions is still the gap. Amina started fixing it last night.',
  141 |     )
  142 |     await expect(page.getByRole('heading', { name: 'Needs you' })).toBeVisible()
  143 |     await expect(page.getByText("Nothing right now. Sipho's paper is done.")).toBeVisible()
  144 | 
  145 |     await expect(page.getByText('Today', { exact: true })).toBeVisible()
  146 |     await expect(page.getByText('Reteach adding fractions')).toBeVisible()
  147 |     await expect(page.getByText('Fraction strips · 10 minutes · plan ready')).toBeVisible()
  148 | 
  149 |     await expect(page.getByRole('heading', { name: "Last night's lessons" })).toBeVisible()
  150 |     await expect(page.getByText('Amina · 3 of 5')).toBeVisible()
  151 |     await expect(page.getByText('Adding fractions moved from New to Practising')).toBeVisible()
  152 |     await expect(page.getByText("Lerato, Naledi, Sipho and Thabo haven't done theirs yet.")).toBeVisible()
  153 | 
  154 |     const gaps = page.locator('section[aria-labelledby="gaps"] > a')
  155 |     await expect(gaps).toHaveCount(3)
  156 |     await expect(gaps.nth(0)).toContainText('4 of 5 learners · 1 practising, 3 new')
  157 |     for (const name of ['Amina', 'Thabo', 'Sipho', 'Naledi']) await expect(gaps.nth(0)).toContainText(name)
  158 |     await expect(gaps.nth(1)).toContainText('3 of 5 learners · 3 new')
  159 |     await expect(gaps.nth(1)).toContainText("Amina's lesson is")
  160 |     await expect(gaps.nth(2)).toContainText('2 of 5 learners · 2 new')
  161 | 
  162 |     await expect(page.getByRole('heading', { name: 'What Jemma did since yesterday' })).toBeVisible()
  163 |     await expect(page.getByText('Amina finished her lesson: 3 of 5. Moved her to Practising')).toBeVisible()
  164 |     await expect(page.getByText('Latest test', { exact: true })).toHaveCount(0)
  165 | 
  166 |     await noHorizontalScroll(page)
  167 |     await shot(page, testInfo, 'teacher-class-next')
  168 |   })
  169 | })
  170 | 
```